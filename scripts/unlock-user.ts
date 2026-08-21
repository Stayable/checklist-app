/**
 * Clear a failed-login lockout WITHOUT touching the password.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/unlock-user.ts <email> [...] [--apply]
 *
 * Why this exists: the only admin-side unlock path today is a side effect of
 * `resetPassword` / `setUserPassword` (app/admin/users/actions.ts:97,124), both
 * of which overwrite the password. There is no "unlock only" button, so an
 * admin who wants to hand the lock back without changing someone's credentials
 * has no route through the UI.
 *
 * Policy being cleared (lib/auth-throttle.ts): 5 failed attempts inside a
 * 15-minute window => locked for 30 minutes. The lock expires on its own; this
 * only shortens the wait.
 *
 * ⚠ Unlocking does NOT help if the person does not know their password — it
 * buys them 5 more attempts and then they lock again. The script prints
 * lastLoginAt and mustChangePassword so that distinction is visible.
 */

import { db } from "../lib/db";
import { isLocked } from "../lib/auth-throttle";

// Kyle directed this; AuditLog.actorUserId is meant to name a real decider.
const ACTOR_EMAIL = "bke@rentstayable.com";

async function main() {
  const apply = process.argv.includes("--apply");
  const emails = process.argv
    .slice(2)
    .filter((a) => !a.startsWith("--"))
    .map((a) => a.toLowerCase().trim());

  if (emails.length === 0) {
    console.error("usage: tsx scripts/unlock-user.ts <email> [...] [--apply]");
    process.exit(2);
  }

  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const actor = await db.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true } });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found — cannot write an audit row`);

  const now = new Date();
  let changed = 0;
  const skipped: string[] = [];

  for (const email of emails) {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        role: true,
        active: true,
        failedLoginAttempts: true,
        lastFailedLoginAt: true,
        lockedUntil: true,
        lastLoginAt: true,
        mustChangePassword: true,
      },
    });
    if (!user) {
      skipped.push(`${email} — no such account`);
      continue;
    }

    const locked = isLocked(user, now);
    const until = user.lockedUntil ? user.lockedUntil.toISOString() : "—";
    const seen = user.lastLoginAt ? user.lastLoginAt.toISOString() : "never signed in";
    console.log(
      `  ${email}\n` +
        `    role=${user.role} active=${user.active} mustChangePassword=${user.mustChangePassword}\n` +
        `    locked=${locked ? "YES" : "no"} lockedUntil=${until} failedAttempts=${user.failedLoginAttempts}\n` +
        `    lastLogin=${seen}`,
    );

    // Clear even when the lock has already expired: a stale lockedUntil plus a
    // non-zero counter is what makes the NEXT failure lock again sooner.
    if (!locked && user.failedLoginAttempts === 0 && user.lockedUntil === null) {
      skipped.push(`${email} — nothing to clear`);
      continue;
    }
    if (!apply) {
      changed++;
      continue;
    }

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          entityType: "User",
          entityId: user.id,
          action: "unlock_account",
          before: {
            failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: user.lockedUntil ? user.lockedUntil.toISOString() : null,
          },
          after: {
            failedLoginAttempts: 0,
            lockedUntil: null,
            note: "Login lockout cleared at Kyle's request. Password NOT changed.",
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
  console.log(`\n${apply ? "unlocked" : "would unlock"}: ${changed} · skipped: ${skipped.length}`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
