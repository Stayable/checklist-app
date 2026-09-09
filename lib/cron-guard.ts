import { formatDateInET } from "./datetime";

// ADR-037 — running a cron at a fixed EASTERN hour.
//
// Vercel Cron schedules are fixed UTC and cannot express a timezone, so ONE
// entry drifts by an hour against Eastern twice a year: `0 9 * * *` is 5 AM ET
// in summer and 4 AM ET in winter. The existing checklist generator lived with
// that and said so in a comment.
//
// A digest that says "good morning, here is today" must not arrive at 8 AM for
// half the year, so the fix is the standing pattern: register TWO UTC entries
// an hour apart and let a wall-clock guard admit exactly one. In either DST
// regime precisely one of the two lands on the intended Eastern hour; the
// other is rejected, cheaply, before it touches the database.

/**
 * The ET hour (0–23) of an instant.
 *
 * Goes through `formatDateInET` rather than `Intl.DateTimeFormat` directly —
 * the ESLint rule enforcing that (ADR-013) is right even here, where the value
 * is never shown to anyone: one code path to the timezone means one place that
 * can be wrong. `H` is date-fns' 0–23 hour, which also sidesteps the ICU builds
 * that render midnight as "24" under `hour12: false`.
 */
export function etHourOf(now: Date = new Date()): number {
  return Number(formatDateInET(now, "H"));
}

/**
 * True when `now` falls in the intended Eastern hour.
 *
 * Pair with two UTC cron entries an hour apart. Never use a fixed `EST`/`-05:00`
 * offset instead — that is wrong for roughly eight months of the year, and the
 * failure is silent.
 */
export function isEtHour(targetEtHour: number, now: Date = new Date()): boolean {
  return etHourOf(now) === targetEtHour;
}
