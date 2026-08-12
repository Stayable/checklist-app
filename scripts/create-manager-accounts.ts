/**
 * Provision the real management roster (Kyle, 2026-08-13).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/create-manager-accounts.ts [--apply]
 *
 * Three groups, all idempotent and all reporting what they did:
 *
 *  1. NEW MANAGERS — 8 property managers (one property each), 2 area managers
 *     (their region), created with role MANAGER.
 *  2. ROLE CHANGES — 3 remote property managers who already exist as AGENT
 *     testers. They become MANAGER and their property scope is NARROWED from
 *     all 8 to their own. The other 6 AGENT testers are untouched: Kyle's
 *     instruction is that agents keep Checklist.
 *  3. FULL VISIBILITY — Rob and Crystal as CORPORATE (portfolio-wide, every
 *     section, no /admin console). Gerardo already exists as CORPORATE and is
 *     deliberately left alone.
 *
 * WHAT MANAGER MEANS AS OF TODAY:
 *   • Checklist — full management (review, approve, issues, dashboard,
 *     reports), scoped to their properties by user_properties.
 *   • Maintenance — NO. canAccessMaintenance was narrowed to portfolio roles in
 *     the same change; the contractor calendar carries every contractor's phone
 *     number and lets a user close another property's jobs.
 *   • Network — granted separately, and only once /network is property-scoped.
 *     Until then MANAGER has no network access, because the network pages show
 *     the whole portfolio to anyone who can open them.
 *
 * ⚠ AN EXISTING ACCOUNT'S PASSWORD IS NEVER TOUCHED. Role and property scope
 * are updated for the three named remote PMs; nothing else about them changes.
 * Silently resetting a colleague's password would be worse than skipping.
 *
 * ⚠ THE SHARED PASSWORD IS NOT THE WHOLE LOGIN. Every user needs a password AND
 * an emailed OTP on an untrusted device (ADR-019), so each address must be a
 * real mailbox. A typo produces an account nobody can ever sign into.
 */

import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { db } from "../lib/db";

const BCRYPT_COST = 12; // matches app/admin/users/actions.ts
const STARTING_PASSWORD = "StayableMgr26!";

type NewManager = { name: string; email: string; phone: string | null; properties: string[] };

// Property managers — one property each.
const PROPERTY_MANAGERS: NewManager[] = [
  { name: "Sage Pearl", email: "sage@rentstayable.com", phone: "8637014379", properties: ["JW"] },
  { name: "Christy Vasquez", email: "christy@rentstayable.com", phone: "689-233-0415", properties: ["LL"] },
  { name: "Katherine Card", email: "katherine@rentstayable.com", phone: "(740)352-7181", properties: ["DP"] },
  { name: "Bianca Arias", email: "bianca@rentstayable.com", phone: "407-236-6808", properties: ["KW"] },
  { name: "Rafael Suarez", email: "rafael@rentstayable.com", phone: "(407) 994-5583", properties: ["KE"] },
  { name: "Jason Equilin", email: "jason@rentstayable.com", phone: "321 437 3075", properties: ["OR"] },
  { name: "Cassie Johnson", email: "cassie@rentstayable.com", phone: "386-213-7204", properties: ["SA"] },
  { name: "Dayana Filpo", email: "dayana@rentstayable.com", phone: "(689) 238-0676", properties: ["JN"] },
];

// Area managers — a region each. Same role; the scope is the difference.
const AREA_MANAGERS: NewManager[] = [
  { name: "Shayla Shane", email: "shayla@rentstayable.com", phone: "863-513-0175", properties: ["JW", "SA", "JN"] },
  // No phone supplied for Shay. Left null rather than guessed.
  { name: "Shay Harper", email: "shay@rentstayable.com", phone: null, properties: ["KW", "KE", "OR", "DP", "LL"] },
];

// Remote property managers — already exist as AGENT testers. "OBT" is Orlando
// OBT, short code OR.
const REMOTE_MANAGERS: { email: string; properties: string[] }[] = [
  { email: "ruby@rentstayable.com", properties: ["DP", "OR", "KE"] },
  { email: "jeffrey@rentstayable.com", properties: ["JW", "SA"] },
  { email: "erika@rentstayable.com", properties: ["LL", "KW", "JN"] },
];

// Portfolio-wide visibility: every property, every section, no admin console.
const FULL_VISIBILITY: { name: string; email: string }[] = [
  { name: "Rob Beyer", email: "rb@rise8companies.com" },
  { name: "Crystal Johnson", email: "crystal@rentstayable.com" },
  // gerardo@rentstayable.com already exists as CORPORATE — see the check below.
];

