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
