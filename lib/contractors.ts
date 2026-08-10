// Pure labels, ordering, sorting, Zod schemas, and note-author resolution for
// contractor scheduling. No DB, no I/O, no React — deliberately independent
// of lib/contractor-schedule.ts (that module is calendar-grid math; this one
// is everything else pure that later action/UI tasks consume). Mirrors the
// house style of lib/contractor-schedule.ts and lib/recurrence.ts.

import { ContractorJobStatus, ContractorNoteSource, Trade } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Trade labels
// ---------------------------------------------------------------------------

export const TRADE_LABELS: Record<Trade, string> = {
  [Trade.PLUMBING]: "Plumbing",
  [Trade.ELECTRICAL]: "Electrical",
  [Trade.HVAC]: "HVAC",
  [Trade.ROOFING]: "Roofing",
  [Trade.PEST]: "Pest Control",
  [Trade.LANDSCAPING]: "Landscaping",
  [Trade.PRESSURE_WASHING]: "Pressure Washing",
  [Trade.GENERAL]: "General",
};

export const TRADES_ORDERED: Trade[] = [
  Trade.PLUMBING,
  Trade.ELECTRICAL,
  Trade.HVAC,
  Trade.ROOFING,
  Trade.PEST,
  Trade.LANDSCAPING,
  Trade.PRESSURE_WASHING,
  Trade.GENERAL,
];

export function tradeLabel(trade: Trade): string {
  return TRADE_LABELS[trade];
}

// ---------------------------------------------------------------------------
// Job status labels + open/terminal classification
//
// There is deliberately no DISPATCHED value and no separate JobStatus enum —
// an older dispatch rail was removed from this repo; nothing in this feature
// dispatches or messages anyone.
// ---------------------------------------------------------------------------

export const JOB_STATUS_LABELS: Record<ContractorJobStatus, string> = {
  [ContractorJobStatus.PLANNED]: "Planned",
  [ContractorJobStatus.IN_PROGRESS]: "In Progress",
  [ContractorJobStatus.DONE]: "Done",
  [ContractorJobStatus.CANCELLED]: "Cancelled",
};

export const JOB_STATUS_ORDER: ContractorJobStatus[] = [
  ContractorJobStatus.PLANNED,
  ContractorJobStatus.IN_PROGRESS,
  ContractorJobStatus.DONE,
  ContractorJobStatus.CANCELLED,
];

export function jobStatusLabel(status: ContractorJobStatus): string {
  return JOB_STATUS_LABELS[status];
}

export const OPEN_JOB_STATUSES: ContractorJobStatus[] = [
  ContractorJobStatus.PLANNED,
  ContractorJobStatus.IN_PROGRESS,
];

export const TERMINAL_JOB_STATUSES: ContractorJobStatus[] = [
  ContractorJobStatus.DONE,
  ContractorJobStatus.CANCELLED,
];