/** US 10-digit -> E.164. Anything else is stored verbatim rather than mangled. */
function toE164(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

async function main() {
  const apply = process.argv.includes("--apply");

  const properties = await db.property.findMany({ select: { id: true, shortCode: true } });
  const idByCode = new Map(properties.map((p) => [p.shortCode, p.id]));

  const allNew = [...PROPERTY_MANAGERS, ...AREA_MANAGERS];
  for (const m of allNew) {
    for (const code of m.properties) {
      if (!idByCode.has(code)) throw new Error(`Unknown property short code "${code}" for ${m.email}`);
    }
  }
  for (const m of REMOTE_MANAGERS) {
    for (const code of m.properties) {
      if (!idByCode.has(code)) throw new Error(`Unknown property short code "${code}" for ${m.email}`);
    }
  }

  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  const passwordHash = await bcrypt.hash(STARTING_PASSWORD, BCRYPT_COST);
  const created: string[] = [];
  const changed: string[] = [];
  const skipped: string[] = [];

  // --- 1. New managers -----------------------------------------------------
  for (const m of allNew) {
    const existing = await db.user.findUnique({ where: { email: m.email }, select: { id: true, role: true } });
    if (existing) {
      skipped.push(`${m.email} — already exists (role ${existing.role}); left untouched`);
      continue;
    }
    console.log(`  create  ${m.email.padEnd(32)} MANAGER   ${m.properties.join(",")}`);
    if (apply) {
      await db.user.create({
        data: {
          email: m.email,
          name: m.name,
          role: Role.MANAGER,
          passwordHash,
          mustChangePassword: true,
          phone: toE164(m.phone),
          properties: { create: m.properties.map((c) => ({ propertyId: idByCode.get(c)! })) },
        },
      });
    }
    created.push(m.email);
  }

  // --- 2. Remote PMs: AGENT -> MANAGER, and narrow their scope -------------
  for (const m of REMOTE_MANAGERS) {
    const existing = await db.user.findUnique({
      where: { email: m.email },
      select: { id: true, role: true, properties: { select: { property: { select: { shortCode: true } } } } },
    });
    if (!existing) {
      skipped.push(`${m.email} — expected an existing AGENT account, found none; NOT created`);
      continue;
    }
    const before = existing.properties.map((p) => p.property.shortCode).sort().join(",");
    const after = [...m.properties].sort().join(",");
    console.log(`  update  ${m.email.padEnd(32)} ${existing.role} -> MANAGER   ${before} -> ${after}`);
    if (apply) {
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: existing.id }, data: { role: Role.MANAGER } });
        // Replace the scope wholesale: they had all 8 as testers.
        await tx.userProperty.deleteMany({ where: { userId: existing.id } });
        await tx.userProperty.createMany({
          data: m.properties.map((c) => ({ userId: existing.id, propertyId: idByCode.get(c)! })),
        });
      });
    }
    changed.push(m.email);
  }

  // --- 3. Full visibility --------------------------------------------------
  for (const p of FULL_VISIBILITY) {
    const existing = await db.user.findUnique({ where: { email: p.email }, select: { role: true } });
    if (existing) {
      skipped.push(`${p.email} — already exists (role ${existing.role}); left untouched`);
      continue;
    }
    console.log(`  create  ${p.email.padEnd(32)} CORPORATE (all properties)`);
    if (apply) {
      await db.user.create({
        data: {
          email: p.email,
          name: p.name,
          role: Role.CORPORATE,
          passwordHash,
          mustChangePassword: true,
          // No user_properties rows on purpose: CORPORATE is portfolio-wide by
          // role (isPortfolioRole), and adding memberships would imply the
          // scope is what grants access when it is not.
        },
      });
    }
    created.push(p.email);
  }

  const gerardo = await db.user.findUnique({
    where: { email: "gerardo@rentstayable.com" },
    select: { role: true },
  });
  console.log(
    `\ngerardo@rentstayable.com: ${gerardo ? `already exists as ${gerardo.role}` : "MISSING"}` +
      (gerardo?.role === Role.CORPORATE ? " — already has full visibility, nothing to do" : ""),
  );

  if (skipped.length) {
    console.log(`\nskipped:`);
    for (const s of skipped) console.log(`  ${s}`);
  }
  console.log(`\nto create: ${created.length} · to update: ${changed.length}`);
  if (!apply) console.log("\nRe-run with --apply to write.");
  else console.log(`\nStarting password for NEW accounts only: ${STARTING_PASSWORD} (forced change on first login)`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
