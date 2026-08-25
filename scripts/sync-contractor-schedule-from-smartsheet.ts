/**
 * TEMPORARY one-way sync: Smartsheet contractor schedule -> this app.
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/sync-contractor-schedule-from-smartsheet.ts [--apply]
 *       (add --snapshot <path> to use a different capture)
 *
 * Kyle, 2026-08-12: keep the calendar in step with the sheet for now; later the
 * middleware that writes the sheet will post to both, and this goes away.
 *
 * ⚠ THIS IS NOT AUTOMATED, AND CANNOT BE YET. The app holds no Smartsheet
 * credential — the sheet is read through an MCP connection that belongs to a
 * Claude session, not to the deployment. So the flow is: a fresh capture is
 * written to scripts/data/smartsheet-contractor-schedule-snapshot.json, then
 * this runs against it. Making it hands-off needs a Smartsheet API token in the
 * Vercel environment plus a cron route; that is a separate, deliberate step.
 *
 * DIRECTION: sheet -> app only. Nothing here writes back to Smartsheet.
 *
 * CONFLICT RULES, in the order they matter:
 *
 *  1. A TERMINAL JOB IS NEVER REOPENED. If a job is DONE or CANCELLED here and
 *     the sheet disagrees, the sheet is ignored and the conflict is reported.
 *     Terminal immutability is an invariant of this feature (ADR-030); a sync
 *     that quietly broke it would make the rule meaningless everywhere else.
 *  2. Otherwise the SHEET WINS for status, date and task text. It is the surface
 *     the crews and GM actually update today. Consequence, stated plainly: a
 *     status change made in this app can be overwritten by the next sync.
 *  3. A PROPERTY CHANGE IS REPORTED, NOT APPLIED. Moving a job to another
 *     property invalidates the assigned contractor's eligibility (they are
 *     vetted per property), so it needs a human, not a bulk update.
 *  4. NOTES ARE ONLY EVER APPENDED. The tables are append-only by shape, so a
 *     changed WhatsApp update adds a new note and the old one stays as history.
 *
 * ✅ "Delayed" IS now expressible (2026-08-13). ContractorJobStatus gained
 * DELAYED for the update fan-out, so the source vocabulary and the app enum are
 * one-to-one and a Pending -> Delayed change moves the status field like any
 * other. The map lives in lib/contractor-update.ts and is IMPORTED here, not
 * copied — see STATUS_MAP below for why that matters.
 *
 * The source-status-note branch below survives that change. It is no longer
 * about Delayed; it now fires only when the app already holds the status the
 * sheet just moved to (a manager set it here first), where a status write
 * would be a no-op but the transition is still worth recording.
 */

import { readFileSync } from "fs";
import { ContractorJobStatus, ContractorNoteSource, Prisma, Trade } from "@prisma/client";
import { db } from "../lib/db";
import { SOURCE_STATUS_MAP, type SourceStatus } from "../lib/contractor-update";
import { etDayStartUtc } from "../lib/datetime";

// CONVENTION: the default path always holds the CURRENT week, so the Monday run
// is one command with no flags. A week that has rolled off keeps a dated copy
// beside it (…-0817.json) and is loaded with --snapshot.
//
// Those dated files are not clutter. Smartsheet reuses one sheet id and the
// rollover CLEARS THE ROWS IN PLACE — verified 2026-08-25, when the 08/17 and
// 08/24 captures shared zero rowIds — so once a week rolls over, the capture
// here is the only record of it that exists anywhere.
const DEFAULT_SNAPSHOT = "scripts/data/smartsheet-contractor-schedule-snapshot.json";
const ACTOR_EMAIL = "bke@rentstayable.com";
const WHATSAPP_AUTHOR = "WhatsApp update (via Smartsheet)";
const SYNC_AUTHOR = "Smartsheet sync";

type Row = {
  rowId: string;
  contractor: string;
  date: string | null;
  propertyCode: string | null;
  task: string | null;
  status: SourceStatus | null;
  whatsapp: string | null;
};

type Snapshot = { sheetId: string; sheetName: string; capturedAt: string; rows: Row[] };

