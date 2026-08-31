// Filtering for /templates.
//
// A template with zero questions is a DRAFT: it exists, it is not fillable, and
// somebody has to write its question set. During the template-library beta that
// is most of the library, so the list needs a way to show only those.
//
// This is deliberately a filter over the rows already on the page and NOT a new
// table, a new column or a "To Create" screen. When the beta ends and every
// template has questions, the chip renders `(0)`, and deleting these ~20 lines
// plus its two call sites is the whole cleanup.

export type TemplateFilter = "ALL" | "NEEDS_QUESTIONS";

/** The one property the filter reads. Kept structural so tests need no fixtures. */
export type TemplateFilterable = { questionCount: number };

/** A template is a draft until it has at least one question. */
export function isDraft(row: TemplateFilterable): boolean {
  return row.questionCount === 0;
}

export function countNeedsQuestions(rows: readonly TemplateFilterable[]): number {
  return rows.filter(isDraft).length;
}

export function applyTemplateFilter<T extends TemplateFilterable>(
  rows: readonly T[],
  filter: TemplateFilter,
): T[] {
  return filter === "NEEDS_QUESTIONS" ? rows.filter(isDraft) : [...rows];
}
