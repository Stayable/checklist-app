import { QuestionType } from "@prisma/client";

// ADR-036 — template question-set versioning (pure half).
//
// The problem this replaces: `updateTemplate` used to rewrite a template's
// questions with DELETE + INSERT. `responses_question_id_fkey` is ON DELETE
// RESTRICT, so that throws as soon as one response exists, and the guard that
// stopped it ("Duplicate the template instead") froze every template the
// moment it was used once. Four live templates were already stuck.
//
// Now an edit is append-only: bump the template's `version`, INSERT a fresh
// question set at the new number, leave every prior row alone. A checklist
// created before the edit keeps `templateVersion` pointing at the old set, so
// it still renders the questions it was actually filled against — Kyle's call
// 2026-09-09, option (a): an in-flight checklist keeps its version too, so
// questions can never move under someone mid-fill.
//
// Two things live here because both are pure and both were previously wrong:
//   * whether an edit actually changed the question set (the old comparison
//     ignored `hint`, so a hint-only edit reported "saved" and saved nothing)
//   * carrying `hint` / `options` / `conditional` / `photoMin` onto the new
//     version (the old INSERT dropped all four, which silently erased 105
//     checkpoint hints across 7 PM PA templates on any successful save)

/** A question row as it exists now, for the version being edited. */
export type ExistingQuestion = {
  id: string;
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  hint: string | null;
  required: boolean;
  options: unknown;
  photoMin: number | null;
  photoMax: number | null;
  failFlagsIssue: boolean;
  conditional: unknown;
};

/**
 * A question as the builder submits it.
 *
 * `id` is the existing row this entry came from, echoed back untouched. It is
 * how a carried-over question keeps its `hint` across a REORDER — matching by
 * position instead would hand a moved question its neighbour's hint, and
 * matching by prompt would fail on exactly the templates that need it most
 * (a PM PA checkpoint repeats the same prompt three times). Absent `id` means
 * a genuinely new question.
 */
export type IncomingQuestion = {
  id?: string | null;
  type: QuestionType;
  prompt: string;
  required: boolean;
  photoMax?: number | null;
  failFlagsIssue?: boolean | null;
  /** Optional passthrough; when omitted the value is carried from `id`'s row. */
  hint?: string | null;
};

/** Normalized photoMax: only meaningful for PHOTO, defaults to 1. */
function photoMaxOf(q: { type: QuestionType; photoMax?: number | null }): number | null {
  return q.type === QuestionType.PHOTO ? (q.photoMax ?? 1) : null;
}

/** Normalized failFlagsIssue: only meaningful for PASSFAIL. */
function failFlagsOf(q: { type: QuestionType; failFlagsIssue?: boolean | null }): boolean {
  return q.type === QuestionType.PASSFAIL ? (q.failFlagsIssue ?? false) : false;
}

/**
 * True when the submitted set differs from the current one in any way that
 * needs a new version.
 *
 * Compares by POSITION, so a reorder counts as a change even though the same
 * rows are present — the order is part of what a filled checklist recorded.
 *
 * `hint` is compared only when the caller actually submitted the key at all.
 * An ABSENT `hint` means "unchanged", not "cleared" — a client that does not
 * know about hints must not silently wipe 15 checkpoint labels. An explicit
 * empty string IS a clear; the builder always sends the key.
 */
export function questionSetChanged(
  existing: ExistingQuestion[],
  incoming: IncomingQuestion[],
): boolean {
  if (existing.length !== incoming.length) return true;
  // Identity is only checked when the payload actually carries ids. A client
  // that sends none is compared on fields alone rather than reporting every
  // save as a change and burning a version for nothing.
  const identified = incoming.some((q) => q.id);
  return existing.some((eq, i) => {
    const iq = incoming[i]!;
    if (identified && (iq.id ?? null) !== eq.id) return true; // moved, added or replaced
    if (iq.hint !== undefined && (iq.hint || null) !== eq.hint) return true;
    return (
      eq.type !== iq.type ||
      eq.prompt !== iq.prompt ||
      eq.required !== iq.required ||
      eq.photoMax !== photoMaxOf(iq) ||
      eq.failFlagsIssue !== failFlagsOf(iq)
    );
  });
}

/** A row ready for `question.createMany`, minus the templateId. */
export type NextVersionRow = {
  version: number;
  orderIndex: number;
  type: QuestionType;
  prompt: string;
  hint: string | null;
  required: boolean;
  options: unknown;
  photoMin: number | null;
  photoMax: number | null;
  failFlagsIssue: boolean;
  conditional: unknown;
};

/**
 * Build the new version's rows from what the builder submitted.
 *
 * Fields the builder can edit come from `incoming`. Fields it cannot even see
 * — `hint`, `options`, `conditional`, `photoMin` — are carried forward from
 * the row `id` points at, so an edit to an unrelated question cannot destroy
 * them. A question with no matching `id` is new and gets nulls, except
 * photoMax/failFlagsIssue which normalize by type.
 */
export function buildNextVersionRows(
  existing: ExistingQuestion[],
  incoming: IncomingQuestion[],
  nextVersion: number,
): NextVersionRow[] {
  const byId = new Map(existing.map((q) => [q.id, q]));
  return incoming.map((q, i) => {
    const prior = q.id ? byId.get(q.id) : undefined;
    return {
      version: nextVersion,
      orderIndex: i,
      type: q.type,
      prompt: q.prompt,
      // An explicitly submitted hint wins; otherwise carry the prior one.
      hint: q.hint !== undefined ? q.hint || null : (prior?.hint ?? null),
      required: q.required,
      options: prior?.options ?? null,
      photoMin: prior?.photoMin ?? null,
      photoMax: photoMaxOf(q),
      failFlagsIssue: failFlagsOf(q),
      conditional: prior?.conditional ?? null,
    };
  });
}
