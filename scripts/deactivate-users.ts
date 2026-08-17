/**
 * Remove app access for named accounts (Kyle, 2026-08-18: carl@ and christopher@).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/deactivate-users.ts [--apply]
 *
 * Deactivation, NOT deletion. `active: false` is refused at both login gates
 * (lib/auth.ts:42 and app/login/actions.ts:48), so it removes access completely
 * and is reversible from /admin/users. A hard delete would also be refused —
 * both accounts already carry audit rows from their creation (deleteUser blocks
 * on any history), and destroying the record would erase who was provisioned
 * when.
 *
 * ⚠ It does NOT eject a live session. Sessions are JWT and the session callback
 * reads only the token, so an already-signed-in user keeps their 30-day cookie
 * until it expires. The script prints lastLoginAt so that risk is visible
 * rather than assumed away.
 *
 * Property memberships are left in place deliberately: they are how the account
 * is restored intact if this is reversed, and they grant nothing while inactive.
 */

import { db } from "../lib/db";

const EMAILS = ["carl@rentstayable.com", "christopher@rentstayable.com"];

// Kyle directed this change; attribute it to his account rather than a
// placeholder, since AuditLog.actorUserId is meant to name a real decider.
const ACTOR_EMAIL = "bke@rentstayable.com";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const actor = await db.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true } });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found — cannot write an audit row`);

  let changed = 0;
  const skipped: string[] = [];

  for (const email of EMAILS) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true, active: true, lastLoginAt: true },
    });
    if (!user) {
      skipped.push(`${email} — no such account`);
      continue;
    }
    if (!user.active) {
      skipped.push(`${email} — already inactive`);
      continue;
    }

    const seen = user.lastLoginAt ? user.lastLoginAt.toISOString() : "never signed in";
    console.log(`  DEACTIVATE  ${email.padEnd(34)} ${user.role.padEnd(10)} last login: ${seen}`);
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { active: false } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          entityType: "User",
          entityId: user.id,
          action: "deactivate",
          before: { active: true, role: user.role },
          after: {
            active: false,
            note: "Access removed at Kyle's request 2026-08-18. Account and property scope retained so it can be reactivated from /admin/users.",
          },
        },
      });
    });
    changed++;
  }

  if (skipped.length > 0) {
    console.log("\nskipped:");
    for (const s of skipped) console.log(`    ${s}`);
  }
  console.log(`\ndeactivated: ${changed} · skipped: ${skipped.length}`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
