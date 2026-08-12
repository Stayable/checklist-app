// Contractor update fan-out — pure logic.
//
// Implements docs/ContractorUpdateFanout_Contract_081226.md §6 (payload), §7
// (job resolution) and §8 (status mapping). No DB, no I/O, no React: the
// receiver at app/api/webhooks/contractor-update fetches candidates, calls
// decideContractorUpdate(), and applies the result in one transaction.
//
// Everything hard about this feature is here, so it is testable without HTTP
// and without a database.
//
// DIRECTION IS INBOUND ONLY. Nothing in this module (or anything it is called
// from) sends a message to a contractor — ADR-028 and ADR-030 removed every
// send path from this repo and they stay removed.

import { ContractorJobStatus } from "@prisma/client";
import { z } from "zod";
// Relative, not "@/lib/…": this module is unit-tested and the vitest config
// does not resolve the alias (same reason the other tested pure modules in
// lib/ use relative imports).
import { NOTE_BODY_MAX } from "./contractors";

// ---------------------------------------------------------------------------
// Contract version (§12)
// ---------------------------------------------------------------------------

export const SUPPORTED_CONTRACT_VERSION = 1;

// ---------------------------------------------------------------------------
// Source status vocabulary (§8)
//
// The pipeline sends the RAW Smartsheet vocabulary and the mapping happens
// here, on this side of the boundary, next to the enum it maps onto.
//
// ⚠ THIS IS THE ONLY COPY. scripts/sync-contractor-schedule-from-smartsheet.ts
// imports it rather than keeping its own, because during the overlap window
// (contract §10.6) both paths write the same status field — and a map that
// said Delayed -> PLANNED in one place and Delayed -> DELAYED in the other
// would not merely revert a job on the next sync run: it would append a SYSTEM
// note claiming Smartsheet said so, to an append-only thread that cannot be
// corrected afterwards. Sharing the constant makes that divergence
// unrepresentable instead of merely tested.
// ---------------------------------------------------------------------------

export const SOURCE_STATUSES = ["Pending", "In Progress", "Completed", "Delayed", "Off"] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_STATUS_MAP: Record<SourceStatus, ContractorJobStatus> = {
  Pending: ContractorJobStatus.PLANNED,
  "In Progress": ContractorJobStatus.IN_PROGRESS,
  Completed: ContractorJobStatus.DONE,
  // NOT IN_PROGRESS. "Delayed" means the scheduled task got no progress;
  // mapping it to IN_PROGRESS would state the opposite of what was reported.
  Delayed: ContractorJobStatus.DELAYED,
  Off: ContractorJobStatus.CANCELLED,
};

// ---------------------------------------------------------------------------
// Payload (§6)
// ---------------------------------------------------------------------------

const DASHED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True only for a real calendar date in dashed form.
 *
 * The shape check alone is not enough: `new Date("2026-02-31")` silently
 * overflows to 3 March rather than throwing, so a regex-only guard accepts a
 * date that then quietly files a crew's report on the wrong day. Round-trip
 * through toISOString and require an exact match. (Same technique and same
 * lesson as parseDateParam in lib/contractor-schedule.ts, and the same hole
 * that reached Prisma as an Invalid Date in the job actions before review.)
 */
