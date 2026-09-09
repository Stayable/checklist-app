/**
 * Read-only: can this user actually be assigned a checklist, and would they
 * receive the notifications?
 *
 * Run: pnpm dotenv -e .env.production.local -- tsx scripts/inspect-user-for-testing.ts <email>
 *
 * Three things have to line up before a test assignment is meaningful, and
 * they are easy to miss individually:
 *   * `active` and a usable password state — otherwise they cannot sign in
 *   * `remote` false OR `alwaysAssignable` true — the Assign-to picker lists
 *     on-site personnel only, so a remote user is invisible to it
 *   * a `user_properties` row at the property whose checklist you assign
 */
import { db } from "../lib/db";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: inspect-user-for-testing.ts <email>");
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locale: true,
      active: true,
      remote: true,
      alwaysAssignable: true,
      mustChangePassword: true,
      lastLoginAt: true,
      properties: { select: { property: { select: { shortCode: true, name: true } } } },
    },
  });

  if (!user) {
    console.error(`No user with email ${email}`);
    process.exit(1);
  }

  const { properties, ...rest } = user;
  console.table([rest]);
  console.log("properties:", properties.map((p) => p.property.shortCode).join(", ") || "(none)");

  const assignable = user.alwaysAssignable || !user.remote;
  console.log(
    `\nappears in the Assign-to picker: ${assignable ? "YES" : "NO"}` +
      (assignable ? "" : "  <- remote:true and alwaysAssignable:false"),
  );

  const instances = await db.checklistInstance.groupBy({
    by: ["status"],
    where: { assignedUserId: user.id },
    _count: { _all: true },
  });
  console.log("\ninstances already assigned to them:");
  console.table(
    instances.length
      ? instances.map((i) => ({ status: i.status, count: i._count._all }))
      : [{ status: "(none)", count: 0 }],
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
