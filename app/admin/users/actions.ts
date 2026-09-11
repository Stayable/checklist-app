"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Locale, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assignableRolesFor, canAdministerUser, requireUserAdmin } from "@/lib/rbac";
import { generateTempPassword, validatePasswordStrength } from "@/lib/password";

// Admin user-management server actions (Phase 2). Every one writes an
// audit_log entry. Resend is deferred, so create/reset return a one-time temp
// password for the admin to convey rather than emailing an activation link.
//
// AUTHORIZATION (widened 2026-09-11, Kyle). These required ADMIN; they now
// require ADMIN **or CORPORATE** (requireUserAdmin), with two limits that make
// the distinction real rather than decorative:
//
//   1. CORPORATE may not act on an ADMIN account — canAdministerUser. Without
//      it, a corporate user could reset admin@'s password and sign in as ADMIN.
//   2. CORPORATE may not GRANT the ADMIN role — assignableRolesFor. Without it
//      they could promote themselves and reach (1) the long way round.
//
// Both are checked HERE, against the target's role read fresh from the
// database. An exported server action is a live HTTP endpoint — the client
// hiding a button proves nothing.

const BCRYPT_COST = 12;

export type ActionResult =
  | { ok: true; tempPassword?: string; message?: string }
  | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  role: z.nativeEnum(Role),
  locale: z.nativeEnum(Locale).default(Locale.en),
  // Location. Defaults to on-site so a forgotten checkbox leaves a new hire
  // assignable rather than invisible — same reasoning as the column default in
  // schema.prisma.
  remote: z.boolean().default(false),
  propertyIds: z.array(z.string().uuid()).default([]),
});

/**
 * Load the target and confirm the actor may touch it.
 *
 * Every mutation below funnels through this so the ADMIN-target rule has one
 * implementation. Returns the row rather than a boolean because callers need
 * the email for the audit entry anyway, and re-reading it would leave a window
 * where the role checked is not the role written.
 */
async function loadTarget(actorRole: Role, userId: string) {
  const idOk = z.string().uuid().safeParse(userId);
  if (!idOk.success) return { ok: false as const, error: "Invalid user." };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, remote: true, active: true },
  });
  if (!target) return { ok: false as const, error: "User not found." };

  if (!canAdministerUser(actorRole, target.role)) {
    // Says what the rule is, not merely that it was refused — the person
    // hitting this is an authorised corporate user, not an attacker probing.
    return {
      ok: false as const,
      error: "Only an ADMIN can manage an ADMIN account.",
    };
  }
  return { ok: true as const, target };
}

async function writeAudit(
  actorUserId: string,
  entityId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorUserId, entityType: "user", entityId, action, after: after ?? undefined },
  });
}

export async function createUser(input: unknown): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, role, locale, remote, propertyIds } = parsed.data;

  // A CORPORATE creator may not mint an ADMIN — the escalation route that
  // canAdministerUser alone would not close, since a brand-new account has no
  // existing role to check.
  if (!assignableRolesFor(admin.role).includes(role)) {
    return { ok: false, error: `You can't create an account with the ${role} role.` };
  }

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "A user with that email already exists." };

  // Scoped roles need at least one property; portfolio roles span all.
  const portfolio = role === Role.CORPORATE || role === Role.ADMIN;
  if (!portfolio && propertyIds.length === 0) {
    return { ok: false, error: "Assign at least one property for this role." };
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);

  const user = await db.user.create({
    data: {
      name,
      email,
      role,
      locale,
      remote,
      passwordHash,
      properties: portfolio
        ? undefined
        : { create: propertyIds.map((propertyId) => ({ propertyId })) },
    },
    select: { id: true },
  });

  await writeAudit(admin.id, user.id, "create", { email, role, remote });
  revalidatePath("/admin/users");
  return { ok: true, tempPassword, message: `Created ${email}.` };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (userId === admin.id) {
    return { ok: false, error: "You can't change your own active status." };
  }
  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  await db.user.update({ where: { id: userId }, data: { active } });
  await writeAudit(admin.id, userId, active ? "reactivate" : "deactivate");
  revalidatePath("/admin/users");
  return { ok: true, message: active ? "User reactivated." : "User deactivated." };
}

export async function resetPassword(userId: string): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
  // Clear any lockout so the new password works immediately.
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
  });
  await writeAudit(admin.id, userId, "reset_password");
  return { ok: true, tempPassword, message: "Password reset. Share the temp password securely." };
}