export function isRealYMD(value: string): boolean {
  if (!DASHED_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

const nullableText = z.string().nullable().optional();

/**
 * Unknown keys are STRIPPED, not rejected — §12 says fields may be added
 * freely and only a removal or a meaning change is a version bump. A pipeline
 * deploy that adds a field must not start failing every delivery.
 */
export const contractorUpdatePayloadSchema = z.object({
  contractVersion: z.number().int(),
  messageSid: z.string().trim().min(1),
  receivedAtUtc: z.string().trim().min(1),
  channel: z.string().trim().min(1),
  outcome: z.string().trim().min(1),

  workDate: z.string().refine(isRealYMD, "workDate must be a real yyyy-MM-dd date"),
  contractorPhone: nullableText,
  contractorName: z.string().trim().min(1),

  scheduledPropertyId: nullableText,
  scheduledTask: nullableText,
  actualProperty: nullableText,
  roomOrArea: nullableText,

  status: z.enum(SOURCE_STATUSES).nullable().optional(),
  priorStatus: nullableText,
  summary: nullableText,
  matchesScheduledTask: z.boolean().nullable().optional(),
  confidence: nullableText,
  notesForGm: nullableText,

  detectedLanguage: nullableText,
  transcriptOriginal: nullableText,
  transcriptEnglish: nullableText,
  durationSeconds: z.number().nullable().optional(),
  mediaBlobUrls: z.array(z.string()).nullable().optional(),
  smartsheetRowId: nullableText,
});

export type ContractorUpdatePayload = z.infer<typeof contractorUpdatePayloadSchema>;

/**
 * Read `contractVersion` WITHOUT validating the rest.
 *
 * The version gate has to run before full validation: a future major version
 * may legitimately have a shape this schema rejects, and §12 requires that to
 * surface as `unsupported_version` rather than as a validation failure —
 * otherwise a pipeline deploy ahead of an app deploy looks like malformed
 * data instead of a version skew.
 */
export function readContractVersion(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const version = (body as Record<string, unknown>).contractVersion;
  return typeof version === "number" && Number.isInteger(version) ? version : null;
}

// ---------------------------------------------------------------------------
// Decision (§7)
// ---------------------------------------------------------------------------

export type CandidateJob = {
  id: string;
  status: ContractorJobStatus;
  propertyId: string;
  roomLabel: string | null;
};

/** How the contractor was identified. Recorded on every update. */
export type MatchedBy = "phone" | "name";

export type ContractorMatch = {
  contractorId: string;
  matchedBy: MatchedBy;
};

export type DecisionInput = {
  payload: ContractorUpdatePayload;
  /** null when no contractor could be identified at all. */
  match: ContractorMatch | null;
  /** Jobs for (workDate, matched contractor). Empty when none or no match. */
  candidates: CandidateJob[];
  /** Resolved from scheduledPropertyId; null when unmapped or absent. */
  scheduledPropertyId: string | null;
};

export type UpdateDecision =
  | {
      kind: "apply-status";
      jobId: string;
      status: ContractorJobStatus;
      body: string;
      /** Set only when the job has no room label yet and one was reported. */
      roomLabel: string | null;
    }
  | { kind: "note-only"; jobId: string; body: string; roomLabel: string | null }
  | { kind: "daily-note"; propertyId: string | null; body: string }
  | { kind: "ambiguous"; jobIds: string[]; propertyId: string | null; body: string };

const TERMINAL: ContractorJobStatus[] = [ContractorJobStatus.DONE, ContractorJobStatus.CANCELLED];

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Compose the note body. Kept short and human — this renders on the calendar. */
function buildBody(input: DecisionInput, extra: string[]): string {
  const { payload, match } = input;
  const lines: string[] = [];

  const summary = payload.summary?.trim();
  lines.push(summary && summary.length > 0 ? summary : "(no summary reported)");

  const facts: string[] = [];
  const room = payload.roomOrArea?.trim();
  if (room) facts.push(room);
  if (payload.channel) facts.push(payload.channel);
  // Always state which key resolved this. Production holds no contractor
  // phone numbers yet, so every update currently falls to the name path the
  // contract itself calls unsafe — and an unresolved update's only symptom is
  // an unchanged calendar. Saying so in the note makes it visible.
  facts.push(match ? `matched by ${match.matchedBy}` : "contractor not identified");
  lines.push(facts.join(" · "));

  lines.push(...extra);

  return truncate(lines.join("\n"), NOTE_BODY_MAX);
}

/**
 * Decide what a crew update does. Pure.
 *
 * The rules, in the order they are applied:
 *
 *  1. `outcome: "flagged"` is never a status change (§7) — the pipeline
 *     flagged it for a human, so it lands as a daily note.
 *  2. No contractor identified, or no job that day -> ContractorDailyNote.
 *     NEVER create a job: scheduling is Gerardo's, and the plan reaches the
 *     app through the loader, not through an update.
 *  3. More than one candidate -> `ambiguous`, and nothing is written to
 *     either job (§Q41). Attaching a crew's report to the wrong job is worse
 *     than an unplaced note a human can file.
 *  4. Exactly one job: always append the note. Set status too, unless the job
 *     is terminal — a DONE/CANCELLED job stays closed and the conflict is
 *     recorded (ADR-030's invariant, and the pipeline's own
 *     never-downgrade-Completed rule).
 *
 * A property mismatch NEVER moves the job (§7, decided 08/12/26). It is named
 * in the note instead — the same rule the pipeline already applies to
 * Smartsheet, so both surfaces say the same thing.
 */
export function decideContractorUpdate(input: DecisionInput): UpdateDecision {
  const { payload, match, candidates, scheduledPropertyId } = input;

  const offPlan = payload.actualProperty?.trim();
  const extra: string[] = [];
  if (offPlan) {
    extra.push(
      `⚠ Reported at ${offPlan}, not the scheduled property. The job has not been moved.`,
    );
  }
  const notesForGm = payload.notesForGm?.trim();
  if (notesForGm) extra.push(`For the GM: ${notesForGm}`);

  if (payload.outcome === "flagged") {
    return {
      kind: "daily-note",
      propertyId: scheduledPropertyId,
      body: buildBody(input, [
        ...extra,
        "Flagged by the update pipeline for a human to read. No status was changed.",
      ]),
    };
  }

  if (!match || candidates.length === 0) {
    return {
      kind: "daily-note",
      propertyId: scheduledPropertyId,
      body: buildBody(input, [
        ...extra,
        match
          ? `No job is scheduled for ${payload.contractorName} on ${payload.workDate}, so this is filed against the day.`
          : `No contractor on file matches "${payload.contractorName}"${
              payload.contractorPhone ? ` (${payload.contractorPhone})` : ""
            }, so this is filed against the day.`,
      ]),
    };
  }

  if (candidates.length > 1) {
    return {
      kind: "ambiguous",
      jobIds: candidates.map((c) => c.id),
      propertyId: scheduledPropertyId,
      body: buildBody(input, [
        ...extra,
        `${candidates.length} jobs are scheduled for ${payload.contractorName} on ${payload.workDate}, so this update was not attached to either. Job ids: ${candidates
          .map((c) => c.id)
          .join(", ")}.`,
      ]),
    };
  }

  const job = candidates[0];
  const room = payload.roomOrArea?.trim();
  // Free text by design; only fill an empty label, never overwrite one a
  // human set.
  const roomLabel = room && !job.roomLabel?.trim() ? room : null;

  const sourceStatus = payload.status ?? null;
  const target = sourceStatus ? SOURCE_STATUS_MAP[sourceStatus] : null;

  if (target !== null && TERMINAL.includes(job.status)) {
    return {
      kind: "note-only",
      jobId: job.id,
      roomLabel,
      body: buildBody(input, [
        ...extra,
        `Smartsheet reports "${sourceStatus}", but this job is already ${job.status.toLowerCase()} here. Left closed.`,
      ]),
    };
  }

  if (target === null || target === job.status) {
    return { kind: "note-only", jobId: job.id, roomLabel, body: buildBody(input, extra) };
  }

  return {
    kind: "apply-status",
    jobId: job.id,
    status: target,
    roomLabel,
    body: buildBody(input, extra),
  };
}

/**
 * Normalize a phone number to bare digits for comparison.
 *
 * Not a full E.164 parser — a deliberate floor, not a ceiling. The two sides
 * hold the same numbers in different hands (the pipeline's allowlist is E.164;
 * this repo's directory is free text typed by a person), so "(904) 555-1234"
 * and "+1 904-555-1234" must compare equal or the contract's phone-first rule
 * never fires. Returns null for anything with too few digits to be a number.
 *
 * A leading US country code is dropped so 11-digit and 10-digit forms of the
 * same number match. That is safe for a Florida-only roster and would need
 * revisiting if a contractor is ever non-US.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/** Case- and whitespace-insensitive name key for the fallback match. */
export function nameKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
