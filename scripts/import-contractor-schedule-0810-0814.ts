/**
 * One-off import: Smartsheet "Contractor Schedule 08-10 to 08-14-26"
 * (sheet 1391340150542212) -> Contractor + ContractorJob in this repo.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/import-contractor-schedule-0810-0814.ts [--apply]
 * Without --apply it prints the plan and writes nothing.
 *
 * IDEMPOTENT. Contractors match on exact name; a job matches on
 * (contractorId, propertyId, scheduledFor, description). Re-running skips
 * everything it already created, so a partial failure can be re-run safely.
 *
 * THINGS THE SOURCE DOES NOT CONTAIN, and how each is handled — all four are
 * visible in every job's imported provenance note rather than being silently
 * invented:
 *   1. No trade column. Trade is inferred from the task text via TRADE_BY_TASK
 *      below — one mapping applied consistently, not a per-row guess. This
 *      matters beyond display: assignContractor re-checks that a contractor
 *      holds the job's trade, so each contractor's `trades` is the union of the
 *      trades inferred from their own rows.
 *   2. No room/unit. roomLabel is left null rather than parsed out of prose.
 *   3. No urgency. Every job is urgent=false. "Address pool code violations"
 *      may well be urgent, but inventing urgency is worse than omitting it.
 *   4. No completion time. The one Completed row gets completedAt = 00:00 ET on
 *      its scheduled date — deliberately an obviously-synthetic midnight rather
 *      than a plausible-looking mid-morning time.
 *
 * "Delayed" has no equivalent in ContractorJobStatus (PLANNED / IN_PROGRESS /
 * DONE / CANCELLED). Those rows import as PLANNED with the original status in
 * the note, so the information is preserved even though the enum can't carry it.
 *
 * Contractors are created with NO phone and NO whatsapp per Kyle (2026-08-11,
 * "will add later"). That means these rows do NOT satisfy `contractorSchema`,
 * which requires one of the two — so this script writes them directly instead
 * of relaxing a validation rule for a bulk load. Consequence to expect: opening
 * one in the directory and pressing Save will refuse until a number is entered.
 */

import { ContractorJobStatus, ContractorNoteSource, Trade } from "@prisma/client";
import { db } from "../lib/db";
import { etDayStartUtc } from "../lib/datetime";

const SHEET_NAME = "Contractor Schedule 08-10 to 08-14-26";
const SHEET_ID = "1391340150542212";
const IMPORTED_BY_EMAIL = "bke@rentstayable.com";

type SourceStatus = "Pending" | "In Progress" | "Completed" | "Delayed";

type Row = {
  rowId: string;
  contractor: string;
  date: string; // dashed ET calendar date, exactly as the sheet holds it
  propertyCode: string; // Stayable property id, from "Name (id)"
  task: string;
  status: SourceStatus;
};

// Task text -> trade. Every distinct task string in the sheet appears here, so
// an unmapped task is a hard error rather than a silent fallback to GENERAL.
const TRADE_BY_TASK: Record<string, Trade> = {
  "Haul out flooring debris (with help from truck driver)": Trade.GENERAL,
  "Room renovation": Trade.GENERAL,
  "Address pool code violations": Trade.GENERAL,
  "Install HVAC units and mini split in the lobby": Trade.HVAC,
  "Awaiting possible property paint job": Trade.GENERAL,
  "Roof repair near active leak area": Trade.ROOFING,
  "Cameras and access points project": Trade.GENERAL,
  "Pool leak repair": Trade.PLUMBING,
  "Jetting the drain lines": Trade.PLUMBING,
  Jetting: Trade.PLUMBING,
};

// ⚠ HISTORICAL — deliberately NOT updated to the shared SOURCE_STATUS_MAP in
// lib/contractor-update.ts. This is a completed one-shot for the week of
// 2026-08-10, already applied to production, and this map records what was
// actually written that day: DELAYED did not exist in the enum until
// 2026-08-13, so three delayed rows landed as PLANNED with their source status
// preserved in the provenance note. Rewriting it here would misdescribe rows
// that already exist. Anything NEW uses the shared map.
const STATUS_MAP: Record<SourceStatus, ContractorJobStatus> = {
  Pending: ContractorJobStatus.PLANNED,
  "In Progress": ContractorJobStatus.IN_PROGRESS,
  Completed: ContractorJobStatus.DONE,
  Delayed: ContractorJobStatus.PLANNED,
};

