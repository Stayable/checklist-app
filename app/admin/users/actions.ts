"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Locale, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { generateTempPassword, validatePasswordStrength } from "@/lib/password";

// Admin user-management server actions (Phase 2). All require ADMIN and write
// an audit_log entry. Resend is deferred, so create/reset return a one-time
// temp password for the admin to convey rather than emailing an activation link.

const BCRYPT_COST = 12;

export type ActionResult =
  | { ok: true; tempPassword?: string; message?: string }
  | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Valid email required"),
  role: z.nativeEnum(Role),
  locale: z.nativeEnum(Locale).default(Locale.en),
  propertyIds: z.array(z.string().uuid()).default([]),
});

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
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, email, role, locale, propertyIds } = parsed.data;

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
      passwordHash,
      properties: portfolio
        ? undefined
        : { create: propertyIds.map((propertyId) => ({ propertyId })) },
    },
    select: { id: true },
  });

  await writeAudit(admin.id, user.id, "create", { email, role });
  revalidatePath("/admin/users");
  return { ok: true, tempPassword, message: `Created ${email}.` };
}

export async function setUserActive(userId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    return { ok: false, error: "You can't change your own active status." };
  }
  await db.user.update({ where: { id: userId }, data: { active } });
  await writeAudit(admin.id, userId, active ? "reactivate" : "deactivate");
  revalidatePath("/admin/users");
  return { ok: true, message: active ? "User reactivated." : "User deactivated." };
}

export async function resetPassword(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
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

/** Set a specific password chosen by the admin (vs. resetPassword's random temp). */
export async function setUserPassword(
  userId: string,
  password: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const idOk = z.string().uuid().safeParse(userId);
  if (!idOk.success) return { ok: false, error: "Invalid user." };
  const weak = validatePasswordStrength(password);
  if (weak) return { ok: false, error: weak };

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  });
  if (!target) return { ok: false, error: "User not found." };

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
  const admin = await requireAdmin();
  if (admin.id === userId) return { ok: false, error: "You can't delete your own account." };

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

  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, error: "User not found." };

  // No history → user_properties cascade-deletes; safe hard delete.
  await db.user.delete({ where: { id: userId } });
  await writeAudit(admin.id, userId, "delete", { email: target.email });
  revalidatePath("/admin/users");
  return { ok: true, message: `Deleted ${target.email}.` };
}

export async function setUserProperties(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = propsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { userId, propertyIds } = parsed.data;

  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return { ok: false, error: "User not found." };
  const portfolio = user.role === Role.CORPORATE || user.role === Role.ADMIN;
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
