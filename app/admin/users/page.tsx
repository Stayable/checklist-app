import { InviteKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { UsersClient } from "./UsersClient";

// Admin → Users. Lists all users, supports create / deactivate / one-click
// password reset / multi-property assignment (ADR-013). Server-fetches and hands
// off to the client component for the interactive bits.
export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const [users, properties] = await Promise.all([
    db.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        locale: true,
        active: true,
        lastLoginAt: true,
        properties: { select: { propertyId: true } },
      },
    }),
    db.property.findMany({
      where: { active: true },
      orderBy: { shortCode: "asc" },
      select: { id: true, shortCode: true, name: true },
    }),
  ]);

  // Newest live (not consumed, not revoked, not expired) ACCOUNT invite per
  // user, so the row can show "Invited — expires {date} ET" + a Revoke button.
  // Ordered newest-first so the first hit per userId wins the reduce below.
  const liveInvites = await db.inviteToken.findMany({
    where: {
      kind: InviteKind.ACCOUNT,
      userId: { in: users.map((u) => u.id) },
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true, expiresAt: true },
  });
  const inviteByUserId = new Map<string, { id: string; expiresAt: string }>();
  for (const invite of liveInvites) {
    if (invite.userId && !inviteByUserId.has(invite.userId)) {
      inviteByUserId.set(invite.userId, { id: invite.id, expiresAt: invite.expiresAt.toISOString() });
    }
  }

  const initialUsers = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    locale: u.locale,
    active: u.active,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    propertyIds: u.properties.map((p) => p.propertyId),
    invite: inviteByUserId.get(u.id) ?? null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Users</h1>
      <p className="mt-1 text-sm text-slate-500">
        Provision and manage accounts. Email delivery is deferred, so new accounts
        and resets show a one-time temporary password to share securely.
      </p>
      <UsersClient initialUsers={initialUsers} properties={properties} currentUserId={admin.id} />
    </div>
  );
}
