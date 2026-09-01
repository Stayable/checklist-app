// Lifecycle and filtering for /templates.
//
// Three states, because filling a template does NOT publish it. Kyle's flow is:
// the question set is written (extracted from the Connecteam PDF archive, or by
// hand), then a Property Manager reviews the result and publishes it themselves.
//
//   EMPTY_DRAFT   published_at null, 0 questions   — someone must write it
//   FILLED_DRAFT  published_at null, has questions — awaiting PM review
//   PUBLISHED     published_at set, active         — in use
//   RETIRED       published_at set, not active     — history
//
// `active` alone cannot separate FILLED_DRAFT from RETIRED: both are inactive
// with questions attached. publishedAt is what tells them apart, which is why
// it exists.
//
// The two draft states are beta scaffolding. When every template is published
// their chips render (0), and deleting this file plus its call sites is the
// whole cleanup.

export type TemplateLifecycle =
  | "EMPTY_DRAFT"
  | "FILLED_DRAFT"
  | "PUBLISHED"
  | "RETIRED";

export type TemplateFilter = "ALL" | "NEEDS_QUESTIONS" | "READY_TO_PUBLISH" | "PUBLISHED";

/** The three fields the lifecycle reads. Structural, so tests need no fixtures. */
export type TemplateFilterable = {
  questionCount: number;
  active: boolean;
  publishedAt: Date | string | null;
};

export function lifecycleOf(row: TemplateFilterable): TemplateLifecycle {
  if (row.publishedAt == null) {
    return row.questionCount === 0 ? "EMPTY_DRAFT" : "FILLED_DRAFT";
  }
  return row.active ? "PUBLISHED" : "RETIRED";
}

/** Never published. Both draft states — the row is not usable by field staff. */
export function isDraft(row: TemplateFilterable): boolean {
  const l = lifecycleOf(row);
  return l === "EMPTY_DRAFT" || l === "FILLED_DRAFT";
}

/** Has its questions and is waiting on a human to publish it. */
export function isReadyToPublish(row: TemplateFilterable): boolean {
  return lifecycleOf(row) === "FILLED_DRAFT";
}

/**
 * Publishing requires questions. A published template with none is a checklist
 * that field staff can open and cannot fill.
 */
export function canPublish(row: TemplateFilterable): boolean {
  return row.questionCount > 0 && !row.active;
}

const MATCHES: Record<TemplateFilter, (row: TemplateFilterable) => boolean> = {
  ALL: () => true,
  NEEDS_QUESTIONS: (r) => lifecycleOf(r) === "EMPTY_DRAFT",
  READY_TO_PUBLISH: isReadyToPublish,
  PUBLISHED: (r) => lifecycleOf(r) === "PUBLISHED",
};

export function countMatching(
  rows: readonly TemplateFilterable[],
  filter: TemplateFilter,
): number {
  return rows.filter(MATCHES[filter]).length;
}

export function applyTemplateFilter<T extends TemplateFilterable>(
  rows: readonly T[],
  filter: TemplateFilter,
): T[] {
  return rows.filter(MATCHES[filter]);
}

export const LIFECYCLE_LABEL: Record<TemplateLifecycle, string> = {
  EMPTY_DRAFT: "Draft — needs questions",
  FILLED_DRAFT: "Draft (filled) — review & publish",
  PUBLISHED: "Published",
  RETIRED: "Retired",
};

export const FILTER_LABEL: Record<TemplateFilter, string> = {
  ALL: "All",
  NEEDS_QUESTIONS: "Needs questions",
  READY_TO_PUBLISH: "Drafts (filled)",
  PUBLISHED: "Published",
};
