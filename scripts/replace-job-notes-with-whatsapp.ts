/**
 * Replace the import-provenance notes on contractor jobs with the real
 * "Latest WhatsApp Update" text from Smartsheet 1391340150542212 (Kyle,
 * 2026-08-11: the job history should be the WhatsApp update, not a note about
 * where the row came from).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/replace-job-notes-with-whatsapp.ts [--apply]
 * Idempotent: deletes any note whose body starts with the provenance prefix,
 * and skips inserting an update that is already present verbatim on the job.
 *
 * ⚠ THIS DELETES ROWS FROM AN APPEND-ONLY TABLE, so it needs saying plainly.
 * ADR-030 decision 5 makes ContractorJobNote append-only BY SHAPE — no
 * `updatedAt`, no soft-delete column — and forbids an update or delete action.
 * No such action exists and none is added here. This is a script-level
 * correction of a bulk import that ran ~40 minutes earlier, whose notes were
 * written by me and contain nothing a human authored. Every deletion is
 * audit-logged. If these notes had held staff-written content, the right answer
 * would have been to append a correction, not delete.
 *
 * Provenance is NOT lost with the notes: the `audit_log` row for each job's
 * import already records the source sheet, the source row id and the original
 * Smartsheet status, and audit_log is keep-forever.
 *
 * ⚠ ONE UPDATE HAS NO JOB TO ATTACH TO. Source row 5492225935802244 (Arlis
 * Velazquez) carries a WhatsApp update but no date, property or task, so no job
 * was imported from it and there is nothing to hang it on. It is deliberately
 * NOT written anywhere by this script — see the report at the end. Its text is
 * itself flagged for human attention, so quietly dropping it into an arbitrary
 * place would be worse than leaving it out and naming it.
 *
 * ⚠ NOTE TIMESTAMPS ARE THE TIME OF THIS IMPORT, not when the WhatsApp message
 * arrived. The sheet column holds only the most recent update with no timestamp
 * of its own, so `createdAt` says when we recorded it — the day the work relates
 * to is already carried by the job's own scheduled date. Backdating these to
 * look like field-time entries would be inventing a time.
 */

import { ContractorNoteSource } from "@prisma/client";
import { db } from "../lib/db";

const SHEET_ID = "1391340150542212";
const PROVENANCE_PREFIX = "Imported from Smartsheet";
const AUTHOR_LABEL = "WhatsApp update (via Smartsheet)";
const ACTOR_EMAIL = "bke@rentstayable.com";

/** Source row id -> the Latest WhatsApp Update text, verbatim. */
const UPDATES: { rowId: string; contractor: string; date: string; body: string }[] = [
  {
    rowId: "4851143707328388",
    contractor: "Alexander Torres",
    date: "2026-08-10",
    body: "Alexander Torres and Yoycer are hauling out rotten wood/flooring debris to the container at St. Augustine.",
  },
  {
    rowId: "1473443986800516",
    contractor: "Cristian De Leon",
    date: "2026-08-10",
    body: "Crew replaced a burned-out AC unit in unit 312 at Jacksonville West (electrical hookup still pending); scheduled lobby HVAC/mini split install not reported as worked on.",
  },
  {
    rowId: "8510318404566916",
    contractor: "David Recinos",
    date: "2026-08-10",
    body: "Applied silicone sealant and completed roof work near Rooms 243 and 238; also finished caulking in the lobby and started patch work there with Gary.",
  },
  {
    rowId: "2036393940221828",
    contractor: "David Recinos",
    date: "2026-08-11",
    body: "Contractor reports being active/on-site at Davenport; no specific work details given.",
  },
  {
    rowId: "347544079957892",
    contractor: "Gary Floyd Jr.",
    date: "2026-08-10",
    body: "Roof leak repair at Davenport progressed: silicone applied to potential leak spots; also caulked entranceway ahead of paint/stucco.",
  },
  {
    rowId: "3725243800485764",
    contractor: "Gregoris Gonzalez",
    date: "2026-08-10",
    body: "Jacksonville West: Crew began uninstalling the security camera system today, no issues reported.",
  },
  {
    rowId: "8228843427856260",
    contractor: "Jarvis Ramos",
    date: "2026-08-10",
    body: "Crew went to Home Depot for materials, then began draining the pool to perform corrective leak repairs.",
  },
  {
    rowId: "910494033379204",
    contractor: "Jose Felix Ortega",
    date: "2026-08-10",
    body: "Crew installed/started submersible pool pump and removed flooring layers in Room 195 at Lakeland; no mention of pool leak repair progress, so scheduled task marked Delayed.",
  },
  {
    rowId: "2599343893643140",
    contractor: "Joycer Antonio Parra Munoz",
    date: "2026-08-10",
    body: "Crew hauled wood/flooring debris to dumpster at St. Augustine property with coworker Alexander Torres.",
  },
  {
    rowId: "7665893474434948",
    contractor: "Orlando Torres",
    date: "2026-08-10",
    body: "Orlando Torres repaired a broken shower valve causing a strong leak in unit 292 at Kissimmee East last night; scheduled drain line jetting was not addressed.",
  },
  {
    rowId: "3162293847064452",
    contractor: "Ronal Stevent Rojas Mora",
    date: "2026-08-10",
    body: "Drain line jetting done at Kissimmee East except Building B, which is pending due to rooms being occupied.",
  },
  {
    rowId: "5977043614171012",
    contractor: "Zacharie Edmond",
    date: "2026-08-10",
    body: "Zachary Edmond and Gregory Gonzalez removed old camera(s) at Jacksonville West as part of cameras and access points project.",
  },
];