// ⚠ NO LOCAL COPY. This used to be its own map here, which is precisely the
// hazard: during the overlap window (fan-out contract §10.6) BOTH this script
// and the webhook receiver write the same status field, and a map that said
// Delayed -> PLANNED here while the receiver wrote DELAYED would not merely
// revert a delayed job on the next run — it would append a SYSTEM note
// claiming Smartsheet said so, to an append-only thread nobody can correct.
// Importing the one definition makes that divergence unrepresentable rather
// than something a comment asks the next reader to remember.
const STATUS_MAP = SOURCE_STATUS_MAP;

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
  // Week of 08/17. Only rows whose trade is NOT General are listed; cameras,
  // conduit, paint, drywall, flooring and day-off rows fall to the default.
  "Fix water leak affecting Unit 167 toilet area": Trade.PLUMBING,
  "Repair P-traps and verify plumbing is in good condition in the rooms assigned to the rest of the crew (Rooms 224, 233, 138, 142)":
    Trade.PLUMBING,
  "Jetting drain lines": Trade.PLUMBING,
  "Check the AC in the lobby": Trade.HVAC,
  "Pool electrical work on lights; drainage testing and installing test pumps": Trade.ELECTRICAL,
  // Week of 08/24. Same convention: only non-General rows. Pool deck tiles, the
  // JN chain fence, the AP project, both paint jobs and the day-off rows are all
  // General and fall to the default. "Jetting drain lines" is already above —
  // the first task string to survive a week unchanged.
  "Repair HVAC/AC units in rooms reporting issues": Trade.HVAC,
  "Palm trimming / tree trimming": Trade.LANDSCAPING,
};

// Task text this map does not know. Collected, reported at the end of the run,
// and deliberately not fatal — see tradeFor.
const unmappedTasks = new Set<string>();

/**
 * Trade for a task, defaulting to GENERAL.
 *
 * This used to throw. Gerardo rewrites the task text every week: of the 65 rows
 * in the 08/17 week, ZERO matched the map built from the 08/10 week — including
 * the near-misses ("Cameras project" vs "Cameras and access points project",
 * "Jetting drain lines" vs "Jetting the drain lines"). A hard throw therefore
 * stopped the entire week loading on row one, and once the fan-out contract's
 * §10.6 strip lands, this path is the only thing that loads a week at all.
 * Contract §9.3: default and report.
 *
 * Trade is descriptive metadata on the job. It no longer gates assignment (see
 * the create branch), so the default cannot misfile a crew update.
 */
function tradeFor(task: string): Trade {
  const trade = TRADE_BY_TASK[task];
  if (!trade) {
    unmappedTasks.add(task);
    return Trade.GENERAL;
  }
  return trade;
}

type ContractorLookup = {
  id: string;
  trades: Trade[];
  properties: { propertyId: string }[];
};

// Cached for the detection pass only. The apply pass re-reads each contractor so
// it sees property links added earlier in the same run.
const contractorCache = new Map<string, ContractorLookup | null>();

async function contractorByName(name: string): Promise<ContractorLookup | null> {
  const cached = contractorCache.get(name);
  if (cached !== undefined) return cached;
  const contractor = await db.contractor.findFirst({
    where: { name },
    select: { id: true, trades: true, properties: { select: { propertyId: true } } },
  });
  contractorCache.set(name, contractor);
  return contractor;
}

function dateColumn(ymd: string): Date {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== ymd) {
    throw new Error(`Not a real calendar date: ${ymd}`);
  }
  return date;
}

type Change = { row: Row; jobId: string | null; kind: string; detail: string };

