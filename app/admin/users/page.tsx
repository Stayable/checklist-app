import { db } from "@/lib/db";
import { assignableRolesFor, requireUserAdmin } from "@/lib/rbac";
import { isLocked } from "@/lib/auth-throttle";
import { UsersClient } from "./UsersClient";

// Admin → Users. Lists all users, supports create / deactivate / one-click
// password reset / multi-property assignment (ADR-013) / role change / Location
// (2026-09-11). Server-fetches and hands off to the client component for the
// interactive bits.
//
// Open to ADMIN **and CORPORATE** since 2026-09-11 (Kyle). The two limits on
// CORPORATE — no acting on an ADMIN row, no granting ADMIN — are enforced in
// ./actions.ts; what is passed down here only decides what the UI offers.
export default async function AdminUsersPage() {
  const admin = await requireUserAdmin();

  const [users, properties] = await Promise.all([
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locale: true,
        remote: true,
        active: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        properties: { select: { propertyId: true } },
      },
    }),
    db.property.findMany({
      where: { active: true },
      orderBy: { shortCode: "asc" },
      select: { id: true, shortCode: true, name: true },
    }),
  ]);

  // Lock state is evaluated once, server-side, so the badge is deterministic
  // and cannot hydrate differently from a client clock. It goes stale as a lock
  // expires; unlockUser revalidates, and an expired lock is harmless either way.
  const now = new Date();

  const initialUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    locale: u.locale,
    remote: u.remote,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    locked: isLocked(u, now),
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    propertyIds: u.properties.map((p) => p.propertyId),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      <p className="mt-1 text-sm text-slate-500">
        Provision and manage accounts. Email delivery is deferred, so new accounts
        and resets show a one-time temporary password to share securely.
      </p>
      <UsersClient
        initialUsers={initialUsers}
        properties={properties}
        currentUserId={admin.id}
        actorRole={admin.role}
        assignableRoles={assignableRolesFor(admin.role)}
      />
    </div>
  );
}