export function isTerminalJobStatus(status: ContractorJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

/** A closing note is required exactly when the target status is terminal —
 *  DONE/CANCELLED are the only statuses that end a job's life, and each
 *  needs a record of why. */
export function requiresCloseNote(status: ContractorJobStatus): boolean {
  return isTerminalJobStatus(status);
}

// ---------------------------------------------------------------------------
// sortJobs
// ---------------------------------------------------------------------------

/**
 * Urgent jobs first, then OLDEST first (ascending createdAt) within each
 * urgency group. Deliberately the opposite of a newest-first feed: a
 * scheduler is asking "what has been waiting the longest", not "what just
 * came in" — an old non-urgent job that's been sitting in the backlog should
 * surface before a job created five minutes ago. Stable (Array.prototype.sort
 * is a stable sort per spec) and non-mutating (sorts a shallow copy).
 */
export function sortJobs<T extends { urgent: boolean; createdAt: Date }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// ---------------------------------------------------------------------------
// isOverdue
// ---------------------------------------------------------------------------

/**
 * True only when scheduledFor is strictly before todayYmd (ET) AND the job
 * is not terminal. Unscheduled (null) is never overdue — it's backlog, not a
 * missed date. Dashed "yyyy-MM-dd" strings compare correctly with a plain
 * string `<` because ISO-ordered date components sort lexicographically the
 * same as chronologically.
 */
export function isOverdue(
  scheduledFor: Date | null,
  isTerminal: boolean,
  todayYmd: string,
): boolean {
  if (scheduledFor === null || isTerminal) return false;
  return scheduledFor.toISOString().slice(0, 10) < todayYmd;
}

// ---------------------------------------------------------------------------
// resolveNoteAuthor
// ---------------------------------------------------------------------------

export type NoteAuthorInput = {
  source: ContractorNoteSource;
  authorLabel: string | null;
  author: { name: string } | null;
};

/**
 * Resolve the display name for a note's author.
 *
 * Precedence: a live author's CURRENT name wins first, so a renamed staff
 * user's notes read correctly going forward. `authorLabel` is the durable
 * fallback — it's the point of the column: `ContractorJobNote.authorUserId`
 * is nullable with `onDelete: SetNull` so a note outlives the account it was
 * written by, and a SYSTEM note never had a user account at all. Below that,
 * `"System"` covers an unlabelled SYSTEM row and `"Removed user"` covers a
 * STAFF row whose author is gone and was never labelled. Never returns an
 * empty string — every candidate is trimmed before the truthiness check, so
 * a whitespace-only name or label (visually blank) falls through to the next
 * candidate instead of being returned verbatim.
 */
export function resolveNoteAuthor(input: NoteAuthorInput): string {
  const liveName = input.author?.name.trim();
  if (liveName) return liveName;
  const label = input.authorLabel?.trim();
  if (label) return label;
  if (input.source === ContractorNoteSource.SYSTEM) return "System";
  return "Removed user";
}

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

export const DESCRIPTION_MAX = 2000;
export const ROOM_LABEL_MAX = 60;
export const CLOSE_NOTE_MAX = 2000;
export const NOTE_BODY_MAX = 2000;

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Dashed "yyyy-MM-dd" only — a compact "yyyyMMdd" must be rejected here.
// Actions convert to a UTC-midnight Date later; that conversion is not this
// module's job.
const DASHED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dashedDate = z.string().regex(DASHED_DATE_RE, "Date must be in yyyy-MM-dd format");

export const contractorSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    trades: z.array(z.nativeEnum(Trade)),
    propertyIds: z.array(z.string().uuid()),
    phone: z.string().trim().min(1).nullable().optional(),
    whatsapp: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trades.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trades"],
        message: "Select at least one trade",
      });
    }
    if (data.propertyIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["propertyIds"],
        message: "Select at least one property",
      });
    }
    if (!data.phone && !data.whatsapp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Enter a phone number or WhatsApp number",
      });
    }
  });

export const createJobSchema = z.object({
  propertyId: z.string().uuid(),
  trade: z.nativeEnum(Trade),
  description: z.string().trim().min(1).max(DESCRIPTION_MAX),
  roomLabel: z.string().trim().max(ROOM_LABEL_MAX).optional(),
  urgent: z.boolean().optional(),
  scheduledFor: dashedDate.nullable().optional(),
});

export const updateJobStatusSchema = z
  .object({
    status: z.nativeEnum(ContractorJobStatus),
    closeNote: z.string().trim().max(CLOSE_NOTE_MAX).optional(),
  })
  .superRefine((data, ctx) => {
    if (requiresCloseNote(data.status) && !data.closeNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["closeNote"],
        message: "A closing note is required to complete or cancel a job",
      });
    }
  });

export const assignSchema = z.object({
  contractorId: z.string().uuid().nullable(),
});

export const rescheduleSchema = z.object({
  scheduledFor: dashedDate.nullable(),
});

export const appendJobNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(NOTE_BODY_MAX),
});

export const appendDailyNoteSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Note cannot be empty")
    .max(NOTE_BODY_MAX),
  propertyId: z.string().uuid().nullable(),
  forDate: dashedDate,
});
