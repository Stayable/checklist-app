/**
 * Make one account assignable for end-to-end testing.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/set-test-assignee.ts <email> [--apply]
 *
 * Takes the target email as an argument (2026-09-12). It was hard-coded to
 * Kyle's account until Erika needed the same treatment to test a checklist,
 * and a second copy of this file would have been the alternative.
 *
 * Two separate things keep a CORPORATE account out of the batch-create
 * "Assign to" pool, and BOTH have to be dealt with:
 *
 *   1. Role. `isOnSiteAssignable` admits field staff and on-site Property
 *      Managers only. Fixed by `always_assignable`, a per-row override —
 *      widening the rule to CORPORATE would put all six corporate users in
 *      every property's list.
 *   2. Property membership. The pool query also requires a user_properties row
 *      for the active property. CORPORATE reaches every property through its
 *      ROLE, not through that table, so this account has none and would still
 *      be invisible with the override alone.
 *
 * Adding user_properties rows to a CORPORATE account grants nothing it did not
 * already have — portfolio access is by role — so this is additive only.
 *
 * Dry run by default; nothing is written without --apply.
 */

import { db } from "../lib/db";

// Kyle directed this; AuditLog.actorUserId is meant to name a real decider.
const ACTOR_EMAIL = "bke@rentstayable.com";

async function main() {
  const apply = process.argv.includes("--apply");
  const targetEmail = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase();
  if (!targetEmail) {
    throw new Error(
      "Pass the target email, e.g. tsx scripts/set-test-assignee.ts erika@rentstayable.com --apply",
    );
  }
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const user = await db.user.findUnique({
    where: { email: targetEmail },
    select: {
      id: true, email: true, name: true, role: true, active: true,
      alwaysAssignable: true,
      properties: { select: { propertyId: true } },
    },
  });
  if (!user) throw new Error(`${targetEmail} not found`);

  const actor = await db.user.findUnique({
    where: { email: ACTOR_EMAIL },
    select: { id: true },
  });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found — cannot write an audit row`);

  const properties = await db.property.findMany({
    orderBy: { shortCode: "asc" },
    select: { id: true, shortCode: true },
  });
  const held = new Set(user.properties.map((p) => p.propertyId));
  const missing = properties.filter((p) => !held.has(p.id));

  console.log(`${user.email} (${user.name}) — ${user.role}, active=${user.active}`);
  console.log(`  alwaysAssignable ${user.alwaysAssignable} -> true${user.alwaysAssignable ? "  (already set)" : ""}`);
  console.log(
    `  properties ${user.properties.length}/${properties.length}` +
      (missing.length ? ` — adding ${missing.map((p) => p.shortCode).join(", ")}` : " — nothing to add"),
  );

  if (!apply) {
    console.log("\ndry run — nothing written");
    return;
  }

  await db.user.update({
    where: { id: user.id },
    data: { alwaysAssignable: true },
  });
  if (missing.length > 0) {
    await db.userProperty.createMany({
      data: missing.map((p) => ({ userId: user.id, propertyId: p.id })),
      // Belt and braces against a concurrent run; the composite PK is
      // (userId, propertyId), so a duplicate would otherwise throw P2002.
      skipDuplicates: true,
    });
  }
  await db.auditLog.create({
    data: {
      actorUserId: actor.id,
      entityType: "user",
      entityId: user.id,
      action: "set_test_assignee",
      before: {
        alwaysAssignable: user.alwaysAssignable,
        propertyCount: user.properties.length,
      },
      after: {
        alwaysAssignable: true,
        propertyCount: properties.length,
        email: user.email,
        reason: "end-to-end checklist testing",
      },
    },
  });

  console.log("\napplied.");
}

main().finally(() => db.$disconnect());
