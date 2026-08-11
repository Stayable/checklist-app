"use server";

import { revalidatePath } from "next/cache";
import { ContractorJobStatus, ContractorNoteSource, Prisma, Trade } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import type { SessionUser } from "@/lib/rbac";
import {
  appendJobNoteSchema,
  assignSchema,
  createJobSchema,
  isTerminalJobStatus,
  jobStatusLabel,
  requiresCloseNote,
  rescheduleSchema,
  updateJobStatusSchema,
} from "@/lib/contractors";
import { etDayStartUtc, formatDateInET } from "@/lib/datetime";

// Contractor job mutations (Task 5). Scheduling only — nothing here messages,
// dispatches, or issues a contractor-facing link (spec §2).
//
// Three invariants this file exists to hold:
//
// 1. TERMINAL JOBS ARE IMMUTABLE (spec §6). DONE/CANCELLED refuse status,
//    assignment and reschedule changes. Notes stay writable: recording what
//    happened after the fact is the point of an append-only history.
// 2. EVERY SYSTEM NOTE LANDS IN THE SAME TRANSACTION AS THE CHANGE IT
//    DESCRIBES, so a note can never narrate a rolled-back change.
// 3. ASSIGNMENT ELIGIBILITY IS RE-VALIDATED SERVER-SIDE. The picker is a
//    convenience, not an authority — a hand-crafted request naming an
//    archived, wrong-trade, or wrong-property contractor is rejected here.

export type JobResult = { ok: true; id?: string } | { ok: false; error: string };

const TERMINAL_ERROR = "This job is already closed.";

function revalidateJobSurfaces(jobId: string): void {
  revalidatePath("/maintenance/schedule");
  revalidatePath("/maintenance/daily");
  revalidatePath(`/maintenance/jobs/${jobId}`);
}

const BAD_DATE_ERROR = "That is not a real calendar date.";

// A dashed "yyyy-MM-dd" as the UTC-midnight Date a Postgres `@db.Date` column
// stores, or null if the value is not a real calendar date.
//
// Deliberately NOT etDayStartUtc(): that returns the ET *instant* a day begins
// (04:00/05:00Z), which is correct for bounding a timestamptz but would write
// the wrong value into a date column.
//
// The Zod schemas only check the SHAPE (`\d{4}-\d{2}-\d{2}`), so "2026-02-31"
// gets this far. Handing that to Prisma as an Invalid Date throws, which would
// reach the user as a 500 instead of a message — so it is caught here and
// round-tripped as well, the same guard parseDateParam applies at the URL
// boundary.
function ymdToDateColumn(ymd: string): Date | null {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== ymd) return null;
  return date;
}

// The dashed calendar date held in a `@db.Date` value.
function dateColumnToYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// "Aug 11, 2026" for a date-only value. Rendered via etDayStartUtc so the ET
// formatter is handed the instant that ET day begins — passing the raw
// UTC-midnight Date to formatDateInET would render the PREVIOUS day (ET is
// 4–5 hours behind UTC).
function formatScheduledYmd(ymd: string): string {
  return formatDateInET(etDayStartUtc(ymd));
}

type GuardedJob = {
  id: string;
  propertyId: string;
  trade: Trade;
  status: ContractorJobStatus;
  contractorId: string | null;
  scheduledFor: Date | null;
};

type Guarded =
  | { ok: true; user: SessionUser; job: GuardedJob }
  | { ok: false; error: string };

// Shared load + authorize for every mutation on an existing job. Returns a
// discriminated result rather than throwing, so each action surfaces the
// failure through its own JobResult.
async function loadGuarded(jobId: string): Promise<Guarded> {
  const user = await requireManager();
  const job = await db.contractorJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      propertyId: true,
      trade: true,
      status: true,
      contractorId: true,
      scheduledFor: true,
    },
  });
  if (!job) return { ok: false, error: "Job not found." };
  if (!(await canAccessProperty(user, job.propertyId))) {
    return { ok: false, error: "Not authorized for this job." };
  }
  return { ok: true, user, job };
}

// authorUserId is left null on purpose. resolveNoteAuthor prefers a live
// author's current name, so stamping the acting user here would render a
// SYSTEM row under a person's name and make automated history
// indistinguishable from something they typed.
async function appendSystemNote(
  tx: Prisma.TransactionClient,
  jobId: string,
  body: string,
): Promise<void> {
  await tx.contractorJobNote.create({
    data: {
      jobId,
      source: ContractorNoteSource.SYSTEM,
      authorUserId: null,
      authorLabel: "System",
      body,
    },
  });
}

export async function createJob(input: unknown): Promise<JobResult> {
  const user = await requireManager();
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { propertyId, trade, description, roomLabel, urgent, scheduledFor } = parsed.data;

  if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "Not authorized for this property." };
  }

  // null / absent both mean the unscheduled backlog, which is a real state
  // (spec §4.3), not missing data.
  const scheduledDate = scheduledFor ? ymdToDateColumn(scheduledFor) : null;
  if (scheduledFor && scheduledDate === null) return { ok: false, error: BAD_DATE_ERROR };

  const created = await db.$transaction(async (tx) => {
    const job = await tx.contractorJob.create({
      data: {
        propertyId,
        trade,
        description,
        roomLabel: roomLabel && roomLabel.length > 0 ? roomLabel : null,
        urgent: urgent ?? false,
        scheduledFor: scheduledDate,
        createdByUserId: user.id,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ContractorJob",
        entityId: job.id,
        action: "create",
        after: {
          propertyId,
          trade,
          description,
          roomLabel: roomLabel ?? null,
          urgent: urgent ?? false,
          scheduledFor: scheduledFor ?? null,
        },
      },
    });
    return job;
  });

  revalidateJobSurfaces(created.id);
  return { ok: true, id: created.id };
}

