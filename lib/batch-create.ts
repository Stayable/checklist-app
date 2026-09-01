import { MAX_ROOMS_PER_CREATE, type SubjectKind } from "./manual-create";

// W4 — expanding the batch wizard's input into the exact set of instances it
// will create. Pure: no Prisma, no I/O, no dates resolved from `now`. The
// preview the user confirms and the rows the action writes come from this one
// function, so what they approve is what they get.

/**
 * Upper bound on instances across every batch in one submission.
 *
 * `MAX_ROOMS_PER_CREATE` (200) caps SUBJECTS in a single batch — enough for the
 * largest property, which is KE at 167 rooms. This caps the whole submission,
 * because subjects multiply by dates and by batches: a full property over two
 * days is already 334.
 *
 * ⚠ Unverified at this size. Creates are sequential with a P2002 retry each and
 * are deliberately NOT wrapped in a transaction (a P2002 inside one poisons it
 * and defeats the retry — see lib/network/ticketing.server.ts), so 400 is 400
 * round trips against a Neon instance that autosuspends. Time a full-property
 * create before trusting this number; if it is slow the answer is chunking with
 * progress, not a transaction.
 */
export const MAX_INSTANCES_PER_CREATE = 400;

export type BatchInput = {
  templateId: string;
  /** Subjects. Exactly one of these is populated, per the batch's SubjectKind. */
  roomIds?: readonly string[];
  assigneeIds?: readonly string[];
  taskLabels?: readonly string[];
  /** ET calendar days, `yyyy-mm-dd`. */
  dates: readonly string[];
  /** Who the created instances are assigned to. Null leaves them unassigned. */
  assignedUserId?: string | null;
};

export type PlannedInstance = {
  /** Which batch produced this row — the preview groups by it. */
  batchIndex: number;
  templateId: string;
  /** ET calendar day, `yyyy-mm-dd`. */
  date: string;
  roomId: string | null;
  /** For PER_ASSIGNEE this is the person the instance belongs to. */
  assigneeId: string | null;
  taskLabel: string | null;
};

export type PlanResult =
  | { ok: true; instances: PlannedInstance[] }
  | { ok: false; error: string; batchIndex?: number };

/** De-duplicate while preserving the order the user chose. */
function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** The subjects a batch enumerates, given its template's kind. */
export function batchSubjects(
  batch: BatchInput,
  kind: SubjectKind,
): string[] {
  switch (kind) {
    case "ROOM":
      return unique(batch.roomIds ?? []);
    case "ASSIGNEE":
      return unique(batch.assigneeIds ?? []);
    case "TASK":
      return unique(batch.taskLabels ?? []);
    case "NONE":
      // One instance, no subject to enumerate. The empty-string sentinel is
      // internal to the expansion below and never reaches a row.
      return [""];
  }
}

/**
 * One batch → its instances, date-major.
 *
 * Date-major because that is how the work is handed out: everything for Sept 1,
 * then everything for Sept 2. Subject-major would interleave two days of a
 * housekeeper's rooms in the confirmation list.
 */
export function expandBatch(
  batch: BatchInput,
  kind: SubjectKind,
  batchIndex: number,
): PlannedInstance[] {
  const subjects = batchSubjects(batch, kind);
  const dates = unique(batch.dates);
  const out: PlannedInstance[] = [];

  for (const date of dates) {
    for (const subject of subjects) {
      out.push({
        batchIndex,
        templateId: batch.templateId,
        date,
        roomId: kind === "ROOM" ? subject : null,
        assigneeId: kind === "ASSIGNEE" ? subject : null,
        taskLabel: kind === "TASK" ? subject : null,
      });
    }
  }
  return out;
}

/**
 * Every batch → the full set, or the first reason it cannot be created.
 *
 * `kinds` is parallel to `batches`; the caller resolves each template's
 * SubjectKind via subjectKindFor before calling.
 */
export function planBatches(
  batches: readonly BatchInput[],
  kinds: readonly SubjectKind[],
): PlanResult {
  if (batches.length === 0) {
    return { ok: false, error: "Add at least one batch." };
  }
  if (batches.length !== kinds.length) {
    // A caller bug, not a user error — fail loudly rather than silently
    // planning a batch against the wrong template's shape.
    return { ok: false, error: "Batch and template counts disagree." };
  }

  const all: PlannedInstance[] = [];

  for (const [i, batch] of batches.entries()) {
    const kind = kinds[i]!;
    const dates = unique(batch.dates);
    if (dates.length === 0) {
      return { ok: false, error: "Pick at least one date.", batchIndex: i };
    }

    const subjects = batchSubjects(batch, kind);
    if (kind !== "NONE" && subjects.length === 0) {
      const noun =
        kind === "ROOM" ? "room" : kind === "ASSIGNEE" ? "person" : "task";
      return {
        ok: false,
        error: `Select at least one ${noun}.`,
        batchIndex: i,
      };
    }
    if (subjects.length > MAX_ROOMS_PER_CREATE) {
      return {
        ok: false,
        error: `Select at most ${MAX_ROOMS_PER_CREATE} at once.`,
        batchIndex: i,
      };
    }

    all.push(...expandBatch(batch, kind, i));
  }

  if (all.length > MAX_INSTANCES_PER_CREATE) {
    return {
      ok: false,
      error: `That would create ${all.length} checklists. The limit is ${MAX_INSTANCES_PER_CREATE} at once — remove a date or split it into two runs.`,
    };
  }

  return { ok: true, instances: all };
}

/** Human count for the confirm dialog and the success message. */
export function describePlan(instances: readonly PlannedInstance[]): string {
  const n = instances.length;
  const batches = new Set(instances.map((i) => i.batchIndex)).size;
  const dates = new Set(instances.map((i) => i.date)).size;
  const parts = [`${n} checklist${n === 1 ? "" : "s"}`];
  if (batches > 1) parts.push(`${batches} templates`);
  if (dates > 1) parts.push(`${dates} days`);
  return parts.join(" · ");
}
