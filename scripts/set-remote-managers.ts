/**
 * Flag the Remote Property Managers as remote.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/set-remote-managers.ts [--apply]
 *
 * Why this exists: `users.remote` (migration 20260909100000) distinguishes the
 * 3 RPMs from the 8 on-site Property Managers, who share the MANAGER role and
 * were otherwise indistinguishable. It drives the "Assign to" pool in the
 * batch-create wizard — on-site personnel only — so until these three rows are
 * flipped, an RPM is offered as somebody who could be handed a room checklist.
 *
 * Deliberately NOT in the migration: naming individual people in DDL is how a
 * migration stops being replayable on a fresh database.
 *
 * Dry run by default; nothing is written without --apply.
 */

import { Role } from "@prisma/client";
import { db } from "../lib/db";

// The Remote Property Managers (TODO.md START HERE, 2026-09-07). Erika covers
// all 8 properties, Ruby DP/KE/OR, Jeffrey JW/SA. Everyone else holding
// MANAGER is on site at exactly one property.
const REMOTE_EMAILS = [
  "erika@rentstayable.com",
  "ruby@rentstayable.com",
  "jeffrey@rentstayable.com",
];

// Kyle directed this; AuditLog.actorUserId is meant to name a real decider.
const ACTOR_EMAIL = "bke@rentstayable.com";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const actor = await db.user.findUnique({
    where: { email: ACTOR_EMAIL },
    select: { id: true },
  });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found — cannot write an audit row`);

  let changed = 0;
  for (const email of REMOTE_EMAILS) {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, remote: true },
    });
    if (!user) {
      console.log(`  ${email}\n    NOT FOUND — skipped`);
      continue;
    }
    // Only MANAGER has an on-site/remote distinction. Flagging any other role
    // would be a no-op the predicate ignores, and a lie in the data.
    if (user.role !== Role.MANAGER) {
      console.log(`  ${email}\n    role=${user.role}, not MANAGER — skipped`);
      continue;
    }
    if (user.remote) {
      console.log(`  ${email}\n    already remote — skipped`);
      continue;
    }
    console.log(`  ${email} (${user.name})\n    MANAGER, remote false -> true`);
    changed++;
    if (!apply) continue;

    await db.user.update({ where: { id: user.id }, data: { remote: true } });
    await db.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "user",
        entityId: user.id,
        action: "set_remote",
        before: { remote: false },
        after: { remote: true, email: user.email },
      },
    });
  }

  // The inverse is worth printing rather than assuming: anyone left as an
  // on-site MANAGER now appears in an "Assign to" list at their properties.
  const onSite = await db.user.findMany({
    where: { role: Role.MANAGER, remote: false, active: true },
    orderBy: { email: "asc" },
    select: { email: true, properties: { select: { propertyId: true } } },
  });
  console.log(
    `\n${apply ? "changed" : "would change"}: ${changed}` +
      `\non-site MANAGERs after this run: ${onSite.length}`,
  );
  for (const u of onSite) {
    const n = u.properties.length;
    // An on-site manager holding several properties is the case that makes
    // "count the properties" a bad proxy — worth seeing, not worth blocking.
    console.log(`  ${u.email}  ${n} propert${n === 1 ? "y" : "ies"}${n > 1 ? "  <- check this one" : ""}`);
  }
}

main().finally(() => db.$disconnect());