export async function updateJobStatus(jobId: string, input: unknown): Promise<JobResult> {
  const guarded = await loadGuarded(jobId);
  if (!guarded.ok) return guarded;
  const { user, job } = guarded;

  if (isTerminalJobStatus(job.status)) return { ok: false, error: TERMINAL_ERROR };

  const parsed = updateJobStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { status, closeNote } = parsed.data;

  // No change means no history entry — appending "Status changed to Planned."
  // when it was already Planned would put a false event in the thread.
  if (status === job.status) return { ok: true, id: jobId };

  const terminal = requiresCloseNote(status);

  await db.$transaction(async (tx) => {
    await tx.contractorJob.update({
      where: { id: jobId },
      data: {
        status,
        // Stamped only for DONE. CANCELLED ends the job's life but nothing
        // was completed, so "completed today" must not count it.
        completedAt: status === ContractorJobStatus.DONE ? new Date() : null,
        closeNote: terminal ? (closeNote ?? null) : null,
      },
    });
    await appendSystemNote(tx, jobId, `Status changed to ${jobStatusLabel(status)}.`);
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ContractorJob",
        entityId: jobId,
        action: "status",
        before: { status: job.status },
        after: { status, closeNote: terminal ? (closeNote ?? null) : null },
      },
    });
  });

  revalidateJobSurfaces(jobId);
  return { ok: true, id: jobId };
}

export async function assignContractor(jobId: string, input: unknown): Promise<JobResult> {
  const guarded = await loadGuarded(jobId);
  if (!guarded.ok) return guarded;
  const { user, job } = guarded;

  if (isTerminalJobStatus(job.status)) return { ok: false, error: TERMINAL_ERROR };

  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { contractorId } = parsed.data;

  if (contractorId === job.contractorId) return { ok: true, id: jobId };

  let contractorName: string | null = null;
  if (contractorId !== null) {
    // Eligibility is re-checked against the database, not inferred from the
    // submitted value: the picker's option list is a UI convenience and a
    // request can be crafted without it.
    const contractor = await db.contractor.findUnique({
      where: { id: contractorId },
      select: {
        name: true,
        active: true,
        trades: true,
        properties: { select: { propertyId: true } },
      },
    });
    if (!contractor) return { ok: false, error: "Contractor not found." };
    if (!contractor.active) {
      return { ok: false, error: "That contractor is archived." };
    }
    if (!contractor.trades.includes(job.trade)) {
      return { ok: false, error: "That contractor does not cover this trade." };
    }
    if (!contractor.properties.some((p) => p.propertyId === job.propertyId)) {
      return { ok: false, error: "That contractor does not cover this property." };
    }
    contractorName = contractor.name;
  }

  await db.$transaction(async (tx) => {
    await tx.contractorJob.update({ where: { id: jobId }, data: { contractorId } });
    await appendSystemNote(
      tx,
      jobId,
      contractorName ? `Assigned to ${contractorName}.` : "Contractor unassigned.",
    );
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ContractorJob",
        entityId: jobId,
        action: "assign",
        before: { contractorId: job.contractorId },
        after: { contractorId },
      },
    });
  });

  revalidateJobSurfaces(jobId);
  return { ok: true, id: jobId };
}

export async function rescheduleJob(jobId: string, input: unknown): Promise<JobResult> {
  const guarded = await loadGuarded(jobId);
  if (!guarded.ok) return guarded;
  const { user, job } = guarded;

  if (isTerminalJobStatus(job.status)) return { ok: false, error: TERMINAL_ERROR };

  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { scheduledFor } = parsed.data;

  const nextDate = scheduledFor ? ymdToDateColumn(scheduledFor) : null;
  if (scheduledFor && nextDate === null) return { ok: false, error: BAD_DATE_ERROR };

  const currentYmd = job.scheduledFor ? dateColumnToYmd(job.scheduledFor) : null;
  if (scheduledFor === currentYmd) return { ok: true, id: jobId };

  await db.$transaction(async (tx) => {
    await tx.contractorJob.update({
      where: { id: jobId },
      data: { scheduledFor: nextDate },
    });
    await appendSystemNote(
      tx,
      jobId,
      scheduledFor
        ? `Scheduled for ${formatScheduledYmd(scheduledFor)}.`
        : "Returned to the unscheduled backlog.",
    );
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ContractorJob",
        entityId: jobId,
        action: "reschedule",
        before: { scheduledFor: currentYmd },
        after: { scheduledFor },
      },
    });
  });

  revalidateJobSurfaces(jobId);
  return { ok: true, id: jobId };
}

/**
 * Append a staff note. Deliberately allowed on a terminal job — only the
 * job's own fields freeze (spec §6).
 *
 * No audit_log row: the note table is itself append-only with no update or
 * delete path, so it is already the durable record. audit_log exists to
 * capture mutations of things that CAN change.
 */
export async function appendJobNote(jobId: string, input: unknown): Promise<JobResult> {
  const guarded = await loadGuarded(jobId);
  if (!guarded.ok) return guarded;
  const { user } = guarded;

  const parsed = appendJobNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  await db.contractorJobNote.create({
    data: {
      jobId,
      source: ContractorNoteSource.STAFF,
      authorUserId: user.id,
      // Snapshot of the author's current name, so attribution survives the
      // account being deleted (authorUserId is SetNull).
      authorLabel: user.name,
      body: parsed.data.body,
    },
  });

  revalidateJobSurfaces(jobId);
  return { ok: true, id: jobId };
}
