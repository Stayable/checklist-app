/**
 * Create the RPM/GSA test accounts (Kyle, 2026-08-12).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/create-agent-testers.ts [--apply]
 * Idempotent: matches on email, and NEVER touches an account that already
 * exists — christopher@ and karla@ are real staff who may already be set up, and
 * silently resetting a colleague's password or role would be worse than skipping.
 *
 * Each account gets:
 *   • role AGENT — checklist only. No Maintenance (so no contractor calendar),
 *     no Network, no Admin.
 *   • all 8 properties, per Kyle.
 *   • the shared starting password below, and must_change_password = true, so
 *     the first thing each person must do is set their own. Every guarded page
 *     redirects to /profile until they do.
 *
 * ⚠ THE SHARED PASSWORD IS NOT THE WHOLE LOGIN. Every user needs a password AND
 * an emailed OTP on an untrusted device (ADR-019). So each address must be a
 * real mailbox that can receive from Resend — these are all @rentstayable.com,
 * which should be fine, but a typo produces an account nobody can ever sign
 * into, since the OTP has nowhere to land.
 */

import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { db } from "../lib/db";

const BCRYPT_COST = 12; // matches app/admin/users/actions.ts
const STARTING_PASSWORD = "TestAgents26!";

// Supplied by Kyle. Names are derived from the mailbox only — nobody's real
// full name is invented here; each person can correct theirs on /profile.
const EMAILS = [
  "abby@rentstayable.com",
  "bea@rentstayable.com",
  "carl@rentstayable.com",
  "christopher@rentstayable.com",
  "erika@rentstayable.com",
  "jeffrey@rentstayable.com",
  "karla@rentstayable.com",
  "randy@rentstayable.com",
  "ruby@rentstayable.com",
];

function nameFromEmail(email: string): string {
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const properties = await db.property.findMany({ select: { id: true, shortCode: true } });
  if (properties.length === 0) throw new Error("No properties found");

  console.log(`${EMAILS.length} accounts · role AGENT · ${properties.length} properties each`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  let created = 0;
  const skipped: string[] = [];

  for (const email of EMAILS) {
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true, role: true, active: true },
    });
    if (existing) {
      skipped.push(`${email} — already exists (role ${existing.role}); left untouched`);
      continue;
    }

    console.log(`  CREATE  ${email.padEnd(34)} ${nameFromEmail(email)}`);
    if (!apply) continue;

    const passwordHash = await bcrypt.hash(STARTING_PASSWORD, BCRYPT_COST);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: nameFromEmail(email),
          passwordHash,
          role: Role.AGENT,
          active: true,
          mustChangePassword: true,
          properties: { create: properties.map((p) => ({ propertyId: p.id })) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          entityType: "User",
          entityId: user.id,
          action: "create",
          after: {
            email,
            role: Role.AGENT,
            propertyCount: properties.length,
            mustChangePassword: true,
            note: "RPM/GSA checklist test account. Shared starting password; forced change on first login.",
          },
        },
      });
    });
    created++;
  }

  if (skipped.length > 0) {
    console.log("\nskipped:");
    for (const s of skipped) console.log(`    ${s}`);
  }
  console.log(`\ncreated: ${created} · skipped: ${skipped.length}`);
  if (apply && created > 0) {
    console.log(
      `\nEach signs in with their email + ${STARTING_PASSWORD}, receives an emailed code,\n` +
        "then is held on /profile until they set their own password.",
    );
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
