// Pure calendar math for the contractor scheduling calendar (day / week /
// workweek / month grid over ContractorJob.scheduledFor). No DB, no I/O, no
// React — mirrors lib/recurrence.ts's shape so it stays unit-testable and
// dependency-free.
//
// TWO DELIBERATE CHOICES, both load-bearing:
//
// 1. DASHED "yyyy-MM-dd" IS THE INTERNAL CURRENCY OF THIS MODULE.
//    lib/datetime.ts's etYYYYMMDD() returns COMPACT "20260811" (no dashes),
//    while etDayStartUtc()/nextYMD() in that same file consume and return
//    DASHED "2026-08-11". Mixing the two forms inside one module is exactly
//    the class of bug this file exists to prevent — a compact string slipped
//    into a dashed-expecting comparison fails silently (string mismatch, not
//    a thrown error). So every function here works in dashed form, and the
//    ONLY conversions to/from compact happen at the URL boundary:
//    parseDateParam() accepts either shape coming IN from a query string,
//    and toCompact() is the one place a dashed ymd goes OUT to a compact URL
//    param (matching ADR-009's CL-{prop}-{tmpl}-{YYYYMMDD}-{seq} convention
//    elsewhere in the app).
//
// 2. ALL DAY-STEPPING ARITHMETIC RUNS ON UTC-MIDNIGHT Dates.
//    A calendar day has no time component, so there is no "wrong timezone"
//    to get day math wrong in — UTC is simply the frame with no DST
//    transitions to trip over. Building a Date from `${ymd}T00:00:00.000Z`
//    and stepping with setUTCDate()/getUTCDate() etc. never observes a
//    23-hour or 25-hour day, unlike local-time arithmetic across a DST
//    boundary. This is why the suite explicitly exercises the 2026-03-08
//    (spring-forward) and 2026-11-01 (fall-back) ET transition weeks: on
//    correct UTC-midnight arithmetic those are unremarkable 7-day weeks,
//    which is the point of the test, not a coincidence of them passing.
//    (Only parseDateParam's "no input" fallback and todayYMD() touch ET at
//    all, via etYYYYMMDD() — everything else is timezone-agnostic day math.)

import { etYYYYMMDD } from "./datetime";

export type CalendarView = "day" | "week" | "workweek" | "month";

export const CALENDAR_VIEWS: readonly CalendarView[] = ["day", "week", "workweek", "month"];

export const VIEW_LABELS: Record<CalendarView, string> = {
  day: "Day",
  week: "Week",
  workweek: "Work Week",
  month: "Month",
};

export const DEFAULT_VIEW: CalendarView = "workweek";

/** Parse a `view` query param, falling back to DEFAULT_VIEW for anything not
 *  exactly one of CALENDAR_VIEWS (no case-normalization — an unrecognized
 *  value is treated the same as absent). */
export function parseView(raw: string | undefined): CalendarView {
  if (raw && (CALENDAR_VIEWS as readonly string[]).includes(raw)) {
    return raw as CalendarView;
  }
  return DEFAULT_VIEW;
}

const DASHED_RE = /^\d{4}-\d{2}-\d{2}$/;
const COMPACT_RE = /^\d{8}$/;

