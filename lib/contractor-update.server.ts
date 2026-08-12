// Contractor update fan-out — the DB half.
//
// Resolves a validated payload to a contractor and a job, then applies the
// pure decision from lib/contractor-update.ts in ONE transaction. Called only
// by app/api/webhooks/contractor-update/route.ts.
//
// Inbound only: nothing here messages a contractor (ADR-028/030).

import {
  ContractorJobStatus,
  ContractorNoteSource,
  ContractorUpdateResolution,
  Prisma,
} from "@prisma/client";
import {
  type ContractorMatch,
  type ContractorUpdatePayload,
  type UpdateDecision,
  decideContractorUpdate,
  nameKey,
  normalizePhone,
} from "@/lib/contractor-update";
import { db } from "@/lib/db";
import { etDayStartUtc } from "@/lib/datetime";

/** Author label on every note this path writes, so its origin is legible. */
export const FANOUT_AUTHOR = "WhatsApp update";

export type ApplyResult = {
  duplicate: boolean;
  resolution: ContractorUpdateResolution;
  jobId: string | null;
  matchedBy: "phone" | "name" | null;
};

/**
 * Find the contractor this update came from.
 *
 * PHONE FIRST, by contract §7 — the schedule carries documented name variants
 * ("Ronal S." vs "Ronal Stevent Rojas Mora") that a name match silently gets
 * wrong. Compared through normalizePhone on BOTH sides: this repo's directory
 * is free text typed by a person while the pipeline's roster is E.164, so a
 * raw string comparison would never match.
 *
 * ⚠ The phone path currently resolves NOTHING in production: all 13 contractor
 * rows were imported with no phone and no WhatsApp (2026-08-11, "will add
 * later"), so every update falls to the exact-name fallback. That is tracked
 * as §Q40 and is a precondition of pointing the pipeline at production. The
 * chosen key is recorded on every ContractorUpdate row so the gap is visible
 * in data rather than inferred from an unchanged calendar.
 */
export async function matchContractor(
  payload: ContractorUpdatePayload,
): Promise<ContractorMatch | null> {
  const wanted = normalizePhone(payload.contractorPhone);

  const contractors = await db.contractor.findMany({
    where: { active: true },
    select: { id: true, name: true, phone: true, whatsapp: true },
  });

  if (wanted) {
    const byPhone = contractors.find(
      (c) => normalizePhone(c.phone) === wanted || normalizePhone(c.whatsapp) === wanted,
    );
    if (byPhone) return { contractorId: byPhone.id, matchedBy: "phone" };
  }

  const wantedName = nameKey(payload.contractorName);
  const named = contractors.filter((c) => nameKey(c.name) === wantedName);
  // Two contractors sharing a name is not a match, it is an ambiguity — and
  // guessing here would put a crew's report on another person's job.
  if (named.length === 1) return { contractorId: named[0].id, matchedBy: "name" };

  return null;
}

/** Resolve `scheduledPropertyId` (the Stayable code, e.g. "812") to our uuid. */
export async function resolvePropertyId(code: string | null | undefined): Promise<string | null> {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  const property = await db.property.findUnique({
    where: { propertyId: trimmed },
    select: { id: true },
  });
  return property?.id ?? null;
}

/**
 * Apply a decided update.
 *
 * The ContractorUpdate row (unique on messageSid) is written in the SAME
 * transaction as the note and any status change. That is the idempotency
 * guarantee: a crash between them cannot leave a messageSid marked applied
 * with nothing written, and two overlapping queue workers resolve in the
 * database — the loser hits the unique violation, which the caller turns into
 * the contract's 200 {ok:true, duplicate:true} (§5).
 */
