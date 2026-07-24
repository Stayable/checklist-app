/** Spec §5.5: 5+ devices at the same property going offline within 120s. */
export const MASS_OUTAGE_THRESHOLD = 5;
export const MASS_OUTAGE_WINDOW_SEC = 120;

/** Standard per-device ticket timer: create a ticket if not resolved within this many minutes. */
export const TICKET_TIMER_MIN = 5;

/** Resolution-check cadence once a mass-outage window is declared. */
export const MASS_OUTAGE_CHECK_MIN = 10;

/**
 * Counts how many `times` fall within `windowSec` seconds at-or-before `now`
 * (inclusive of the boundary). Timestamps after `now` (clock skew / bad data)
 * are ignored, not counted.
 */
export function countWithinWindow(
  times: Date[],
  now: Date,
  windowSec: number = MASS_OUTAGE_WINDOW_SEC,
): number {
  const nowMs = now.getTime();
  const windowMs = windowSec * 1000;
  return times.filter((t) => {
    const deltaMs = nowMs - t.getTime();
    return deltaMs >= 0 && deltaMs <= windowMs;
  }).length;
}

/**
 * True when `times` (property-scoped PROBLEM-event timestamps, caller-
 * supplied) contains at least MASS_OUTAGE_THRESHOLD entries within the
 * mass-outage window ending at `now`.
 */
export function isMassOutage(times: Date[], now: Date): boolean {
  return countWithinWindow(times, now) >= MASS_OUTAGE_THRESHOLD;
}
