/**
 * Promote Bea and Erika to CORPORATE.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/promote-to-corporate.ts [--apply]
 *
 * Kyle, 2026-09-11. Paired with the change that let CORPORATE into
 * Admin → Users, so these two can change roles without the shared admin@ login.
 *
 * ⚠ WHAT THIS ALSO GRANTS, which the word "corporate" does not say out loud:
 *   • MAINTENANCE — canAccessMaintenance is portfolio-roles-only, so both gain
 *     the contractor calendar: every contractor's name and phone number, and
 *     the ability to reassign or close another property's jobs. The calendar is
 *     NOT property-scoped (lib/roles.ts) — it shows the whole portfolio.
 *   • NETWORK — full estate, not property-scoped, unlike a MANAGER's view.
 *   • Admin → Users, minus anything touching an ADMIN account.
 * Bea is coming from AGENT, which exists precisely to be checklist-ONLY, so
 * hers is the larger jump of the two.
 *
 * user_properties rows are left in place. Portfolio roles ignore them
 * (isPortfolioRole short-circuits canAccessProperty), so they are inert — and
 * they are exactly what a demotion back to MANAGER or AGENT would need.
 *
 * `users.remote` is left alone too. Erika is genuinely a Remote Property
 * Manager; the flag stops DRIVING anything at CORPORATE (isOnSiteAssignable
 * consults it for MANAGER alone) but it is still true, and blanking a fact
 * because one predicate stopped reading it would be a lie in the data.
 *
 * Dry run by default; nothing is written without --apply.
 */

import { Role } from "@prisma/client";
import { db } from "../lib/db";

const PROMOTE = ["bea@rentstayable.com", "erika@rentstayable.com"];

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
  for (const email of PROMOTE) {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        remote: true,
        active: true,
        properties: { select: { property: { select: { shortCode: true } } } },
      },
    });
    if (!user) {
      console.log(`  ${email}\n    NOT FOUND — skipped`);
      continue;
    }
    const props = user.properties.map((p) => p.property.shortCode).sort().join(",") || "(none)";
    if (user.role === Role.CORPORATE) {
      console.log(`  ${email}\n    already CORPORATE — skipped`);
      continue;
    }
    console.log(
      `  ${email} (${user.name})` +
        `\n    role ${user.role} -> CORPORATE` +
        `\n    location ${user.remote ? "Remote" : "On-site"} (unchanged; reference-only at CORPORATE)` +
        `\n    properties ${props} (kept, inert at a portfolio role)` +
        `\n    gains Maintenance (all contractors, portfolio-wide) + Network + Admin>Users`,
    );
    changed++;
    if (!apply) continue;

    await db.user.update({ where: { id: user.id }, data: { role: Role.CORPORATE } });
    await db.auditLog.create({
      data: {
        actorUserId: actor.id,
        entityType: "user",
        entityId: user.id,
        // Same action string the new setUserRole server action writes, so the
        // audit trail reads the same whether a change came from a script or
        // from Admin → Users.
        action: "set_role",
        before: { role: user.role },
        after: { role: Role.CORPORATE, email: user.email },
      },
    });
  }

  const corp = await db.user.findMany({
    where: { role: Role.CORPORATE },
    orderBy: { email: "asc" },
    select: { email: true, active: true },
  });
  console.log(`\n${apply ? "changed" : "would change"}: ${changed}`);
  console.log(`CORPORATE accounts after this run: ${corp.length}`);
  for (const u of corp) console.log(`  ${u.active ? " " : "x"} ${u.email}`);
}

main().finally(() => db.$disconnect());