/**
 * Clear a failed-login lockout (ADR-008: 5 failures in 15 min => 30 min lock)
 * WITHOUT touching the password.
 *
 * resetPassword and setUserPassword also clear the lock, but only as a side
 * effect of overwriting the credential. This is the path for handing access
 * back to someone who still knows their password — the common case, since the
 * lock is triggered by typos and stale autofill as often as by a forgotten
 * password.
 *
 * Idempotent by design: clearing an already-expired lock is a no-op on the
 * user's ability to sign in, so a stale page render can't do harm.
 */
export async function unlockUser(userId: string): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;

  // Re-read for the two lockout columns loadTarget does not select; the role
  // check above already settled whether this row may be touched at all.
  const target = await db.user.findUniqueOrThrow({
    where: { id: found.target.id },
    select: { id: true, email: true, failedLoginAttempts: true, lockedUntil: true },
  });

  await db.user.update({
    where: { id: target.id },
    data: { failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
  });
  // Record what was cleared, not just that something was: an account that keeps
  // reappearing here is a person who does not know their password.
  await writeAudit(admin.id, target.id, "unlock_account", {
    email: target.email,
    clearedLockedUntil: target.lockedUntil ? target.lockedUntil.toISOString() : null,
    clearedFailedAttempts: target.failedLoginAttempts,
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `Lockout cleared for ${target.email}. Password unchanged.` };
}

/** Set a specific password chosen by the admin (vs. resetPassword's random temp). */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const weak = validatePasswordStrength(password);
  if (weak) return { ok: false, error: weak };

  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const target = found.target;

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  // Clear any lockout so the new password works immediately.
  await db.user.update({
    where: { id: target.id },
    data: { passwordHash, failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
  });
  await writeAudit(admin.id, target.id, "set_password", { email: target.email });
  return { ok: true, message: `Password set for ${target.email}.` };
}

const propsSchema = z.object({
  userId: z.string().uuid(),
  propertyIds: z.array(z.string().uuid()),
});

export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  if (admin.id === userId) return { ok: false, error: "You can't delete your own account." };
  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;

  const [auditCount, assigned, reviewed, issues, rules, notifs] = await Promise.all([
    db.auditLog.count({ where: { actorUserId: userId } }),
    db.checklistInstance.count({ where: { assignedUserId: userId } }),
    db.checklistInstance.count({ where: { reviewedByUserId: userId } }),
    db.issue.count({ where: { assignedUserId: userId } }),
    db.recurringRule.count({ where: { createdByUserId: userId } }),
    db.notificationLog.count({ where: { userId } }),
  ]);
  const history = auditCount + assigned + reviewed + issues + rules + notifs;
  if (history > 0) {
    return { ok: false, error: "This user has activity history — deactivate them instead of deleting." };
  }

  const target = found.target;

  // No history → user_properties cascade-deletes; safe hard delete.
  await db.user.delete({ where: { id: userId } });
  await writeAudit(admin.id, userId, "delete", { email: target.email });
  revalidatePath("/admin/users");
  return { ok: true, message: `Deleted ${target.email}.` };
}

export async function setUserProperties(input: unknown): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const parsed = propsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { userId, propertyIds } = parsed.data;

  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const portfolio = found.target.role === Role.CORPORATE || found.target.role === Role.ADMIN;
  if (!portfolio && propertyIds.length === 0) {
    return { ok: false, error: "Scoped users need at least one property." };
  }

  // Replace the membership set wholesale inside a transaction.
  await db.$transaction([
    db.userProperty.deleteMany({ where: { userId } }),
    db.userProperty.createMany({
      data: propertyIds.map((propertyId) => ({ userId, propertyId })),
    }),
  ]);
  await writeAudit(admin.id, userId, "set_properties", { propertyIds });
  revalidatePath("/admin/users");
  return { ok: true, message: "Property assignments updated." };
}

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(Role),
});

/**
 * Change a user's role (new 2026-09-11, Kyle — there was no role-change path at
 * all; a wrong role meant deleting and recreating the account, which the
 * activity-history guard in deleteUser makes impossible once they have worked).
 *
 * Three checks, in order, because each closes a different door:
 *   • loadTarget  — may the actor touch THIS account (not an ADMIN, unless the
 *                   actor is one)?
 *   • assignable  — may the actor grant THIS role (CORPORATE cannot grant ADMIN)?
 *   • self        — an actor may not change their own role. Not a privilege
 *                   question but a lockout one: an ADMIN demoting themselves
 *                   with no second admin account leaves nobody who can undo it,
 *                   and admin@ is the only other ADMIN today.
 *
 * Deliberately does NOT touch user_properties. A MANAGER promoted to CORPORATE
 * keeps their rows — portfolio roles ignore them (isPortfolioRole short-circuits
 * canAccessProperty), so they are inert, and they are exactly what a demotion
 * back would need. Clearing them would silently destroy the scope.
 */
