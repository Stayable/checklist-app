/**
 * Pure display helpers for the NETWORK dashboard/ticket UI (Task 6). Kept
 * dependency-free like lib/network/ticketing.ts so they unit-test cleanly.
 */

export type AgeBucket = "green" | "amber" | "red";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Color-codes an open ticket's age from its opened time (spec §6.1). Boundaries
 * (explicit, inclusive at the amber edges):
 *   ageMs <  1h        -> green
 *   1h <= ageMs <= 4h   -> amber
 *   ageMs >  4h        -> red
 */
export function ticketAgeBucket(openedAt: Date, now: Date): AgeBucket {
  const ageMs = now.getTime() - openedAt.getTime();
  if (ageMs < HOUR_MS) return "green";
  if (ageMs <= 4 * HOUR_MS) return "amber";
  return "red";
}

/**
 * A device is flagged "recurring" once it has generated 3 or more tickets in
 * the trailing 30 days (spec §6.4). The 30-day window itself is the caller's
 * job (a DB query); this just applies the threshold.
 */
export function isRecurringDevice(ticketCountLast30d: number): boolean {
  return ticketCountLast30d >= 3;
}