function toDashed(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** Today's ET calendar date, in dashed form. */
export function todayYMD(): string {
  return toDashed(etYYYYMMDD());
}

/** Dashed "yyyy-MM-dd" -> compact "yyyyMMdd" (URL-param boundary only). */
export function toCompact(ymd: string): string {
  return ymd.replace(/-/g, "");
}

// A dashed ymd interpreted as UTC midnight — the one Date shape this module
// ever constructs from a string.
function parseYMD(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Extract the "yyyy-MM-dd" UTC calendar date from a Date. Only meaningful
 *  for Dates this module produced (UTC-midnight) or an equivalent caller. */
export function ymdOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a `date` query param. Accepts dashed ("2026-08-11") or compact
 * ("20260811"); returns dashed. Falls back to today (ET) for anything
 * absent, malformed, or an impossible calendar date.
 *
 * Impossible dates (e.g. "2026-02-31") are rejected by ROUND-TRIPPING
 * through ymdOf rather than trusting the regex shape: JS Date silently
 * overflows "2026-02-31" into "2026-03-03" instead of throwing, so the
 * regex alone would accept a value that then quietly renders the wrong day.
 */
export function parseDateParam(raw: string | undefined): string {
  if (!raw) return todayYMD();

  let candidate: string | null = null;
  if (DASHED_RE.test(raw)) candidate = raw;
  else if (COMPACT_RE.test(raw)) candidate = toDashed(raw);
  if (!candidate) return todayYMD();

  const parsed = parseYMD(candidate);
  if (Number.isNaN(parsed.getTime())) return todayYMD();
  if (ymdOf(parsed) !== candidate) return todayYMD(); // overflowed -> reject

  return candidate;
}

/** ymd + n calendar days (n may be negative). */
export function addDaysYMD(ymd: string, n: number): string {
  const d = parseYMD(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return ymdOf(d);
}

/** The Sunday on or before ymd's calendar date. */
export function weekStartYMD(ymd: string): string {
  const d = parseYMD(ymd);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay(): 0=Sun..6=Sat
  return ymdOf(d);
}

/** The 1st of ymd's calendar month. */
export function monthStartYMD(ymd: string): string {
  const d = parseYMD(ymd);
  d.setUTCDate(1);
  return ymdOf(d);
}

function daysInUtcMonth(year: number, monthIndex0: number): number {
  // Day 0 of the next month = the last day of this one.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Shift ymd by a calendar month, clamping the day-of-month to the target
 *  month's length (31 Mar - 1 month -> 28 Feb, not an overflow into March). */
function shiftMonthYMD(ymd: string, dir: -1 | 1): string {
  const [y, m, day] = ymd.split("-").map(Number);
  // Date.UTC normalizes an out-of-range month index (e.g. -1, 12) into the
  // correct adjacent year, so year carry needs no hand-rolled arithmetic.
  const targetMonthIndex0 = m - 1 + dir;
  const probe = new Date(Date.UTC(y, targetMonthIndex0, 1));
  const clampedDay = Math.min(day, daysInUtcMonth(probe.getUTCFullYear(), probe.getUTCMonth()));
  return ymdOf(new Date(Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth(), clampedDay)));
}

export type DayCell = {
  ymd: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function makeRange(
  startYmd: string,
  count: number,
  todayYmd: string,
  currentMonthPrefix: string | null,
): DayCell[] {
  const cells: DayCell[] = [];
  for (let i = 0; i < count; i++) {
    const ymd = i === 0 ? startYmd : addDaysYMD(startYmd, i);
    cells.push({
      ymd,
      inCurrentMonth: currentMonthPrefix === null || ymd.slice(0, 7) === currentMonthPrefix,
      isToday: ymd === todayYmd,
    });
  }
  return cells;
}

/**
 * Build the visible day cells for a view anchored on anchorYMD.
 * - day: 1 cell.
 * - week: 7 cells, Sunday through Saturday.
 * - workweek: 5 cells, Monday through Friday, per the single rule
 *   `addDaysYMD(weekStartYMD(anchor), 1)` — this is what makes a Saturday
 *   anchor show that week's Mon-Fri and a Sunday anchor show the FOLLOWING
 *   week's Mon-Fri (matching Outlook's workweek view), with no day-of-week
 *   special-casing needed.
 * - month: ALWAYS 42 cells (6 full weeks) from the Sunday on/before the 1st,
 *   regardless of how many weeks the month actually spans. A variable-height
 *   grid would resize the page every time the user navigates months; a fixed
 *   42 does not. Padding days from the adjacent months are flagged
 *   `inCurrentMonth: false` so the UI can dim them.
 */
export function buildCells(view: CalendarView, anchorYMD: string, todayYmd: string): DayCell[] {
  switch (view) {
    case "day":
      return makeRange(anchorYMD, 1, todayYmd, null);
    case "week":
      return makeRange(weekStartYMD(anchorYMD), 7, todayYmd, null);
    case "workweek":
      return makeRange(addDaysYMD(weekStartYMD(anchorYMD), 1), 5, todayYmd, null);
    case "month": {
      const monthStart = monthStartYMD(anchorYMD);
      const gridStart = weekStartYMD(monthStart);
      return makeRange(gridStart, 42, todayYmd, monthStart.slice(0, 7));
    }
  }
}

/**
 * UTC-midnight inclusive bounds of a cell range, for a Postgres `@db.Date`
 * query (`scheduledFor >= startDate AND scheduledFor <= endDateInclusive`).
 * `@db.Date` has no time component, so `lte` the last calendar day is exact
 * — unlike a timestamptz range, there's no need for nextYMD()'s exclusive
 * upper-bound dance to avoid clipping the final day's rows.
 */
export function rangeBounds(cells: DayCell[]): { startDate: Date; endDateInclusive: Date } {
  return {
    startDate: parseYMD(cells[0].ymd),
    endDateInclusive: parseYMD(cells[cells.length - 1].ymd),
  };
}

/**
 * Move the anchor to the next/previous page for a view. day/week/workweek
 * all step by whole days (1 or 7); month steps by a calendar month with
 * day-of-month clamping (see shiftMonthYMD).
 */
export function shiftAnchor(view: CalendarView, ymd: string, dir: -1 | 1): string {
  switch (view) {
    case "day":
      return addDaysYMD(ymd, dir);
    case "week":
    case "workweek":
      return addDaysYMD(ymd, dir * 7);
    case "month":
      return shiftMonthYMD(ymd, dir);
  }
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/** Human-readable header title for the given view's cell range. */
export function formatViewTitle(view: CalendarView, cells: DayCell[]): string {
  if (view === "month") {
    // Title the calendar month itself, not the padding-day grid — the first
    // in-month cell is always the 1st of that month.
    const anchorCell = cells.find((c) => c.inCurrentMonth) ?? cells[0];
    const { y, m } = parts(anchorCell.ymd);
    return `${MONTH_LABELS[m - 1]} ${y}`;
  }

  const first = parts(cells[0].ymd);
  const last = parts(cells[cells.length - 1].ymd);

  if (cells.length === 1) {
    return `${MONTH_LABELS[first.m - 1]} ${first.d}, ${first.y}`;
  }
  if (first.y === last.y && first.m === last.m) {
    return `${MONTH_LABELS[first.m - 1]} ${first.d}–${last.d}, ${first.y}`;
  }
  if (first.y === last.y) {
    return `${MONTH_LABELS[first.m - 1]} ${first.d} – ${MONTH_LABELS[last.m - 1]} ${last.d}, ${first.y}`;
  }
  return (
    `${MONTH_LABELS[first.m - 1]} ${first.d}, ${first.y} – ` +
    `${MONTH_LABELS[last.m - 1]} ${last.d}, ${last.y}`
  );
}
