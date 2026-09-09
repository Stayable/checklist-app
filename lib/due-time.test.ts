import { describe, expect, it } from "vitest";

import { DUE_TIME_PATTERN, dueAtFor, formatDueTime } from "./due-time";

// The arithmetic that turns a rule's ET wall-clock deadline into the UTC
// instant stored in `checklist_instances.due_at`. Worth pinning: an off-by-one
// hour here is invisible until a checklist is marked late an hour early, twice
// a year, only in the weeks around a DST switch.

describe("DUE_TIME_PATTERN", () => {
  it("accepts 24-hour HH:mm", () => {
    for (const t of ["00:00", "09:30", "18:00", "23:59"]) {
      expect(DUE_TIME_PATTERN.test(t)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    // "9:00" matters most: an <input type="time"> never produces it, but a
    // hand-rolled API call would, and it would sort and parse inconsistently.
    for (const t of ["9:00", "24:00", "18:60", "18", "6:00 PM", "", "18:0"]) {
      expect(DUE_TIME_PATTERN.test(t)).toBe(false);
    }
  });
});

describe("dueAtFor", () => {
  it("resolves ET wall-clock time on the given day, in EDT", () => {
    // 2026-09-09 is EDT (UTC-4), so 18:00 ET is 22:00Z the same day.
    expect(dueAtFor("2026-09-09", "18:00")?.toISOString()).toBe("2026-09-09T22:00:00.000Z");
  });

  it("resolves ET wall-clock time on the given day, in EST", () => {
    // 2026-01-15 is EST (UTC-5), so the SAME 18:00 is 23:00Z. A hardcoded
    // offset would put this an hour out for four months of the year.
    expect(dueAtFor("2026-01-15", "18:00")?.toISOString()).toBe("2026-01-15T23:00:00.000Z");
  });

  it("handles midnight and the last minute of the day", () => {
    expect(dueAtFor("2026-09-09", "00:00")?.toISOString()).toBe("2026-09-09T04:00:00.000Z");
    expect(dueAtFor("2026-09-09", "23:59")?.toISOString()).toBe("2026-09-10T03:59:00.000Z");
  });

  it("returns null for no due time — the 'no deadline' case", () => {
    expect(dueAtFor("2026-09-09", null)).toBeNull();
    expect(dueAtFor("2026-09-09", undefined)).toBeNull();
    expect(dueAtFor("2026-09-09", "")).toBeNull();
  });

  it("returns null rather than an Invalid Date for a malformed stored value", () => {
    // The rule path reads this column back out of Postgres. An Invalid Date
    // would reach Prisma as a write failure at 5 AM on the cron.
    expect(dueAtFor("2026-09-09", "6pm")).toBeNull();
    expect(dueAtFor("2026-09-09", "25:00")).toBeNull();
  });
});

describe("formatDueTime", () => {
  it("renders 12-hour with an ET suffix", () => {
    expect(formatDueTime("18:00")).toBe("6:00 PM ET");
    expect(formatDueTime("09:05")).toBe("9:05 AM ET");
    expect(formatDueTime("00:30")).toBe("12:30 AM ET");
    expect(formatDueTime("12:00")).toBe("12:00 PM ET");
  });

  it("returns null when there is nothing to show", () => {
    expect(formatDueTime(null)).toBeNull();
    expect(formatDueTime("nonsense")).toBeNull();
  });
});
