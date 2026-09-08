import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "America/New_York";

export const TIME_SUFFIX = "ET";

export function formatInET(
  value: Date | string | number,
  pattern: string = "MMM d, yyyy h:mm a",
): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${formatInTimeZone(date, DEFAULT_TIMEZONE, pattern)} ${TIME_SUFFIX}`;
}

export function formatDateInET(
  value: Date | string | number,
  pattern: string = "MMM d, yyyy",
): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, DEFAULT_TIMEZONE, pattern);
}

export function etToday(): Date {
  return toZonedTime(new Date(), DEFAULT_TIMEZONE);
}

/**
 * Compact `yyyyMMdd`, with NO separators. This is the `systemId` form
 * (`CL-4645-ARR-20260901-012`) and nothing else.
 *
 * ⚠ Not a date-input value and not parseable by `new Date()`. Reach for
 * `etYMD` for anything that goes into an `<input type="date">`, into a
 * `yyyy-MM-dd` API field, or back through `new Date(...)`. Using this one by
 * mistake crashed the batch-create wizard on 2026-09-08: the seeded date
 * `"20260908"` became `new Date("20260908T12:00:00Z")` → Invalid Date →
 * `RangeError: Invalid time value` out of `formatInTimeZone`.
 */
export function etYYYYMMDD(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, DEFAULT_TIMEZONE, "yyyyMMdd");
}

/**
 * Format a DATE-ONLY column (Prisma `@db.Date`) for display.
 *
 * ⚠ Use this, never `formatDateInET`, for `scheduledFor` and friends. A
 * `@db.Date` has no time and no zone: Prisma hands it back as UTC midnight, so
 * converting it to Eastern moves it to 8pm the PREVIOUS day and it renders one
 * day early. `scheduledFor` 2026-09-08 displayed as "Sep 7, 2026" on four
 * screens until 2026-09-08, while the instance's own name still said 090826 —
 * the row disagreed with itself.
 *
 * Formatting in UTC is not a fudge here: the stored value IS the calendar day,
 * so reading it back in the zone it was written in is the only lossless thing
 * to do. Timestamps that genuinely have an instant (`submittedAt`,
 * `createdAt`) still belong in `formatInET`/`formatDateInET`.
 */
export function formatDateOnly(
  value: Date | string | number,
  pattern: string = "MMM d, yyyy",
): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, "UTC", pattern);
}

/** `yyyy-MM-dd` of a date-only column, for grouping and comparison. */
export function ymdOfDateOnly(value: Date | string | number): string {
  return formatDateOnly(value, "yyyy-MM-dd");
}

/**
 * ET calendar day as `yyyy-MM-dd` — the ISO form.
 *
 * This is what `<input type="date">` reads and writes, what the batch-create
 * action validates (`/^\d{4}-\d{2}-\d{2}$/`), and what `new Date(...)` can
 * parse. Sibling of `etYYYYMMDD`; see the warning there.
 */
export function etYMD(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, DEFAULT_TIMEZONE, "yyyy-MM-dd");
}

/**
 * The current ET calendar date as a UTC-midnight Date, suitable for matching a
 * Postgres `date` column (Prisma `@db.Date`). E.g. if it's 11pm ET on May 30,
 * this returns 2026-05-30T00:00:00Z regardless of the server's own timezone.
 */
export function etDateOnly(value: Date | string | number = new Date()): Date {
  const ymd = etYYYYMMDD(value);
  return new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00.000Z`);
}

/**
 * The UTC instant at which the given ET calendar day (a "yyyy-MM-dd" string)
 * begins, honoring EDT/EST. Use to filter a timestamptz column (e.g.
 * `createdAt`) by an ET date — a plain `${ymd}T00:00:00Z` parse would be wrong
 * by the 4–5h ET offset and can bucket boundary rows into the neighboring day.
 */
export function etDayStartUtc(ymd: string): Date {
  return fromZonedTime(`${ymd}T00:00:00`, DEFAULT_TIMEZONE);
}

/** The "yyyy-MM-dd" for the calendar day after the given one (DST-agnostic —
 *  operates on the calendar date only). Pair with etDayStartUtc for an
 *  exclusive upper bound that includes the whole ET end-day. */
export function nextYMD(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
