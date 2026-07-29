/**
 * Pure decision logic for the standard (per-device) ticket lifecycle
 * (DevSpec §5.2). Kept dependency-free so it's directly unit-testable —
 * DB access lives in ticketing.server.ts.
 */

export type TimerAction =
  | "SKIP_ALREADY_TICKETED"
  | "SKIP_SELF_RESOLVED"
  | "CREATE_TICKET";

/**
 * Evaluated when the 5-minute standard-ticket timer (NetworkJob) fires for a
 * PROBLEM event. Order matters (spec §5.2):
 *   1. A ticket already exists for this device (opened by an earlier timer
 *      or manually) -> nothing to do, it's already being tracked.
 *   2. No open ticket, but the PROBLEM already has a matching RECOVERY
 *      (`resolvedByEventId` set) -> it self-resolved inside the 5-minute
 *      window, no ticket needed.
 *   3. Otherwise -> still down past the threshold, create the ticket.
 */
export function decideTimerAction(input: {
  hasOpenTicket: boolean;
  problemResolved: boolean;
}): TimerAction {
  if (input.hasOpenTicket) return "SKIP_ALREADY_TICKETED";
  if (input.problemResolved) return "SKIP_SELF_RESOLVED";
  return "CREATE_TICKET";
}

/**
 * Whole minutes a device was down, from the triggering PROBLEM event's
 * server-received timestamp to ticket resolution. Never negative (clock
 * skew / bad data clamps to 0) — mirrors the rounding convention used
 * elsewhere in the codebase (Math.round, not floor/ceil).
 */
export function downDurationMin(problemReceivedAt: Date, resolvedAt: Date): number {
  const deltaMs = resolvedAt.getTime() - problemReceivedAt.getTime();
  return Math.max(0, Math.round(deltaMs / 60_000));
}
