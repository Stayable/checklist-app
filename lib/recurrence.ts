// Pure recurrence engine (ADR-009). No DB, no I/O — the generation action and
// cron wire real data into these functions, and they're covered by Vitest.
//
// All date reasoning is done on a "UTC-midnight of the ET calendar date" Date,
// i.e. the shape `etDateOnly()` in lib/datetime.ts returns. Because the Date is
// pinned to UTC midnight, getUTCDay()/getUTCDate()/getUTCMonth() read back the
// ET calendar day-of-week / day-of-month / month directly, with no tz drift.

export type RecurrencePattern =
  | { type: "daily" }
  | { type: "weekly"; daysOfWeek: number[] } // 0=Sun … 6=Sat
  | { type: "monthly"; dayOfMonth: number } // 1..31, clamped to month length
  | { type: "quarterly"; dayOfMonth: number } // fires in Jan/Apr/Jul/Oct
  | { type: "on-demand" };

// Per-room scope filter for PER_ROOM templates. PER_PROPERTY / AD_HOC templates
// generate a single instance and ignore this.
export type RoomFilter =
  | { kind: "all" }
  | { kind: "occupied" }
  | { kind: "vacant" }
  | { kind: "list"; roomNumbers: string[] }
  | { kind: "range"; from: string; to: string };

export type RuleWindow = {
  // Inclusive ET-date bounds (UTC-midnight Dates), and a skip-day list of
  // "yyyyMMdd" strings. All optional — absent means unbounded / no skips.
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  skipDays?: string[] | null; // ["20260704", ...]
};

const QUARTER_START_MONTHS = new Set([0, 3, 6, 9]); // Jan, Apr, Jul, Oct (0-indexed)

function daysInUtcMonth(date: Date): number {
  // Day 0 of next month = last day of this month.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

// Clamp a requested day-of-month to the actual length of the target month, so a
// "31st" rule still fires on Feb 28/29, Apr 30, etc.
function effectiveDom(date: Date, requested: number): number {
  return Math.min(requested, daysInUtcMonth(date));
}

/**
 * Does this rule fire on the given ET calendar date?
 * `target` must be UTC-midnight of the ET date (see lib/datetime.etDateOnly).
 */
export function shouldGenerateOn(
  pattern: RecurrencePattern,
  target: Date,
  window: RuleWindow = {},
): boolean {
  if (pattern.type === "on-demand") return false;

  // Effective window (inclusive).
  if (window.effectiveFrom && target.getTime() < window.effectiveFrom.getTime()) return false;
  if (window.effectiveTo && target.getTime() > window.effectiveTo.getTime()) return false;

  // Skip-day list (yyyyMMdd).
  if (window.skipDays && window.skipDays.length > 0) {
    const ymd =
      `${target.getUTCFullYear()}` +
      `${String(target.getUTCMonth() + 1).padStart(2, "0")}` +
      `${String(target.getUTCDate()).padStart(2, "0")}`;
    if (window.skipDays.includes(ymd)) return false;
  }

  switch (pattern.type) {
    case "daily":
      return true;
    case "weekly":
      return pattern.daysOfWeek.includes(target.getUTCDay());
    case "monthly":
      return target.getUTCDate() === effectiveDom(target, pattern.dayOfMonth);
    case "quarterly":
      return (
        QUARTER_START_MONTHS.has(target.getUTCMonth()) &&
        target.getUTCDate() === effectiveDom(target, pattern.dayOfMonth)
      );
  }
}

type RoomLike = { roomNumber: string; status: "OCCUPIED" | "VACANT" | "OOO" };

// Parse a room number for range comparison: numeric when fully numeric, else
// fall back to a stable string compare.
function roomCmpKey(roomNumber: string): { num: number | null; str: string } {
  const num = /^\d+$/.test(roomNumber) ? Number(roomNumber) : null;
  return { num, str: roomNumber };
}

function inRange(roomNumber: string, from: string, to: string): boolean {
  const r = roomCmpKey(roomNumber);
  const a = roomCmpKey(from);
  const b = roomCmpKey(to);
  // Normalize so from <= to regardless of input order.
  if (r.num !== null && a.num !== null && b.num !== null) {
    const lo = Math.min(a.num, b.num);
    const hi = Math.max(a.num, b.num);
    return r.num >= lo && r.num <= hi;
  }
  const lo = a.str <= b.str ? a.str : b.str;
  const hi = a.str <= b.str ? b.str : a.str;
  return r.str >= lo && r.str <= hi;
}

/**
 * Expand a room set down to the rooms a PER_ROOM rule should generate for.
 * OOO rooms are never auto-generated (occupancy-driven work doesn't apply to
 * out-of-order rooms). An explicit `list` still excludes OOO.
 */
export function expandRooms<T extends RoomLike>(rooms: T[], filter: RoomFilter): T[] {
  const live = rooms.filter((r) => r.status !== "OOO");
  switch (filter.kind) {
    case "all":
      return live;
    case "occupied":
      return live.filter((r) => r.status === "OCCUPIED");
    case "vacant":
      return live.filter((r) => r.status === "VACANT");
    case "list": {
      const want = new Set(filter.roomNumbers);
      return live.filter((r) => want.has(r.roomNumber));
    }
    case "range":
      return live.filter((r) => inRange(r.roomNumber, filter.from, filter.to));
  }
}

/**
 * ADR-009 system ID: CL-{propertyCode}-{templateCode}-{YYYYMMDD}-{seq}.
 * `seq` is 1-based and zero-padded to 3 digits, restarting at 001 each ET day.
 */
export function buildSystemId(
  propertyCode: string,
  templateCode: string,
  ymd: string,
  seq: number,
): string {
  return `CL-${propertyCode}-${templateCode}-${ymd}-${String(seq).padStart(3, "0")}`;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Human-readable cadence summary for a rule's pattern (UI list rows). */
export function describePattern(pattern: RecurrencePattern): string {
  switch (pattern.type) {
    case "daily":
      return "Daily";
    case "weekly": {
      const days = [...pattern.daysOfWeek].sort((a, b) => a - b).map((d) => DOW_LABELS[d]);
      return days.length ? `Weekly · ${days.join(", ")}` : "Weekly";
    }
    case "monthly":
      return `Monthly · ${ordinal(pattern.dayOfMonth)}`;
    case "quarterly":
      return `Quarterly · ${ordinal(pattern.dayOfMonth)} (Jan/Apr/Jul/Oct)`;
    case "on-demand":
      return "On-demand";
  }
}

/** Human-readable scope summary for a PER_ROOM rule's room filter. */
export function describeScope(filter: RoomFilter | null | undefined): string {
  if (!filter) return "All rooms";
  switch (filter.kind) {
    case "all":
      return "All rooms";
    case "occupied":
      return "Occupied rooms";
    case "vacant":
      return "Vacant rooms";
    case "list":
      return `Rooms ${filter.roomNumbers.join(", ")}`;
    case "range":
      return `Rooms ${filter.from}–${filter.to}`;
  }
}

/**
 * ADR-009 human label: "{Template} — {Short Code} — {Scope} — {Date}".
 * `scope` is the per-instance scope text (e.g. "Rm 312", "May 2026") or null
 * for property-wide instances, in which case it's omitted.
 */
export function buildHumanLabel(parts: {
  templateName: string;
  shortCode: string;
  scope?: string | null;
  dateLabel: string;
}): string {
  const segments = [parts.templateName, parts.shortCode];
  if (parts.scope) segments.push(parts.scope);
  segments.push(parts.dateLabel);
  return segments.join(" — ");
}
