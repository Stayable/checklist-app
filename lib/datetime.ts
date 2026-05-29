import { formatInTimeZone, toZonedTime } from "date-fns-tz";

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
