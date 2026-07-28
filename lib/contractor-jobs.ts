import { JobStatus, Trade } from "@prisma/client";
import { z } from "zod";

// Contractor-job helpers (T2) + the match-and-rank core (T3).
// Pure and display-safe: importable from server actions, server components and
// client components alike. No Prisma client, no I/O.

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  [JobStatus.OPEN]: "Open",
  [JobStatus.DISPATCHED]: "Dispatched",
  [JobStatus.IN_PROGRESS]: "In progress",
  [JobStatus.COMPLETED]: "Completed",
  [JobStatus.CANCELLED]: "Cancelled",
};

/** Lifecycle order for display and for "is this forward progress" checks. */
export const JOB_STATUS_ORDER: JobStatus[] = [
  JobStatus.OPEN,
  JobStatus.DISPATCHED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.CANCELLED,
];

/** Statuses that still need someone to act. Drives the queue's default filter. */
export const OPEN_JOB_STATUSES: JobStatus[] = [
  JobStatus.OPEN,
  JobStatus.DISPATCHED,
  JobStatus.IN_PROGRESS,
];

export const TERMINAL_JOB_STATUSES: JobStatus[] = [JobStatus.COMPLETED, JobStatus.CANCELLED];

export function jobStatusLabel(s: JobStatus): string {
  return JOB_STATUS_LABELS[s] ?? s;
}

export function isTerminalJobStatus(s: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(s);
}

/** COMPLETED and CANCELLED both demand an explanation before they're accepted. */
export function requiresCompletionNote(s: JobStatus): boolean {
  return isTerminalJobStatus(s);
}

// --- Queue ordering ---------------------------------------------------------

export type SortableJob = { urgent: boolean; createdAt: Date };

/**
 * Urgent first, then newest.
 *
 * Deliberately NOT sorted by status: a dispatcher scanning this queue is asking
 * "what needs me right now", and an urgent job that has been dispatched but not
 * started still needs chasing. Non-mutating — returns a new array, because
 * server components hand these straight to JSX.
 */
export function sortJobs<T extends SortableJob>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// --- Match & rank (T3) ------------------------------------------------------

/** The contractor shape the matcher needs — a subset of the Prisma model. */
export type MatchableContractor = {
  id: string;
  name: string;
  company: string | null;
  trades: Trade[];
  contracted: boolean;
  onCall: boolean;
  active: boolean;
  whatsapp: string | null;
  phone: string | null;
  /** Property ids this contractor covers (from ContractorProperty). */
  propertyIds: string[];
};

export type MatchableJob = { propertyId: string; trade: Trade };

/**
 * Whether this contractor may be assigned to this job.
 *
 * Three conditions, all required: active, carries the job's trade, and covers
 * the job's property. `onCall` is deliberately NOT a condition — an off-call
 * contractor is still a legitimate assignment (someone has to take a job
 * tomorrow); it only affects ranking. Making it a hard filter would leave a
 * property with no eligible contractor at exactly the wrong moment.
 */
export function canAssignContractor(c: MatchableContractor, job: MatchableJob): boolean {
  return c.active && c.trades.includes(job.trade) && c.propertyIds.includes(job.propertyId);
}

/** Has any channel we can actually reach them on. WhatsApp is the rail. */
export function isReachable(c: Pick<MatchableContractor, "whatsapp" | "phone">): boolean {
  return Boolean(c.whatsapp) || Boolean(c.phone);
}

/**
 * Eligible contractors for a job, best first.
 *
 * Ranking, in order:
 *   1. **contracted** — the standing instruction is to call the contracted
 *      contractor first in an emergency (today that's Orlando Torres, plumbing)
 *   2. **on call** — available now beats available later
 *   3. **reachable** — someone with no WhatsApp and no phone can't be dispatched
 *      to at all, so they sink even if otherwise eligible
 *   4. name, so the order is stable and doesn't jitter between renders
 *
 * Ties are broken by name rather than left to sort instability, because a
 * dispatcher who sees a different first contractor on each refresh stops
 * trusting the ordering.
 */
export function rankContractorsForJob(
  contractors: MatchableContractor[],
  job: MatchableJob,
): MatchableContractor[] {
  return contractors
    .filter((c) => canAssignContractor(c, job))
    .sort((a, b) => {
      if (a.contracted !== b.contracted) return a.contracted ? -1 : 1;
      if (a.onCall !== b.onCall) return a.onCall ? -1 : 1;
      const ar = isReachable(a);
      const br = isReachable(b);
      if (ar !== br) return ar ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// --- Validation -------------------------------------------------------------

export const PROBLEM_MAX = 2000;
export const ROOM_LABEL_MAX = 60;
export const COMPLETION_NOTE_MAX = 2000;
/** Mirrors the presign "contractorJob" scope cap and the issue-photo cap. */
export const JOB_PHOTO_MAX = 5;

export const createJobSchema = z.object({
  propertyId: z.string().uuid(),
  trade: z.nativeEnum(Trade),
  problem: z
    .string()
    .trim()
    .min(1, "Describe the problem.")
    .max(PROBLEM_MAX, "Problem description is too long."),
  roomLabel: z.string().trim().max(ROOM_LABEL_MAX).optional().or(z.literal("")),
  urgent: z.boolean().optional(),
});

export const updateStatusSchema = z
  .object({
    status: z.nativeEnum(JobStatus),
    completionNote: z.string().trim().max(COMPLETION_NOTE_MAX).optional().or(z.literal("")),
  })
  .refine((v) => !requiresCompletionNote(v.status) || Boolean(v.completionNote), {
    message: "A note is required when completing or cancelling a job.",
    path: ["completionNote"],
  });

export const assignSchema = z.object({
  /** Null clears the assignment. */
  contractorId: z.string().uuid().nullable(),
});