const ROWS: Row[] = [
  // Alexander Torres
  { rowId: "4851143707328388", contractor: "Alexander Torres", date: "2026-08-10", propertyCode: "2535", task: "Haul out flooring debris (with help from truck driver)", status: "In Progress" },
  { rowId: "4288193753907076", contractor: "Alexander Torres", date: "2026-08-11", propertyCode: "2535", task: "Haul out flooring debris (with help from truck driver)", status: "Pending" },
  { rowId: "4991881195683716", contractor: "Alexander Torres", date: "2026-08-12", propertyCode: "812", task: "Room renovation", status: "Pending" },
  { rowId: "2177131428577156", contractor: "Alexander Torres", date: "2026-08-13", propertyCode: "812", task: "Room renovation", status: "Pending" },
  { rowId: "5202987428216708", contractor: "Alexander Torres", date: "2026-08-14", propertyCode: "812", task: "Room renovation", status: "Pending" },
  // Arlis Velazquez (the sheet also holds one name-only row with no date,
  // property or task — deliberately not imported; there is no job in it)
  { rowId: "5414093660749700", contractor: "Arlis Velazquez", date: "2026-08-10", propertyCode: "812", task: "Address pool code violations", status: "Pending" },
  { rowId: "3584506312130436", contractor: "Arlis Velazquez", date: "2026-08-11", propertyCode: "812", task: "Address pool code violations", status: "Pending" },
  { rowId: "7243681009368964", contractor: "Arlis Velazquez", date: "2026-08-12", propertyCode: "812", task: "Address pool code violations", status: "Pending" },
  { rowId: "4428931242262404", contractor: "Arlis Velazquez", date: "2026-08-13", propertyCode: "812", task: "Address pool code violations", status: "Pending" },
  { rowId: "7454787241901956", contractor: "Arlis Velazquez", date: "2026-08-14", propertyCode: "812", task: "Address pool code violations", status: "Pending" },
  // Cristian De Leon
  { rowId: "1473443986800516", contractor: "Cristian De Leon", date: "2026-08-10", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Delayed" },
  { rowId: "4710406218973060", contractor: "Cristian De Leon", date: "2026-08-11", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Pending" },
  { rowId: "1895656451866500", contractor: "Cristian De Leon", date: "2026-08-12", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Pending" },
  { rowId: "1051231521734532", contractor: "Cristian De Leon", date: "2026-08-13", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "5765937381638020", contractor: "Cristian De Leon", date: "2026-08-14", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  // David Recinos
  { rowId: "8510318404566916", contractor: "David Recinos", date: "2026-08-10", propertyCode: "44199", task: "Roof repair near active leak area", status: "Completed" },
  { rowId: "2036393940221828", contractor: "David Recinos", date: "2026-08-11", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "5273356172394372", contractor: "David Recinos", date: "2026-08-12", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "3865981288841092", contractor: "David Recinos", date: "2026-08-13", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "6891837288480644", contractor: "David Recinos", date: "2026-08-14", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  // Gary Floyd Jr.
  { rowId: "347544079957892", contractor: "Gary Floyd Jr.", date: "2026-08-10", propertyCode: "44199", task: "Roof repair near active leak area", status: "In Progress" },
  { rowId: "6539993567592324", contractor: "Gary Floyd Jr.", date: "2026-08-11", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "3021556358709124", contractor: "Gary Floyd Jr.", date: "2026-08-12", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "8369580916211588", contractor: "Gary Floyd Jr.", date: "2026-08-13", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  { rowId: "1262337754267524", contractor: "Gary Floyd Jr.", date: "2026-08-14", propertyCode: "44199", task: "Awaiting possible property paint job", status: "Pending" },
  // Gregoris Gonzalez
  { rowId: "3725243800485764", contractor: "Gregoris Gonzalez", date: "2026-08-10", propertyCode: "6802", task: "Cameras and access points project", status: "In Progress" },
  { rowId: "6962206032658308", contractor: "Gregoris Gonzalez", date: "2026-08-11", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "4147456265551748", contractor: "Gregoris Gonzalez", date: "2026-08-12", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "136437847424900", contractor: "Gregoris Gonzalez", date: "2026-08-13", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "6328887335059332", contractor: "Gregoris Gonzalez", date: "2026-08-14", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  // Jarvis Ramos
  { rowId: "8228843427856260", contractor: "Jarvis Ramos", date: "2026-08-10", propertyCode: "4645", task: "Pool leak repair", status: "In Progress" },
  { rowId: "1332706498445188", contractor: "Jarvis Ramos", date: "2026-08-11", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "8651055892922244", contractor: "Jarvis Ramos", date: "2026-08-12", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "5554831149105028", contractor: "Jarvis Ramos", date: "2026-08-13", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "3514137567952772", contractor: "Jarvis Ramos", date: "2026-08-14", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  // Jesus Perez
  { rowId: "7102943521013636", contractor: "Jesus Perez", date: "2026-08-10", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Pending" },
  { rowId: "206806591602564", contractor: "Jesus Perez", date: "2026-08-11", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Pending" },
  { rowId: "7525155986079620", contractor: "Jesus Perez", date: "2026-08-12", propertyCode: "6802", task: "Install HVAC units and mini split in the lobby", status: "Pending" },
  { rowId: "7806630962790276", contractor: "Jesus Perez", date: "2026-08-13", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "699387800846212", contractor: "Jesus Perez", date: "2026-08-14", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  // Jose Felix Ortega
  { rowId: "910494033379204", contractor: "Jose Felix Ortega", date: "2026-08-10", propertyCode: "4645", task: "Pool leak repair", status: "Delayed" },
  { rowId: "5836306125815684", contractor: "Jose Felix Ortega", date: "2026-08-11", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "488281568313220", contractor: "Jose Felix Ortega", date: "2026-08-12", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "3303031335419780", contractor: "Jose Felix Ortega", date: "2026-08-13", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  { rowId: "8017737195323268", contractor: "Jose Felix Ortega", date: "2026-08-14", propertyCode: "4645", task: "Pool leak repair", status: "Pending" },
  // Joycer Antonio Parra Munoz
  { rowId: "2599343893643140", contractor: "Joycer Antonio Parra Munoz", date: "2026-08-10", propertyCode: "2535", task: "Haul out flooring debris (with help from truck driver)", status: "In Progress" },
  { rowId: "8791793381277572", contractor: "Joycer Antonio Parra Munoz", date: "2026-08-11", propertyCode: "2535", task: "Haul out flooring debris (with help from truck driver)", status: "Pending" },
  { rowId: "2740081381998468", contractor: "Joycer Antonio Parra Munoz", date: "2026-08-12", propertyCode: "812", task: "Room renovation", status: "Pending" },
  { rowId: "6680731055947652", contractor: "Joycer Antonio Parra Munoz", date: "2026-08-13", propertyCode: "812", task: "Room renovation", status: "Pending" },
  { rowId: "2951187614531460", contractor: "Joycer Antonio Parra Munoz", date: "2026-08-14", propertyCode: "812", task: "Room renovation", status: "Pending" },
  // Orlando Torres
  { rowId: "7665893474434948", contractor: "Orlando Torres", date: "2026-08-10", propertyCode: "2295", task: "Jetting the drain lines", status: "Delayed" },
  { rowId: "769756545023876", contractor: "Orlando Torres", date: "2026-08-11", propertyCode: "2295", task: "Jetting the drain lines", status: "Pending" },
  { rowId: "6117781102526340", contractor: "Orlando Torres", date: "2026-08-12", propertyCode: "8700", task: "Jetting", status: "Pending" },
  { rowId: "2388237661110148", contractor: "Orlando Torres", date: "2026-08-13", propertyCode: "8700", task: "Jetting", status: "Pending" },
  { rowId: "8580687148744580", contractor: "Orlando Torres", date: "2026-08-14", propertyCode: "5399", task: "Jetting", status: "Pending" },
  // Ronal Stevent Rojas Mora
  { rowId: "3162293847064452", contractor: "Ronal Stevent Rojas Mora", date: "2026-08-10", propertyCode: "2295", task: "Jetting the drain lines", status: "In Progress" },
  { rowId: "8088105939500932", contractor: "Ronal Stevent Rojas Mora", date: "2026-08-11", propertyCode: "2295", task: "Jetting the drain lines", status: "Pending" },
  { rowId: "1614181475155844", contractor: "Ronal Stevent Rojas Mora", date: "2026-08-12", propertyCode: "8700", task: "Jetting", status: "Pending" },
  { rowId: "4640037474795396", contractor: "Ronal Stevent Rojas Mora", date: "2026-08-13", propertyCode: "8700", task: "Jetting", status: "Pending" },
  { rowId: "4077087521374084", contractor: "Ronal Stevent Rojas Mora", date: "2026-08-14", propertyCode: "5399", task: "Jetting", status: "Pending" },
  // Zacharie Edmond
  { rowId: "5977043614171012", contractor: "Zacharie Edmond", date: "2026-08-10", propertyCode: "6802", task: "Cameras and access points project", status: "In Progress" },
  { rowId: "2458606405287812", contractor: "Zacharie Edmond", date: "2026-08-11", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "6399256079236996", contractor: "Zacharie Edmond", date: "2026-08-12", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "8932530869632900", contractor: "Zacharie Edmond", date: "2026-08-13", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
  { rowId: "1825287707688836", contractor: "Zacharie Edmond", date: "2026-08-14", propertyCode: "6802", task: "Cameras and access points project", status: "Pending" },
];

function tradeFor(task: string): Trade {
  const trade = TRADE_BY_TASK[task];
  if (!trade) throw new Error(`No trade mapping for task: "${task}" — add it to TRADE_BY_TASK`);
  return trade;
}

function dateColumn(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function provenanceNote(row: Row): string {
  const lines = [
    `Imported from Smartsheet "${SHEET_NAME}" (sheet ${SHEET_ID}, row ${row.rowId}) on 2026-08-11.`,
    `Source status: ${row.status}.`,
    `Trade recorded as ${tradeFor(row.task)} — inferred from the task text, since the source sheet has no trade column.`,
    "The source carries no room/unit and no urgency, so neither was invented here.",
  ];
  if (row.status === "Delayed") {
    lines.push(
      'There is no "Delayed" status in this system, so the job is Planned; the source status is recorded above.',
    );
  }
  if (row.status === "Completed") {
    lines.push(
      "Completion time is unknown — the source records a date only, so the completed timestamp is 00:00 ET on the scheduled date, not an observed time.",
    );
  }
  return lines.join(" ");
}

async function main() {
  const apply = process.argv.includes("--apply");

  const properties = await db.property.findMany({ select: { id: true, propertyId: true, shortCode: true } });
  const propertyByCode = new Map(properties.map((p) => [p.propertyId, p]));

  const importer = await db.user.findUnique({ where: { email: IMPORTED_BY_EMAIL }, select: { id: true } });
  if (!importer) throw new Error(`Importing user ${IMPORTED_BY_EMAIL} not found`);

  // Each contractor's trades/properties are the union of their own rows, which
  // is what makes them eligible for the jobs being assigned: assignContractor
  // re-checks trade and property server-side.
  const byContractor = new Map<string, { trades: Set<Trade>; propertyIds: Set<string> }>();
  for (const row of ROWS) {
    const property = propertyByCode.get(row.propertyCode);
    if (!property) throw new Error(`Unknown property code ${row.propertyCode} (row ${row.rowId})`);
    const entry = byContractor.get(row.contractor) ?? { trades: new Set(), propertyIds: new Set() };
    entry.trades.add(tradeFor(row.task));
    entry.propertyIds.add(property.id);
    byContractor.set(row.contractor, entry);
  }

  console.log(`${ROWS.length} source job rows · ${byContractor.size} contractors`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  for (const [name, meta] of byContractor) {
    console.log(
      `  ${name.padEnd(28)} trades=${[...meta.trades].join(",").padEnd(16)} properties=${
        [...meta.propertyIds]
          .map((id) => properties.find((p) => p.id === id)?.shortCode)
          .sort()
          .join(",")
      }`,
    );
  }

  if (!apply) {
    const counts = ROWS.reduce<Record<string, number>>((acc, r) => {
      const mapped = STATUS_MAP[r.status];
      acc[`${r.status} -> ${mapped}`] = (acc[`${r.status} -> ${mapped}`] ?? 0) + 1;
      return acc;
    }, {});
    console.log("\nstatus mapping:");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
    console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  const contractorIdByName = new Map<string, string>();
  let contractorsCreated = 0;
  for (const [name, meta] of byContractor) {
    const existing = await db.contractor.findFirst({ where: { name }, select: { id: true } });
    if (existing) {
      contractorIdByName.set(name, existing.id);
      continue;
    }
    const created = await db.$transaction(async (tx) => {
      const contractor = await tx.contractor.create({
        data: {
          name,
          trades: [...meta.trades],
          // No phone/whatsapp on purpose (Kyle: "will add later"). These rows
          // therefore do not satisfy contractorSchema.
          phone: null,
          whatsapp: null,
          notes: `Imported from Smartsheet "${SHEET_NAME}" on 2026-08-11. No phone or WhatsApp on file yet.`,
          properties: { create: [...meta.propertyIds].map((propertyId) => ({ propertyId })) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: importer.id,
          entityType: "Contractor",
          entityId: contractor.id,
          action: "import",
          after: { name, trades: [...meta.trades], propertyIds: [...meta.propertyIds], source: SHEET_ID },
        },
      });
      return contractor;
    });
    contractorIdByName.set(name, created.id);
    contractorsCreated++;
  }

  let jobsCreated = 0;
  let jobsSkipped = 0;
  for (const row of ROWS) {
    const property = propertyByCode.get(row.propertyCode)!;
    const contractorId = contractorIdByName.get(row.contractor)!;
    const scheduledFor = dateColumn(row.date);
    const status = STATUS_MAP[row.status];

    const existing = await db.contractorJob.findFirst({
      where: { contractorId, propertyId: property.id, scheduledFor, description: row.task },
      select: { id: true },
    });
    if (existing) {
      jobsSkipped++;
      continue;
    }

    await db.$transaction(async (tx) => {
      const job = await tx.contractorJob.create({
        data: {
          propertyId: property.id,
          roomLabel: null,
          trade: tradeFor(row.task),
          description: row.task,
          urgent: false,
          status,
          contractorId,
          scheduledFor,
          createdByUserId: importer.id,
          completedAt: status === ContractorJobStatus.DONE ? etDayStartUtc(row.date) : null,
          closeNote:
            status === ContractorJobStatus.DONE
              ? `Recorded Completed in Smartsheet "${SHEET_NAME}" (row ${row.rowId}). Imported, not verified here.`
              : null,
        },
        select: { id: true },
      });
      await tx.contractorJobNote.create({
        data: {
          jobId: job.id,
          source: ContractorNoteSource.SYSTEM,
          authorUserId: null,
          authorLabel: "Smartsheet import",
          body: provenanceNote(row),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: importer.id,
          entityType: "ContractorJob",
          entityId: job.id,
          action: "import",
          after: {
            source: SHEET_ID,
            sourceRowId: row.rowId,
            sourceStatus: row.status,
            propertyId: property.id,
            scheduledFor: row.date,
            description: row.task,
            contractorId,
          },
        },
      });
      jobsCreated++;
    });
  }

  console.log(
    `\ncontractors created: ${contractorsCreated} (existing reused: ${byContractor.size - contractorsCreated})`,
  );
  console.log(`jobs created: ${jobsCreated} · already present, skipped: ${jobsSkipped}`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