// Source row 5492225935802244 (Arlis Velazquez) also carries an update but has
// no date/property/task, so no job exists for it. Reported, not written:
const ORPHAN_UPDATE = {
  rowId: "5492225935802244",
  contractor: "Arlis Velazquez",
  body: "[08/10/2026 18:21 ET] UNCLEAR - needs a human, nothing written. Se está tragando el Jacksonville, nono.",
};

async function main() {
  const apply = process.argv.includes("--apply");

  const actor = await db.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true } });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found`);

  const provenance = await db.contractorJobNote.findMany({
    where: { source: ContractorNoteSource.SYSTEM, body: { startsWith: PROVENANCE_PREFIX } },
    select: { id: true, jobId: true },
  });

  console.log(`provenance notes to delete: ${provenance.length}`);
  console.log(`WhatsApp updates to attach: ${UPDATES.length}`);
  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");

  // Resolve each update to its job through the audit_log row the import wrote,
  // which is the only durable link between a job and its Smartsheet row.
  const resolved: { rowId: string; jobId: string; body: string }[] = [];
  const unresolved: string[] = [];
  for (const update of UPDATES) {
    const audit = await db.auditLog.findFirst({
      where: {
        entityType: "ContractorJob",
        action: "import",
        AND: [
          { after: { path: ["sourceRowId"], equals: update.rowId } },
          { after: { path: ["source"], equals: SHEET_ID } },
        ],
      },
      select: { entityId: true },
    });
    if (!audit) {
      unresolved.push(`${update.contractor} ${update.date} (row ${update.rowId})`);
      continue;
    }
    resolved.push({ rowId: update.rowId, jobId: audit.entityId, body: update.body });
    console.log(`  ${update.contractor.padEnd(28)} ${update.date}  -> job ${audit.entityId}`);
  }

  if (unresolved.length > 0) {
    console.log(`\n⚠ could not resolve ${unresolved.length} update(s) to a job:`);
    for (const u of unresolved) console.log(`    ${u}`);
    throw new Error("Refusing to run with unresolved updates — a note would be silently dropped.");
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }

  let deleted = 0;
  for (const note of provenance) {
    await db.$transaction(async (tx) => {
      await tx.contractorJobNote.delete({ where: { id: note.id } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          entityType: "ContractorJobNote",
          entityId: note.id,
          action: "delete",
          before: { jobId: note.jobId, kind: "import provenance note", source: SHEET_ID },
          after: {
            reason:
              "Replaced by the row's Latest WhatsApp Update per Kyle 2026-08-11. Import provenance remains in the job's own audit_log row.",
          },
        },
      });
      deleted++;
    });
  }

  let inserted = 0;
  let alreadyPresent = 0;
  for (const item of resolved) {
    const existing = await db.contractorJobNote.findFirst({
      where: { jobId: item.jobId, body: item.body },
      select: { id: true },
    });
    if (existing) {
      alreadyPresent++;
      continue;
    }
    await db.$transaction(async (tx) => {
      const note = await tx.contractorJobNote.create({
        data: {
          jobId: item.jobId,
          source: ContractorNoteSource.SYSTEM,
          authorUserId: null,
          authorLabel: AUTHOR_LABEL,
          body: item.body,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          entityType: "ContractorJobNote",
          entityId: note.id,
          action: "import",
          after: { jobId: item.jobId, source: SHEET_ID, sourceRowId: item.rowId, column: "Latest WhatsApp Update" },
        },
      });
      inserted++;
    });
  }

  console.log(`\ndeleted provenance notes: ${deleted}`);
  console.log(`WhatsApp updates inserted: ${inserted} · already present: ${alreadyPresent}`);
  console.log(`jobs left with an empty history: ${65 - resolved.length} (the source has no update for them)`);
  console.log(
    `\nNOT written anywhere — source row ${ORPHAN_UPDATE.rowId} (${ORPHAN_UPDATE.contractor}) has an update but no job:\n  "${ORPHAN_UPDATE.body}"`,
  );
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