async function main() {
  const apply = process.argv.includes("--apply");
  const snapshotIndex = process.argv.indexOf("--snapshot");
  const snapshotPath = snapshotIndex > -1 ? process.argv[snapshotIndex + 1] : DEFAULT_SNAPSHOT;
  const snapshot: Snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));

  const actor = await db.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true } });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found`);

  const properties = await db.property.findMany({ select: { id: true, propertyId: true, shortCode: true } });
  const propertyByCode = new Map(properties.map((p) => [p.propertyId, p]));
  const shortCodeById = new Map(properties.map((p) => [p.id, p.shortCode]));

  // rowId -> jobId, from the audit trail the import wrote. This is the only
  // durable link between a Smartsheet row and a job here.
  const links = await db.auditLog.findMany({
    where: { entityType: "ContractorJob", action: { in: ["import", "sync"] } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, after: true, createdAt: true },
  });
  const jobIdByRowId = new Map<string, string>();
  const lastSourceStatusByRowId = new Map<string, string>();
  for (const link of links) {
    const after = link.after as Prisma.JsonObject | null;
    const rowId = after?.sourceRowId;
    if (typeof rowId !== "string") continue;
    jobIdByRowId.set(rowId, link.entityId);
    const sourceStatus = after?.sourceStatus;
    if (typeof sourceStatus === "string") lastSourceStatusByRowId.set(rowId, sourceStatus);
  }

  const changes: Change[] = [];
  const conflicts: string[] = [];
  const skipped: string[] = [];
  const unmappedProperties: string[] = [];
  const propertyLinksAdded: string[] = [];
  const tradeMismatches: string[] = [];

  for (const row of snapshot.rows) {
    // A row with no date/property/task carries no job (the sheet holds one such
    // name-only row whose WhatsApp update is flagged for a human).
    if (!row.date || !row.propertyCode || !row.task || !row.status) {
      if (row.whatsapp) {
        skipped.push(`${row.contractor} row ${row.rowId} — update present but no date/property/task`);
      }
      continue;
    }

    // An unmapped location is REPORTED AND SKIPPED, never fatal (fan-out
    // contract §7, the `Boca Condo` case). A ContractorJob requires a property,
    // so no job can exist for one — but throwing here would take the other 59
    // rows of the week down with it. Creating a Property row instead is a plan
    // decision (§9.4: a NAMED row, never `OTHERS`), not a load side effect.
    // Consequence, stated plainly: crew updates for these rows resolve to
    // ContractorDailyNote with a null property.
    const property = propertyByCode.get(row.propertyCode);
    if (!property) {
      unmappedProperties.push(
        `${row.contractor} ${row.date} row ${row.rowId} — "${row.propertyCode}" has no Property row in this app`,
      );
      continue;
    }

    const jobId = jobIdByRowId.get(row.rowId) ?? null;
    const target = STATUS_MAP[row.status];

    if (!jobId) {
      // Resolve the assignment HERE rather than in the apply pass, so a dry run
      // reports the same assignment decision the write would make. Silence about
      // who a job lands on is the failure mode this whole load is guarding
      // against.
      const contractor = await contractorByName(row.contractor);
      const trade = tradeFor(row.task);
      if (contractor === null) {
        skipped.push(`${row.contractor} ${row.date} — no contractor on file with this name`);
      } else {
        if (!contractor.trades.includes(trade)) {
          tradeMismatches.push(
            `${row.contractor} ${row.date} ${property.shortCode} — job is ${trade}, on file as ${contractor.trades.join("/")}`,
          );
        }
        if (!contractor.properties.some((p) => p.propertyId === property.id)) {
          propertyLinksAdded.push(`${row.contractor} → ${property.shortCode}`);
        }
      }
      changes.push({
        row,
        jobId: null,
        kind: "create",
        detail: `new sheet row → ${property.shortCode} ${row.date} ${row.status} · ${trade} · ${
          contractor ? "assigned" : "UNASSIGNED (name not on file)"
        }`,
      });
      continue;
    }

    const job = await db.contractorJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        description: true,
        propertyId: true,
        completedAt: true,
        closeNote: true,
        notes: { select: { body: true } },
      },
    });
    if (!job) {
      conflicts.push(`row ${row.rowId} links to job ${jobId}, which no longer exists`);
      continue;
    }

    const terminal =
      job.status === ContractorJobStatus.DONE || job.status === ContractorJobStatus.CANCELLED;

    // Rule 3: a property move needs a human — it invalidates the assignment.
    if (job.propertyId !== property.id) {
      conflicts.push(
        `${row.contractor} ${row.date}: sheet says ${property.shortCode}, app has ${
          shortCodeById.get(job.propertyId) ?? "?"
        } — not moved (would invalidate the contractor's per-property eligibility)`,
      );
    }

    // Rule 1: never reopen a terminal job.
    if (terminal && target !== job.status) {
      conflicts.push(
        `${row.contractor} ${row.date}: job is ${job.status} here but the sheet says "${row.status}" — left closed`,
      );
    } else if (target !== job.status) {
      changes.push({
        row,
        jobId,
        kind: "status",
        detail: `${job.status} → ${target} (sheet: ${row.status})`,
      });
    }

    // The source status changed but maps to the same app status — record it or
    // a Pending → Delayed transition disappears entirely.
    const lastSource = lastSourceStatusByRowId.get(row.rowId);
    if (lastSource && lastSource !== row.status && target === job.status) {
      changes.push({
        row,
        jobId,
        kind: "source-status-note",
        detail: `${lastSource} → ${row.status} (both are ${target} here)`,
      });
    }

    if (!terminal) {
      const currentYmd = job.scheduledFor ? job.scheduledFor.toISOString().slice(0, 10) : null;
      if (currentYmd !== row.date) {
        changes.push({ row, jobId, kind: "reschedule", detail: `${currentYmd ?? "backlog"} → ${row.date}` });
      }
      if (job.description !== row.task) {
        changes.push({ row, jobId, kind: "description", detail: `task text changed` });
      }
    }

    // Rule 4: append a new update; never rewrite an old one.
    if (row.whatsapp && !job.notes.some((n) => n.body === row.whatsapp)) {
      changes.push({ row, jobId, kind: "whatsapp-note", detail: row.whatsapp.slice(0, 60) + "…" });
    }
  }

  console.log(`snapshot: ${snapshot.sheetName} (captured ${snapshot.capturedAt}), ${snapshot.rows.length} rows`);
  console.log(`linked jobs: ${jobIdByRowId.size}`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  if (changes.length === 0) console.log("  no changes — the app already matches the sheet");
  for (const change of changes) {
    console.log(`  ${change.kind.padEnd(20)} ${change.row.contractor.padEnd(28)} ${change.row.date ?? "—"}  ${change.detail}`);
  }
  if (conflicts.length > 0) {
    console.log(`\n⚠ conflicts (reported, NOT applied):`);
    for (const c of conflicts) console.log(`    ${c}`);
  }
  if (skipped.length > 0) {
    console.log(`\nskipped rows:`);
    for (const s of skipped) console.log(`    ${s}`);
  }
  if (unmappedProperties.length > 0) {
    console.log(
      `\n🚩 UNMAPPED LOCATION — ${unmappedProperties.length} row(s) skipped, no job can exist (fan-out contract §7/§9.4):`,
    );
    for (const u of unmappedProperties) console.log(`    ${u}`);
    console.log(
      `    Crew updates for these dates will land in ContractorDailyNote with no property.`,
    );
  }
  if (unmappedTasks.size > 0) {
    console.log(`\n⚠ task text not in TRADE_BY_TASK — defaulted to GENERAL (§9.3):`);
    for (const t of unmappedTasks) console.log(`    "${t}"`);
  }
  if (tradeMismatches.length > 0) {
    console.log(`\nℹ trade differs from the contractor's file (recorded, does NOT block assignment):`);
    for (const t of [...new Set(tradeMismatches)]) console.log(`    ${t}`);
  }
  if (propertyLinksAdded.length > 0) {
    const unique = [...new Set(propertyLinksAdded)];
    console.log(
      `\nℹ property coverage the sheet implies but the directory lacks — ${unique.length} link(s) will be added, audited:`,
    );
    for (const p of unique) console.log(`    ${p}`);
  }

  if (!apply || changes.length === 0) {
    if (!apply && changes.length > 0) console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  let applied = 0;
  for (const change of changes) {
    const row = change.row;
    const property = propertyByCode.get(row.propertyCode!)!;

    if (change.kind === "create") {
      const contractor = await db.contractor.findFirst({
        where: { name: row.contractor },
        select: { id: true, trades: true, properties: { select: { propertyId: true } } },
      });
      const trade = tradeFor(row.task!);
      // THE SHEET DECIDES WHO WORKS WHERE (Kyle, 2026-08-18).
      //
      // This used to assign only when the contractor already covered both the
      // trade and the property, and left the job unassigned otherwise. Measured
      // against the 08/17 week that would have stripped 38 of 59 assignments,
      // because `contractor_properties` and `trades` were both inferred from the
      // 08/10 sheet and Gerardo moved nearly the whole crew (Jarvis Ramos:
      // PLUMBING at LL on file, laying flooring at JN this week).
      //
      // An unassigned job is not merely cosmetic — the fan-out resolves a crew
      // update on (workDate, contractor), so a null contractor means no
      // candidate, the update files as a ContractorDailyNote, and the calendar
      // looks untouched. The stale vetting list would silently defeat the
      // feature it is supposed to protect.
      //
      // So: assign from the sheet, and treat a missing property link as the
      // stale artefact it is — add it, audited. A trade mismatch is recorded but
      // never blocks: trade is descriptive here, and the sheet is Gerardo's.
      // Reported in the detection pass above; here it only drives the write.
      const missingPropertyLink =
        contractor !== null && !contractor.properties.some((p) => p.propertyId === property.id);
      const status = STATUS_MAP[row.status!];

      await db.$transaction(async (tx) => {
        const job = await tx.contractorJob.create({
          data: {
            propertyId: property.id,
            trade,
            description: row.task!,
            urgent: false,
            status,
            contractorId: contractor?.id ?? null,
            scheduledFor: dateColumn(row.date!),
            createdByUserId: actor.id,
            completedAt: status === ContractorJobStatus.DONE ? etDayStartUtc(row.date!) : null,
          },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            entityType: "ContractorJob",
            entityId: job.id,
            action: "sync",
            after: {
              source: snapshot.sheetId,
              sourceRowId: row.rowId,
              sourceStatus: row.status,
              created: true,
              assigned: contractor !== null,
              propertyLinkAdded: missingPropertyLink,
              tradeOnFile: contractor?.trades ?? null,
            },
          },
        });
        // Bring the vetting list up to date with the sheet, in the same
        // transaction as the assignment it justifies. `createMany` +
        // skipDuplicates so a concurrent run cannot collide on the composite key.
        if (missingPropertyLink) {
          await tx.contractorProperty.createMany({
            data: [{ contractorId: contractor!.id, propertyId: property.id }],
            skipDuplicates: true,
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              entityType: "Contractor",
              entityId: contractor!.id,
              action: "sync",
              after: {
                source: snapshot.sheetId,
                sourceRowId: row.rowId,
                propertyLinkAdded: property.shortCode,
                reason: "sheet assigned this contractor to a property they did not cover",
              },
            },
          });
        }
        if (row.whatsapp) {
          await tx.contractorJobNote.create({
            data: {
              jobId: job.id,
              source: ContractorNoteSource.SYSTEM,
              authorLabel: WHATSAPP_AUTHOR,
              body: row.whatsapp,
            },
          });
        }
      });
      applied++;
      continue;
    }

    const jobId = change.jobId!;

    if (change.kind === "status") {
      const status = STATUS_MAP[row.status!];
      await db.$transaction(async (tx) => {
        await tx.contractorJob.update({
          where: { id: jobId },
          data: {
            status,
            completedAt: status === ContractorJobStatus.DONE ? etDayStartUtc(row.date!) : null,
            closeNote:
              status === ContractorJobStatus.DONE || status === ContractorJobStatus.CANCELLED
                ? `Recorded "${row.status}" in Smartsheet (row ${row.rowId}). Imported, not verified here.`
                : null,
          },
        });
        await tx.contractorJobNote.create({
          data: {
            jobId,
            source: ContractorNoteSource.SYSTEM,
            authorLabel: SYNC_AUTHOR,
            body: `Status changed to ${status} — Smartsheet now says "${row.status}".`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            entityType: "ContractorJob",
            entityId: jobId,
            action: "sync",
            after: { source: snapshot.sheetId, sourceRowId: row.rowId, sourceStatus: row.status, status },
          },
        });
      });
      applied++;
    }

    if (change.kind === "source-status-note") {
      await db.$transaction(async (tx) => {
        await tx.contractorJobNote.create({
          data: {
            jobId,
            source: ContractorNoteSource.SYSTEM,
            authorLabel: SYNC_AUTHOR,
            body: `Smartsheet status changed to "${row.status}". This job is already ${STATUS_MAP[row.status!]} here, so nothing moved.`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            entityType: "ContractorJob",
            entityId: jobId,
            action: "sync",
            after: { source: snapshot.sheetId, sourceRowId: row.rowId, sourceStatus: row.status },
          },
        });
      });
      applied++;
    }

    if (change.kind === "reschedule") {
      await db.$transaction(async (tx) => {
        await tx.contractorJob.update({
          where: { id: jobId },
          data: { scheduledFor: dateColumn(row.date!) },
        });
        await tx.contractorJobNote.create({
          data: {
            jobId,
            source: ContractorNoteSource.SYSTEM,
            authorLabel: SYNC_AUTHOR,
            body: `Rescheduled to ${row.date} — Smartsheet moved this row.`,
          },
        });
      });
      applied++;
    }

    if (change.kind === "description") {
      await db.$transaction(async (tx) => {
        const previous = await tx.contractorJob.findUnique({
          where: { id: jobId },
          select: { description: true },
        });
        await tx.contractorJob.update({ where: { id: jobId }, data: { description: row.task! } });
        await tx.contractorJobNote.create({
          data: {
            jobId,
            source: ContractorNoteSource.SYSTEM,
            authorLabel: SYNC_AUTHOR,
            body: `Task updated from Smartsheet. Was: "${previous?.description ?? "?"}".`,
          },
        });
      });
      applied++;
    }

    if (change.kind === "whatsapp-note") {
      await db.contractorJobNote.create({
        data: {
          jobId,
          source: ContractorNoteSource.SYSTEM,
          authorLabel: WHATSAPP_AUTHOR,
          body: row.whatsapp!,
        },
      });
      applied++;
    }
  }

  console.log(`\napplied: ${applied} change(s)`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