export async function setUserRole(input: unknown): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { userId, role } = parsed.data;

  if (userId === admin.id) {
    return { ok: false, error: "You can't change your own role." };
  }

  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const target = found.target;

  if (!assignableRolesFor(admin.role).includes(role)) {
    return { ok: false, error: `You can't grant the ${role} role.` };
  }
  if (target.role === role) {
    return { ok: true, message: `${target.email} is already ${role}.` };
  }

  // A scoped role with no properties can see nothing — so refuse the demotion
  // rather than create an account that silently has no access, and say which
  // step is missing.
  const nowScoped = role !== Role.CORPORATE && role !== Role.ADMIN;
  if (nowScoped) {
    const props = await db.userProperty.count({ where: { userId } });
    if (props === 0) {
      return {
        ok: false,
        error: `${role} is property-scoped. Assign at least one property first, then change the role.`,
      };
    }
  }

  await db.user.update({ where: { id: userId }, data: { role } });
  await writeAudit(admin.id, userId, "set_role", {
    email: target.email,
    from: target.role,
    to: role,
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `${target.email}: ${target.role} → ${role}.` };
}

const locationSchema = z.object({
  userId: z.string().uuid(),
  remote: z.boolean(),
});

/**
 * Set a user's Location — Remote or On-site (`users.remote`).
 *
 * Recorded for every role, because it is a fact about the person. It only
 * CHANGES anything for MANAGER, where isOnSiteAssignable consults it to keep
 * the 3 Remote Property Managers out of the batch wizard's "Assign to" pool;
 * see locationAffectsAssignment. Field staff are on-site by role and the
 * predicate ignores the flag for them by design, so a stray Remote on a
 * housekeeper cannot make a real employee unassignable.
 */
export async function setUserRemote(input: unknown): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { userId, remote } = parsed.data;

  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const target = found.target;
  if (target.remote === remote) {
    return { ok: true, message: `${target.email} is already ${remote ? "Remote" : "On-site"}.` };
  }

  await db.user.update({ where: { id: userId }, data: { remote } });
  await writeAudit(admin.id, userId, "set_remote", {
    email: target.email,
    before: target.remote,
    after: remote,
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `${target.email} is now ${remote ? "Remote" : "On-site"}.` };
}

const assignableSchema = z.object({
  userId: z.string().uuid(),
  assignable: z.boolean(),
});

/**
 * Turn the per-user assignment override on or off (`users.always_assignable`).
 *
 * Was settable only by `scripts/set-test-assignee.ts`. Kyle asked for a control
 * on 2026-09-12 after Erika needed it, so it is now ordinary admin work rather
 * than a deploy-and-run — which is a real change of character for this column,
 * and schema.prisma says so.
 *
 * It widens ONE person, never a category. If a whole group needs assigning, the
 * group is a missing role or a missing rule in isOnSiteAssignable — ticking
 * rows one at a time would hide that.
 *
 * Turning it ON does not by itself put someone in a pool: the batch wizard also
 * requires a user_properties row at the property being created for. The UI says
 * so via explainAssignability; this action deliberately does NOT auto-create
 * those rows, because granting property membership is a separate decision with
 * its own audit entry.
 */
export async function setUserAssignable(input: unknown): Promise<ActionResult> {
  const admin = await requireUserAdmin();
  const parsed = assignableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { userId, assignable } = parsed.data;

  const found = await loadTarget(admin.role, userId);
  if (!found.ok) return found;
  const target = found.target;

  const current = await db.user.findUniqueOrThrow({
    where: { id: target.id },
    select: { alwaysAssignable: true, _count: { select: { properties: true } } },
  });
  if (current.alwaysAssignable === assignable) {
    return { ok: true, message: `No change — ${target.email} was already ${assignable ? "on" : "off"}.` };
  }

  await db.user.update({ where: { id: target.id }, data: { alwaysAssignable: assignable } });
  await writeAudit(admin.id, target.id, "set_assignable", {
    email: target.email,
    role: target.role,
    before: current.alwaysAssignable,
    after: assignable,
  });
  revalidatePath("/admin/users");

  // The property half is the one people miss, so say it at the moment the
  // override is switched on rather than leaving them to wonder why the name
  // still isn't in the list.
  const warn =
    assignable && current._count.properties === 0
      ? " ⚠ They hold no properties, so they still won't appear in any pool — assign properties too."
      : "";
  return {
    ok: true,
    message: `${target.email} is ${assignable ? "now assignable by override" : "back to the role default"}.${warn}`,
  };
}
