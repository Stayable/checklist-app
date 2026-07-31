// "Guests active now" from Spotipo (Kyle 2026-08-01).
//
// Spotipo has no online flag and no device/session endpoint — /device/,
// /client/, /session/, /online/, /connection/ all 404, verified with a control
// request returning 200 either side so those are real answers, not throttling.
//
// What it DOES have is a real per-guest `last_seen_at`, and the portal stamps
// every currently-connected guest together on a roughly 1-minute heartbeat.
// Guests carrying a fresh stamp are the ones on the network right now.
//
// ⚠ This counts GUEST RECORDS, not devices. There is no MAC anywhere in the
// API. A person on a phone and a laptop may be one record or two depending on
// how they registered, so the honest UI label is "guests active", never
// "devices connected".

/** Minutes of grace on the ~1-minute heartbeat before a guest counts as gone. */
export const ACTIVE_WINDOW_MIN = 5;

/**
 * Spotipo stamps look like `2026-07-31T17:16:43` — no timezone suffix, and they
 * are UTC. `new Date(...)` on that string applies the SERVER's local zone, which
 * on a machine west of UTC makes every guest look hours stale and the active
 * count collapse to zero. Append the Z explicitly.
 */
export function parseSpotipoStamp(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const ms = Date.parse(withZone);
  return Number.isNaN(ms) ? null : new Date(ms);
}

export function isActive(
  raw: unknown,
  now: Date,
  windowMin: number = ACTIVE_WINDOW_MIN,
): boolean {
  const seen = parseSpotipoStamp(raw);
  if (seen === null) return false; // unparseable = not counted, never guessed
  const ageMs = now.getTime() - seen.getTime();
  // A stamp slightly in the future (clock skew between us and Spotipo) is still
  // "now" — clamping at 0 avoids dropping the very guests we most want counted.
  return ageMs <= windowMin * 60_000;
}

export type PageTally = {
  /** Active guests found on this page. */
  active: number;
  /**
   * True once a record older than the window appears. The list is ordered
   * newest-first, so everything after it is older too — the caller stops
   * paging. This is what keeps the cost at 2-3 pages instead of all 10.
   */
  boundaryCrossed: boolean;
};

/** Tallies one page of guest records. Reads only `last_seen_at`. */
export function tallyPage(
  items: { last_seen_at?: unknown }[],
  now: Date,
  windowMin: number = ACTIVE_WINDOW_MIN,
): PageTally {
  let active = 0;
  let boundaryCrossed = false;
  for (const item of items) {
    if (isActive(item?.last_seen_at, now, windowMin)) active += 1;
    else boundaryCrossed = true;
  }
  // A short page is also the end of the list.
  return { active, boundaryCrossed };
}
