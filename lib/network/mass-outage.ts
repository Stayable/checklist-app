import type { TicketStatus } from "@prisma/client";

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

/**
 * One entry in a MASS_OUTAGE ticket's `affectedDevices` Json snapshot
 * (spec §5.5). `recoveredAt` is an ISO string (not a Date) because it's
 * stored/round-tripped through a Prisma Json column.
 */
export type AffectedDevice = {
  deviceId: string;
  deviceName: string;
  status: "offline" | "recovered";
  recoveredAt: string | null;
};

/**
 * Splits a mass-outage ticket's affected-device list into recovered vs
 * still-offline, given the set of device ids determined (by the caller, via
 * DB lookups) to have recovered as of `now`. Pure — no I/O.
 *
 * An entry already marked "recovered" (from an earlier check cycle) is left
 * untouched regardless of `recoveredIds` membership, so its original
 * `recoveredAt` is never overwritten by a later, redundant check.
 */
export function partitionRecovery(
  affected: AffectedDevice[],
  recoveredIds: Set<string>,
  now: Date,
): { updated: AffectedDevice[]; recovered: AffectedDevice[]; stillOffline: AffectedDevice[] } {
  const nowIso = now.toISOString();
  const updated = affected.map((d): AffectedDevice => {
    if (d.status === "recovered") return d; // already recovered — preserve its recoveredAt
    if (recoveredIds.has(d.deviceId)) {
      return { ...d, status: "recovered", recoveredAt: nowIso };
    }
    return d;
  });

  return {
    updated,
    recovered: updated.filter((d) => d.status === "recovered"),
    stillOffline: updated.filter((d) => d.status === "offline"),
  };
}

/**
 * True iff there is at least one child ticket AND every one of them has
 * reached a terminal status (RESOLVED or CLOSED). Used to cascade-close a
 * MASS_OUTAGE parent ticket once all its spawned STANDARD children are done
 * (spec §5.5). An empty list means "no children yet" — never cascades.
 */
export function allChildrenResolved(childStatuses: TicketStatus[]): boolean {
  if (childStatuses.length === 0) return false;
  return childStatuses.every((s) => s === "RESOLVED" || s === "CLOSED");
}
