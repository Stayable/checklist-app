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
 * ⚠ THE ENUM CANNOT EXPRESS "Delayed". Pending and Delayed both map to PLANNED,
 * so a Pending -> Delayed change moves nothing in the status field. The sync
 * still records it as a note by tracking the last-seen SOURCE status in
 * audit_log, or that transition would be invisible here. If Delayed matters
 * operationally it should become a real status — that is a schema decision.
 */

import { readFileSync } from "fs";
import { ContractorJobStatus, ContractorNoteSource, Prisma, Trade } from "@prisma/client";
import { db } from "../lib/db";
import { etDayStartUtc } from "../lib/datetime";

const DEFAULT_SNAPSHOT = "scripts/data/smartsheet-contractor-schedule-snapshot.json";
const ACTOR_EMAIL = "bke@rentstayable.com";
const WHATSAPP_AUTHOR = "WhatsApp update (via Smartsheet)";
const SYNC_AUTHOR = "Smartsheet sync";

type SourceStatus = "Pending" | "In Progress" | "Completed" | "Delayed" | "Off";

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

// Same mapping the import used — kept identical on purpose so a re-import and a
// sync can never disagree about what a source status means.
const STATUS_MAP: Record<SourceStatus, ContractorJobStatus> = {
  Pending: ContractorJobStatus.PLANNED,
  "In Progress": ContractorJobStatus.IN_PROGRESS,
  Completed: ContractorJobStatus.DONE,
  Delayed: ContractorJobStatus.PLANNED,
  Off: ContractorJobStatus.CANCELLED,
};

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

function tradeFor(task: string): Trade {
  const trade = TRADE_BY_TASK[task];
  if (!trade) throw new Error(`No trade mapping for task: "${task}" — add it to TRADE_BY_TASK`);
  return trade;
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

  for (const row of snapshot.rows) {
    // A row with no date/property/task carries no job (the sheet holds one such
    // name-only row whose WhatsApp update is flagged for a human).
    if (!row.date || !row.propertyCode || !row.task || !row.status) {
      if (row.whatsapp) {
        skipped.push(`${row.contractor} row ${row.rowId} — update present but no date/property/task`);
      }
      continue;
    }

    const property = propertyByCode.get(row.propertyCode);
    if (!property) throw new Error(`Unknown property code ${row.propertyCode} (row ${row.rowId})`);

    const jobId = jobIdByRowId.get(row.rowId) ?? null;
    const target = STATUS_MAP[row.status];

    if (!jobId) {
      changes.push({
        row,
        jobId: null,
        kind: "create",
        detail: `new sheet row → ${property.shortCode} ${row.date} ${row.status}`,
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
      // Only assign when the contractor genuinely covers this trade AND
      // property — the same rule the UI's assign action enforces. Otherwise the
      // job lands unassigned rather than carrying an assignment the app itself
      // would reject.
      const eligible =
        contractor &&
        contractor.trades.includes(trade) &&
        contractor.properties.some((p) => p.propertyId === property.id);
      const status = STATUS_MAP[row.status!];

      await db.$transaction(async (tx) => {
        const job = await tx.contractorJob.create({
          data: {
            propertyId: property.id,
            trade,
            description: row.task!,
            urgent: false,
            status,
            contractorId: eligible ? contractor!.id : null,
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
              assigned: Boolean(eligible),
            },
          },
        });
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
            body: `Smartsheet status changed to "${row.status}". This system has no separate ${row.status} state, so the job stays ${STATUS_MAP[row.status!]}.`,
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
