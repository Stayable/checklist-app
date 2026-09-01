import { formatDateInET } from "./datetime";

// W5 — the human name of a checklist instance.
//
// Format: `{Template} {ShortCode} {ScopeToken} {MMDDYY}`
//   Housekeeping Checklist LL 201 090126
//   812 PM PA Checklist JN Randy R. 090126
//   Roof PM Checklist SA 090126
//   Property Task Checklist KE Pool gate 090126
//
// AMENDS ADR-009, whose human label was `{Template} — {Short Code} — {Scope} —
// {Date}` ("Arrival Checklist — LL — Rm 312 — May 26, 2026"). That format was
// specified but never fully implemented; shipped code produced
// `Arrival Checklist — Sep 1, 2026`, with no property and no room.
//
// The date is SIX digits, matching CLAUDE.md's `Title_PropertyID_MMDDYY` file
// convention and therefore the PDF these instances export to
// (`Arrival_4645_052626_Rm312.pdf`). An eight-digit year here would mean a
// checklist and its own export disagreed about the date format.
//
// The `systemId` (`CL-4645-ARR-20260901-012`) is a separate, immutable thing and
// is untouched by any of this — it stays the join key.

/**
 * The middle segment: what distinguishes one instance of a template from its
 * siblings on the same day. A discriminated union rather than a bare string so
 * a caller cannot pass a room number where a person belongs.
 */
export type ScopeToken =
  | { kind: "ROOM"; roomNumber: string }
  | { kind: "ASSIGNEE"; name: string }
  | { kind: "TASK"; label: string }
  | { kind: "NONE" };

/** The token's rendered text, or null when there is nothing to distinguish. */
export function scopeTokenText(token: ScopeToken): string | null {
  switch (token.kind) {
    case "ROOM":
      return token.roomNumber.trim() || null;
    case "ASSIGNEE":
      return token.name.trim() || null;
    case "TASK":
      return token.label.trim() || null;
    case "NONE":
      return null;
  }
}

/** `MMDDYY` in Eastern — six digits (D21). */
export function nameDateET(date: Date): string {
  return formatDateInET(date, "MMddyy");
}

/**
 * Compose the instance name.
 *
 * Segments are joined with single spaces and empty ones are dropped, so a
 * property-wide checklist reads `Roof PM Checklist SA 090126` rather than
 * carrying a gap where a room number would be.
 */
export function buildInstanceName({
  templateName,
  shortCode,
  token,
  date,
}: {
  templateName: string;
  shortCode: string;
  token: ScopeToken;
  date: Date;
}): string {
  return [
    templateName.trim(),
    shortCode.trim(),
    scopeTokenText(token),
    nameDateET(date),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}
