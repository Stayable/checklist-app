/**
 * One-off: create a placeholder User row per imported contractor.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/create-contractor-placeholder-users.ts [--apply]
 * Without --apply it prints the plan and writes nothing. Idempotent — matches
 * on email and skips anything already present.
 *
 * ⚠ THIS AMENDS ADR-030, which states contractors are records, not users, and
 * that there are no contractor logins. Kyle asked for temporary accounts on
 * 2026-08-11 ("no email, no number -> will add later"). Recorded in the ADR.
 *
 * ⚠ THE EMAILS ARE FABRICATED. `User.email` is NOT NULL and unique, so "no
 * email" is not representable; a placeholder is the only way to satisfy the
 * column. Three deliberate choices follow from that:
 *
 *   1. The domain is `contractors.invalid`. `.invalid` is reserved by RFC 2606
 *      and can never resolve, so no message can ever be delivered to a real
 *      person by mistake. A guessed @rentstayable.com address could collide
 *      with a real mailbox or actually send.
 *   2. `active: false`. lib/auth.ts:42 refuses login for an inactive user, so
 *      these cannot be signed into — they are placeholders, not accounts in
 *      use. Activating one is a deliberate admin action.
 *   3. The password is 32 random bytes that are hashed and then discarded —
 *      never printed, never stored in plaintext, not recoverable. The way in is
 *      the admin "Set PW" action after a real email is in place, which is the
 *      same path a new staff hire takes.
 *
 * ⚠ NO PROPERTY MEMBERSHIP is created. A field-staff user with no
 * `user_properties` rows can be assigned nothing and can see nothing, which is
 * the right default for an account nobody has vouched for yet. Adding
 * properties is what makes one usable, and that is a deliberate later step.
 *
 * ⚠ THESE ARE NOT LINKED TO THEIR CONTRACTOR RECORDS. ADR-030 deliberately
 * omitted `Contractor.userId` (the deleted dispatch rail had it), so no FK
 * exists to join them — the only correspondence is the name. A real link is a
 * schema change, not something this script can fake.
 *
 * Reversible: these users have no history, so the admin Delete action (which
 * blocks only when history exists) removes them cleanly.
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { db } from "../lib/db";

const BCRYPT_COST = 12; // matches app/admin/users/actions.ts
const EMAIL_DOMAIN = "contractors.invalid";
const CREATED_BY_EMAIL = "bke@rentstayable.com";

/** "Gary Floyd Jr." -> "gary.floyd.jr" */
function emailLocalPart(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents so the address stays ASCII
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

async function main() {
  const apply = process.argv.includes("--apply");

  const creator = await db.user.findUnique({ where: { email: CREATED_BY_EMAIL }, select: { id: true } });
  if (!creator) throw new Error(`Creating user ${CREATED_BY_EMAIL} not found`);

  const contractors = await db.contractor.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  console.log(`${contractors.length} contractors`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  let created = 0;
  let skipped = 0;

  for (const contractor of contractors) {
    const email = `${emailLocalPart(contractor.name)}@${EMAIL_DOMAIN}`;
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });

    if (existing) {
      console.log(`  SKIP    ${contractor.name.padEnd(28)} ${email} (already exists)`);
      skipped++;
      continue;
    }

    console.log(`  CREATE  ${contractor.name.padEnd(28)} ${email}  role=MT active=false`);
    if (!apply) continue;

    // Hashed and immediately unrecoverable — nobody, including this script's
    // output, ever holds the plaintext.
    const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);

    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name: contractor.name,
          passwordHash,
          role: Role.MT,
          // Blocks login (lib/auth.ts:42) until someone deliberately activates it.
          active: false,
          // Locale left at the schema default (en) rather than guessed from a
          // person's name. Field staff are prompted on first login (ADR-013).
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: creator.id,
          entityType: "User",
          entityId: user.id,
          action: "import",
          after: {
            email,
            name: contractor.name,
            role: Role.MT,
            active: false,
            note: "Placeholder account for an imported contractor. Email is fabricated on a reserved .invalid domain; no phone; no property membership; not linked to the contractor record (no such FK exists).",
            contractorId: contractor.id,
          },
        },
      });
    });
    created++;
  }

  console.log(`\ncreated: ${created} · skipped (already present): ${skipped}`);
  if (apply && created > 0) {
    console.log(
      "\nThese accounts cannot be logged into. To make one real: set a deliverable email,\n" +
        "add property membership, set a password via the admin Set PW action, then activate.",
    );
  }
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