export async function applyContractorUpdate(
  payload: ContractorUpdatePayload,
  decision: UpdateDecision,
  match: ContractorMatch | null,
): Promise<ApplyResult> {
  const workDate = etDayStartUtc(payload.workDate);

  const resolution =
    decision.kind === "apply-status"
      ? ContractorUpdateResolution.JOB_STATUS
      : decision.kind === "note-only"
        ? ContractorUpdateResolution.JOB_NOTE
        : decision.kind === "ambiguous"
          ? ContractorUpdateResolution.AMBIGUOUS
          : ContractorUpdateResolution.DAILY_NOTE;

  const jobId = decision.kind === "apply-status" || decision.kind === "note-only" ? decision.jobId : null;
  const statusApplied = decision.kind === "apply-status" ? decision.status : null;

  try {
    await db.$transaction(async (tx) => {
      if (decision.kind === "apply-status" || decision.kind === "note-only") {
        if (decision.kind === "apply-status") {
          await tx.contractorJob.update({
            where: { id: decision.jobId },
            data: {
              status: decision.status,
              // Stamped only for DONE, matching updateJobStatus in
              // app/maintenance/jobs/actions.ts: CANCELLED ends a job's life
              // but nothing was completed, so "completed today" must not
              // count it. Anchored to the ET day the work belongs to, not to
              // now — an update can arrive after midnight.
              completedAt:
                decision.status === ContractorJobStatus.DONE ? etDayStartUtc(payload.workDate) : null,
            },
          });
        }
        if (decision.roomLabel) {
          await tx.contractorJob.update({
            where: { id: decision.jobId },
            data: { roomLabel: decision.roomLabel },
          });
        }
        await tx.contractorJobNote.create({
          data: {
            jobId: decision.jobId,
            source: ContractorNoteSource.SYSTEM,
            // No authorUserId on purpose, as elsewhere in this feature:
            // stamping the actor would render automated history under a
            // person's byline. authorLabel carries the attribution.
            authorLabel: FANOUT_AUTHOR,
            body: decision.body,
          },
        });
      } else {
        await tx.contractorDailyNote.create({
          data: {
            propertyId: decision.propertyId,
            forDate: workDate,
            source: ContractorNoteSource.SYSTEM,
            authorLabel: FANOUT_AUTHOR,
            body: decision.body,
          },
        });
      }

      await tx.contractorUpdate.create({
        data: {
          messageSid: payload.messageSid,
          contractVersion: payload.contractVersion,
          channel: payload.channel,
          outcome: payload.outcome,
          workDate,
          contractorPhone: payload.contractorPhone ?? null,
          contractorName: payload.contractorName,
          matchedBy: match?.matchedBy ?? null,
          resolution,
          jobId,
          statusApplied,
          smartsheetRowId: payload.smartsheetRowId ?? null,
          receivedAtUtc: new Date(payload.receivedAtUtc),
        },
      });

      // NO auditLog ROW HERE, deliberately.
      //
      // AuditLog.actorUserId is required — the table is built around "a person
      // did this". There is no person: a crew member spoke into WhatsApp and a
      // pipeline posted the result. The two ways to satisfy the column are
      // both worse than omitting it. Attributing to a placeholder user (as the
      // Smartsheet sync does, writing everything as bke@) puts automated
      // changes under a real person's name in the one table whose job is
      // saying who did what. Making the column nullable edits a cross-cutting
      // table used by every feature, for this one.
      //
      // Nothing is lost: the ContractorUpdate row written just above is a
      // purpose-built, append-only provenance record and carries strictly MORE
      // than an audit row would — messageSid, contract version, channel, the
      // resolution taken, the status applied, which key matched, the
      // Smartsheet row id, and both receive stamps. It is indexed for exactly
      // the questions an audit trail is asked. The same reasoning as
      // appendJobNote, which also writes no audit row because its own table is
      // already append-only.
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Another worker got there first. Not an error: §5 says never 409.
      return { duplicate: true, resolution, jobId, matchedBy: match?.matchedBy ?? null };
    }
    throw err;
  }

  return { duplicate: false, resolution, jobId, matchedBy: match?.matchedBy ?? null };
}

/** Full server-side pipeline for one validated payload. */
export async function ingestContractorUpdate(
  payload: ContractorUpdatePayload,
): Promise<ApplyResult> {
  const existing = await db.contractorUpdate.findUnique({
    where: { messageSid: payload.messageSid },
    select: { id: true, resolution: true, jobId: true, matchedBy: true },
  });
  if (existing) {
    return {
      duplicate: true,
      resolution: existing.resolution,
      jobId: existing.jobId,
      matchedBy: (existing.matchedBy as "phone" | "name" | null) ?? null,
    };
  }

  const match = await matchContractor(payload);
  const scheduledPropertyId = await resolvePropertyId(payload.scheduledPropertyId);

  const candidates = match
    ? await db.contractorJob.findMany({
        where: {
          contractorId: match.contractorId,
          scheduledFor: etDayStartUtc(payload.workDate),
        },
        select: { id: true, status: true, propertyId: true, roomLabel: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const decision = decideContractorUpdate({ payload, match, candidates, scheduledPropertyId });

  return applyContractorUpdate(payload, decision, match);
}
