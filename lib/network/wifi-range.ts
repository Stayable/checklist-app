// Date-range resolution for the WiFi page (Kate's request, 2026-07-29).
//
// Pure and JSX-free so it can be unit-tested directly — the same reason every
// other decision helper in lib/network lives apart from its component.
//
// The range applies to REVENUE ONLY. Spotipo's API silently ignores date
// parameters (verified: start_date/end_date and from/to all return an identical
// total_count), so a range that claimed to filter guest counts would be lying.
// Stripe's created[gte]/created[lte] genuinely filter.

export type RangeKey = "7d" | "30d" | "mtd" | "90d" | "12m";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "mtd", label: "Month to date" },
  { key: "90d", label: "Last 90 days" },
  { key: "12m", label: "Last 12 months" },
];

export const DEFAULT_RANGE: RangeKey = "30d";

export type ResolvedRange = { key: RangeKey; label: string; from: Date };

/**
 * Resolves a URL param into a concrete window. Unknown or missing values fall
 * back to the default rather than throwing — a hand-edited URL should degrade,
 * not error.
 *
 * `now` is injectable so the tests aren't tied to the wall clock.
 */
export function resolveRange(raw: string | undefined, now: Date = new Date()): ResolvedRange {
  const match = RANGE_OPTIONS.find((o) => o.key === raw);
  const key = match?.key ?? DEFAULT_RANGE;
  const label = (match ?? RANGE_OPTIONS.find((o) => o.key === DEFAULT_RANGE)!).label;
  const from = new Date(now);

  switch (key) {
    case "7d":
      from.setDate(from.getDate() - 7);
      break;
    case "30d":
      from.setDate(from.getDate() - 30);
      break;
    case "mtd":
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
    case "90d":
      from.setDate(from.getDate() - 90);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
  }
  return { key, label, from };
}
