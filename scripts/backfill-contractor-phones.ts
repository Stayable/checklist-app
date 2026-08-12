/**
 * Backfill contractor phone / WhatsApp numbers from the voice pipeline's roster.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/backfill-contractor-phones.ts [--apply]
 *       (add --roster <path> to point at a different capture)
 *
 * WHY: the contractor update fan-out resolves a crew update to a job on
 * (workDate, contractorPhone), matching phone FIRST because the schedule
 * carries name variants that a name match silently gets wrong. All 13
 * contractor rows were imported on 2026-08-11 with no phone and no WhatsApp
 * ("will add later"), so until this runs every update falls to the name path
 * the contract itself calls unsafe — and its failure is invisible, because an
 * unresolved update just leaves the calendar unchanged. §Q40.
 *
 * ⚠ THE ROSTER IS READ FROM THE OTHER REPO, NOT COPIED INTO THIS ONE.
 * Thirteen real mobile numbers are PII and this repo has deliberately kept
 * them out of git before (the earlier seed roster shipped placeholders for
 * exactly this reason). The default path is the sibling checkout; nothing is
 * committed here but the mapping logic.
 *
 * DIRECTION: roster -> app only. Nothing here writes back to the pipeline.
 *
 * RULES:
 *  1. Only rows marked is_contractor=TRUE with confidence=high are used. The
 *     roster's own medium/unknown rows are reported and skipped — a number
 *     attached to the wrong person is worse than a missing one, since it
 *     silently files one man's work under another's name.
 *  2. The test sender is excluded explicitly, by number and by note. It is
 *     Kyle's own handset and is not a contractor.
 *  3. Names must match EXACTLY (case- and whitespace-insensitive). No fuzzy
 *     matching: this script exists precisely because fuzzy name matching is
 *     the thing being replaced.
 *  4. A contractor who already has a number is left alone and reported.
 */

import { readFileSync } from "fs";
import { db } from "../lib/db";
import { nameKey, normalizePhone } from "../lib/contractor-update";

const DEFAULT_ROSTER = "../construction_updates/proto/roster.csv";

// Excluded by number as well as by note, so a reworded note cannot let it
// through. This is the pipeline's own test handset.
const TEST_SENDER_NUMBERS = new Set(["+639771026991"]);

type RosterRow = {
  phoneE164: string;
  whatsappDisplayName: string;
  scheduleContractor: string;
  isContractor: string;
  confidence: string;
  notes: string;
};

/** Minimal quote-aware CSV line split — the notes column contains commas. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

function parseRoster(path: string): RosterRow[] {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const rows: RosterRow[] = [];
  for (const line of lines.slice(1)) {
    const [phoneE164, whatsappDisplayName, scheduleContractor, isContractor, confidence, notes] =
      splitCsvLine(line);
    rows.push({
      phoneE164: (phoneE164 ?? "").trim(),
      whatsappDisplayName: (whatsappDisplayName ?? "").trim(),
      scheduleContractor: (scheduleContractor ?? "").trim(),
      isContractor: (isContractor ?? "").trim().toUpperCase(),
      confidence: (confidence ?? "").trim().toLowerCase(),
      notes: (notes ?? "").trim(),
    });
  }
  return rows;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rosterIndex = process.argv.indexOf("--roster");
  const rosterPath = rosterIndex > -1 ? process.argv[rosterIndex + 1] : DEFAULT_ROSTER;

  const roster = parseRoster(rosterPath);

  const usable: RosterRow[] = [];
  const held: string[] = [];

  for (const row of roster) {
    if (TEST_SENDER_NUMBERS.has(row.phoneE164) || /TEST SENDER/i.test(row.notes)) {
      held.push(`${row.phoneE164} ${row.whatsappDisplayName} — test sender, excluded`);
      continue;
    }
    if (row.isContractor !== "TRUE") continue; // staff / unknown: not ours to load
    if (!row.scheduleContractor) continue;
    if (row.confidence !== "high") {
      held.push(
        `${row.scheduleContractor} — roster confidence "${row.confidence}": ${row.notes || "no note"}`,
      );
      continue;
    }
    usable.push(row);
  }

  const byName = new Map(usable.map((r) => [nameKey(r.scheduleContractor), r]));

  const contractors = await db.contractor.findMany({
    select: { id: true, name: true, phone: true, whatsapp: true },
    orderBy: { name: "asc" },
  });

  const planned: { id: string; name: string; number: string }[] = [];
  const alreadySet: string[] = [];
  const noMatch: string[] = [];

  for (const c of contractors) {
    if (c.phone || c.whatsapp) {
      alreadySet.push(`${c.name} — already has ${c.phone ?? c.whatsapp}`);
      continue;
    }
    const row = byName.get(nameKey(c.name));
    if (!row) {
      noMatch.push(c.name);
      continue;
    }
    planned.push({ id: c.id, name: c.name, number: row.phoneE164 });
  }

  const appNames = new Set(contractors.map((c) => nameKey(c.name)));
  const unusedRoster = usable
    .filter((r) => !appNames.has(nameKey(r.scheduleContractor)))
    .map((r) => `${r.scheduleContractor} (${r.phoneE164})`);

  console.log(`roster: ${rosterPath}`);
  console.log(`  usable contractor rows: ${usable.length}`);
  console.log(`app contractors: ${contractors.length}`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  console.log(`will set ${planned.length}:`);
  for (const p of planned) console.log(`  ${p.name.padEnd(30)} ${p.number}`);

  if (alreadySet.length) {
    console.log(`\nleft alone (already has a number):`);
    for (const a of alreadySet) console.log(`  ${a}`);
  }
  if (noMatch.length) {
    console.log(`\n⚠ NO EXACT ROSTER MATCH — these stay unreachable by phone:`);
    for (const n of noMatch) console.log(`  ${n}`);
  }
  if (held.length) {
    console.log(`\nheld back from the roster:`);
    for (const h of held) console.log(`  ${h}`);
  }
  if (unusedRoster.length) {
    console.log(`\nroster contractors with no app record:`);
    for (const u of unusedRoster) console.log(`  ${u}`);
  }

  if (!apply || planned.length === 0) {
    if (!apply && planned.length > 0) console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  let applied = 0;
  for (const p of planned) {
    // Both columns: it is one number, reachable by voice and by WhatsApp, and
    // the fan-out's matcher normalizes and checks both. Setting only one would
    // make the match depend on which field the pipeline happened to send.
    await db.contractor.update({
      where: { id: p.id },
      data: { phone: p.number, whatsapp: p.number },
    });
    applied++;
  }

  // Prove the fan-out can actually resolve what was just written, rather than
  // trusting that a successful UPDATE means a successful match later.
  const after = await db.contractor.findMany({ select: { name: true, phone: true } });
  const normalized = after.filter((c) => normalizePhone(c.phone) !== null).length;

  console.log(`\napplied: ${applied}`);
  console.log(`contractors whose number now normalizes for matching: ${normalized}/${after.length}`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
