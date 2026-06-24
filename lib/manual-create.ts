import { formatDateInET } from "./datetime";

/**
 * Default title for a manually-created checklist instance:
 * "{template name} — {Mon D, YYYY}" formatted in ET.
 *
 * Uses formatDateInET (no "ET" suffix) — the suffix is for time displays only.
 */
export function nextManualLabelDefault(templateName: string, date: Date): string {
  return `${templateName} — ${formatDateInET(date, "MMM d, yyyy")}`;
}
