import { z } from "zod";

import { MAX_INSTANCES_PER_CREATE, type BatchInput } from "./batch-create";
import { MAX_ROOMS_PER_CREATE } from "./manual-create";

// W4 / D9 — the batch wizard's SAVED state. Pure: no Prisma, no I/O, no `now`.
//
// A draft holds the DEFINITION of a create, never the create itself. Zero
// ChecklistInstance rows exist until the user presses Create, and no
// InstanceStatus member was added — see the ChecklistBatchDraft comment in
// prisma/schema.prisma for why that shape was refused.
//
// This file exists because `checklist_batch_drafts.batches` is `Json`, and JSON
// read back out of a database is UNTRUSTED INPUT no matter who wrote it. A row
// saved by last week's wizard need not match this week's BatchInput. Casting it
// with `as BatchInput[]` would typecheck and then hand a half-shaped object to
// the create path, which is exactly the failure a draft is supposed to be too
// cheap to cause. So every read parses, and a row that will not parse is
// reported as a stale draft rather than thrown.

/**
 * Batches one draft may hold.
 *
 * Distinct from MAX_INSTANCES_PER_CREATE, which bounds the RESULT. This bounds
 * the composition: 20 templates in one sitting is already past what the wizard
 * can show without becoming its own scrolling problem, and the cap is what stops
 * a stored payload growing without limit.
 */
export const MAX_BATCHES_PER_DRAFT = 20;

/**
 * One batch, mirroring BatchInput from lib/batch-create.ts.
 *
 * DELIBERATELY MORE PERMISSIVE THAN planBatches. A draft is a half-finished
 * thought: "these rooms, dates to follow" must be savable, so empty `dates` and
 * empty subject lists are accepted here and rejected at Create, where they are
 * actually a problem. Only the UPPER bounds are enforced in both places, because
 * an over-cap payload can never be created and storing it just defers the error.
 *
 * `templateId` stays required — a batch with no template names no work at all,
 * and the wizard picks the template first.
 *
 * Unknown keys are STRIPPED, not rejected. A future wizard field (per-batch due
 * time is specified but unbuilt) then survives in the row and is merely invisible
 * to code that predates it, which degrades better than refusing the whole draft.
 */
const batchInputSchema = z.object({
  templateId: z.string().uuid(),
  roomIds: z.array(z.string().uuid()).max(MAX_ROOMS_PER_CREATE).default([]),
  assigneeIds: z.array(z.string().uuid()).max(MAX_ROOMS_PER_CREATE).default([]),
  taskLabels: z
    .array(z.string().trim().min(1).max(120))
    .max(MAX_ROOMS_PER_CREATE)
    .default([]),
  /** ET calendar days, `yyyy-mm-dd`. Never parsed into a Date here — see ymdLabel. */
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
  assignedUserId: z.string().uuid().nullable().optional(),
});

/**
 * Subjects a batch enumerates, as an upper bound.
 *
 * The real answer needs the template's SubjectKind, which needs a DB read, and
 * this file stays pure. Exactly one list is populated per batch (that is the
 * BatchInput contract), so the max of the three IS the count for a well-formed
 * batch and an over-estimate for nothing. A batch with no subjects at all is a
 * PER_PROPERTY + ONE template, which yields one instance per date.
 */
export function subjectCount(batch: {
  roomIds?: readonly string[];
  assigneeIds?: readonly string[];
  taskLabels?: readonly string[];
}): number {
  return Math.max(
    1,
    batch.roomIds?.length ?? 0,
    batch.assigneeIds?.length ?? 0,
    batch.taskLabels?.length ?? 0,
  );
}

/** Instances a draft would produce if created as-is. Dates × subjects, summed. */
export function estimateInstances(
  batches: readonly Pick<
    BatchInput,
    "roomIds" | "assigneeIds" | "taskLabels" | "dates"
  >[],
): number {
  return batches.reduce(
    (total, b) => total + subjectCount(b) * Math.max(b.dates.length, 1),
    0,
  );
}

export const draftBatchesSchema = z
  .array(batchInputSchema)
  .min(1, "A draft needs at least one batch.")
  .max(
    MAX_BATCHES_PER_DRAFT,
    `A draft holds at most ${MAX_BATCHES_PER_DRAFT} batches.`,
  )
  .superRefine((batches, ctx) => {
    const total = estimateInstances(batches);
    if (total > MAX_INSTANCES_PER_CREATE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `That draft would create ${total} checklists. The limit is ${MAX_INSTANCES_PER_CREATE} — remove a date or split it into two drafts.`,
      });
    }
  });

export type DraftBatches = z.infer<typeof draftBatchesSchema>;

export type ParseDraftResult =
  | { ok: true; batches: DraftBatches }
  | { ok: false; error: string };

/**
 * Validate a `batches` payload — from the client on write, and from the Json
 * column on read. Same schema both directions on purpose: a row is only ever as
 * trustworthy as the version of this file that wrote it.
 *
 * Returns a failure; never throws. A draft that cannot be parsed is one dead row
 * on a list page, not a 500 that hides every other draft the user has.
 */
export function parseDraftBatches(value: unknown): ParseDraftResult {
  const parsed = draftBatchesSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid draft contents",
    };
  }
  return { ok: true, batches: parsed.data };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * `2026-09-01` → `Sep 1`, from the string's own digits.
 *
 * NOT via `new Date("2026-09-01")`, which parses as UTC midnight and renders as
 * Aug 31 for anyone east of Greenwich — the off-by-one this repo has been bitten
 * by more than once. These strings are already ET calendar days; there is
 * nothing to convert, only to spell.
 */
export function ymdLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return ymd;
  return `${month} ${Number(m[3])}`;
}

/**
 * The label shown when a draft has no name of its own.
 *
 * Derived rather than stored, so it stays true as the draft is edited, and so
 * that Save never stops to demand a decision the user has not made yet. A named
 * draft always wins — this is only the fallback.
 */
export function deriveDraftName(
  batches: readonly Pick<BatchInput, "dates">[],
): string {
  const n = batches.length;
  if (n === 0) return "Empty draft";

  const head = `${n} batch${n === 1 ? "" : "es"}`;
  const days = [...new Set(batches.flatMap((b) => [...b.dates]))].sort();
  if (days.length === 0) return head;

  const first = ymdLabel(days[0]!);
  if (days.length === 1) return `${head} · ${first}`;
  return `${head} · ${first} +${days.length - 1} more day${days.length === 2 ? "" : "s"}`;
}

/** The name a draft displays: its own if it has one, otherwise the derived one. */
export function draftDisplayName(
  name: string | null,
  batches: readonly Pick<BatchInput, "dates">[],
): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : deriveDraftName(batches);
}
