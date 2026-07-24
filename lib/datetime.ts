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

export function etYYYYMMDD(value: Date | string | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return formatInTimeZone(date, DEFAULT_TIMEZONE, "yyyyMMdd");
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
