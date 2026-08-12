/**
 * Give each roster account a memorable per-person starting password (Kyle,
 * 2026-08-13): "Ops" + the capitalized mailbox name — OpsBea, OpsShay,
 * OpsCrystal.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/set-roster-passwords.ts [--apply]
 *
 * ⚠ ONLY TOUCHES ACCOUNTS NOBODY HAS PERSONALIZED. An account whose
 * `mustChangePassword` is already false has had a real person choose its
 * password, and silently replacing that would lock a colleague out of an app
 * they are already using. Those are reported and skipped.
 *
 * `mustChangePassword` STAYS TRUE. These are shared-knowledge temp credentials
 * — derivable from the person's own email address by anyone who knows the
 * pattern — so they must be replaced on first login, which every guarded page
 * enforces server-side by redirecting to /profile.
 *
 * ⚠ THE PASSWORD IS NOT THE WHOLE LOGIN. Every sign-in on an untrusted device
 * also needs an emailed OTP (ADR-019), which is what keeps a guessable temp
 * password from being a working credential on its own. Account lockout (5
 * failures in 15 min) is the other half.
 *
 * ⚠ SEVERAL OF THESE ARE SHORTER THAN THE APP'S OWN 8-CHARACTER MINIMUM
 * (validatePasswordStrength in lib/password.ts). That rule guards what a user
 * SETS; this writes a hash directly, so it is not bypassing a check so much as
 * sitting outside one. The practical consequence is small but worth knowing:
 * a user who tried to re-set the same short password on /profile would be
 * refused. They have to change it anyway.
 */

import bcrypt from "bcryptjs";
import { db } from "../lib/db";

const BCRYPT_COST = 12; // matches app/admin/users/actions.ts

// Accounts deliberately left alone: Kyle's and Kate's own logins, and the
// admin account. Nobody asked for these to be reset and doing so would be a
// surprise mid-session.
const NEVER_TOUCH = new Set([
  "bke@rentstayable.com",
  "kate@rentstayable.com",
  "admin@rentstayable.com",
]);

/** "bea@rentstayable.com" -> "OpsBea". Derived from the MAILBOX, per Kyle. */
export function rosterPassword(email: string): string {
  const local = email.split("@")[0];
  // Strip anything that isn't a letter so a dotted or numbered mailbox still
  // yields something a person can be told over the phone.
  const letters = local.replace(/[^A-Za-z]/g, "");
  return `Ops${letters.charAt(0).toUpperCase()}${letters.slice(1).toLowerCase()}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const users = await db.user.findMany({
    where: { email: { not: { endsWith: "@contractors.invalid" } } },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });

  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const planned: { id: string; email: string; role: string; password: string }[] = [];
  const skipped: string[] = [];

  for (const u of users) {
    if (NEVER_TOUCH.has(u.email)) {
      skipped.push(`${u.email} — excluded by policy (own/admin login)`);
      continue;
    }
    if (!u.mustChangePassword) {
      skipped.push(`${u.email} — already personalized; NOT reset`);
      continue;
    }
    planned.push({ id: u.id, email: u.email, role: String(u.role), password: rosterPassword(u.email) });
  }

  for (const p of planned) {
    const short = p.password.length < 8 ? "  ⚠ under the app's 8-char minimum" : "";
    console.log(`  ${p.role.padEnd(10)} ${p.email.padEnd(32)} ${p.password}${short}`);
  }

  if (skipped.length) {
    console.log(`\nskipped:`);
    for (const s of skipped) console.log(`  ${s}`);
  }

  // A collision would mean two people sharing a password without either
  // knowing — worth failing loudly rather than reporting after the fact.
  const byPassword = new Map<string, string[]>();
  for (const p of planned) {
    byPassword.set(p.password, [...(byPassword.get(p.password) ?? []), p.email]);
  }
  const collisions = [...byPassword.entries()].filter(([, emails]) => emails.length > 1);
  if (collisions.length) {
    console.log(`\n⚠ COLLISIONS — the same password for more than one person:`);
    for (const [pw, emails] of collisions) console.log(`  ${pw}: ${emails.join(", ")}`);
    throw new Error("Refusing to write: two accounts would share a password");
  }

  console.log(`\nto set: ${planned.length}`);
  if (!apply) {
    console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  for (const p of planned) {
    await db.user.update({
      where: { id: p.id },
      data: {
        passwordHash: await bcrypt.hash(p.password, BCRYPT_COST),
        // Stays true on purpose — see the header.
        mustChangePassword: true,
        // A password reset invalidates any lockout in progress; leaving a stale
        // counter would lock someone out of a password they were just given.
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  console.log(`\nset: ${planned.length} password(s). All still require a change on first login.`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
