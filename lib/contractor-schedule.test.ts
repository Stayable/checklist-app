import { describe, expect, it } from "vitest";
import {
  addDaysYMD,
  buildCells,
  CALENDAR_VIEWS,
  DEFAULT_VIEW,
  formatViewTitle,
  monthStartYMD,
  parseDateParam,
  parseView,
  rangeBounds,
  shiftAnchor,
  toCompact,
  weekStartYMD,
  ymdOf,
  type CalendarView,
} from "./contractor-schedule";

// Fixed anchor for the whole suite: 2026-08-10 is a Monday.
const ANCHOR = "2026-08-10";

describe("parseView", () => {
  it("returns the default view when raw is undefined", () => {
    expect(parseView(undefined)).toBe(DEFAULT_VIEW);
  });

  it("accepts every value in CALENDAR_VIEWS", () => {
    for (const v of CALENDAR_VIEWS) {
      expect(parseView(v)).toBe(v);
    }
  });

  it("rejects junk and falls back to the default", () => {
    expect(parseView("fortnight")).toBe(DEFAULT_VIEW);
    expect(parseView("")).toBe(DEFAULT_VIEW);
    expect(parseView("DAY")).toBe(DEFAULT_VIEW); // case-sensitive, not normalized
  });
});

describe("parseDateParam", () => {
  it("accepts dashed input and returns it unchanged", () => {
    expect(parseDateParam("2026-08-10")).toBe("2026-08-10");
  });

  it("accepts compact input and returns dashed", () => {
    expect(parseDateParam("20260810")).toBe("2026-08-10");
  });

  it("falls back to today (ET) when input is absent", () => {
    // Can't hardcode "today," but it must be a well-formed dashed ymd that
    // survives a round trip.
    const result = parseDateParam(undefined);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ymdOf(new Date(`${result}T00:00:00.000Z`))).toBe(result);
  });

  it("rejects an impossible calendar date (Feb 31) rather than overflowing", () => {
    // 2026-02-31 silently overflows to 2026-03-03 if you don't round-trip
    // check — must not return that.
    const result = parseDateParam("2026-02-31");
    expect(result).not.toBe("2026-02-31");
    expect(result).not.toBe("2026-03-03");
  });

  it("rejects a malformed string", () => {
    const result = parseDateParam("not-a-date");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects an out-of-range month", () => {
    const result = parseDateParam("2026-13-01");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).not.toBe("2026-13-01");
  });
});

describe("toCompact / ymdOf", () => {
  it("toCompact strips dashes", () => {
    expect(toCompact("2026-08-10")).toBe("20260810");
  });

  it("ymdOf extracts the UTC calendar date", () => {
    expect(ymdOf(new Date("2026-08-10T00:00:00.000Z"))).toBe("2026-08-10");
  });
});

describe("addDaysYMD", () => {
  it("steps within a month", () => {
    expect(addDaysYMD("2026-08-10", 1)).toBe("2026-08-11");
    expect(addDaysYMD("2026-08-10", -1)).toBe("2026-08-09");
  });

  it("crosses a month boundary", () => {
    expect(addDaysYMD("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysYMD("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(addDaysYMD("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYMD("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("crosses a leap day correctly (2028 is a leap year)", () => {
    expect(addDaysYMD("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysYMD("2028-02-29", 1)).toBe("2028-03-01");
    // 2026 is NOT a leap year.
    expect(addDaysYMD("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("weekStartYMD", () => {
  it("from a Monday goes back to Sunday", () => {
    expect(weekStartYMD("2026-08-10")).toBe("2026-08-09");
  });

  it("from a Sunday stays put", () => {
    expect(weekStartYMD("2026-08-09")).toBe("2026-08-09");
  });

  it("from a Saturday goes back to that week's Sunday", () => {
    expect(weekStartYMD("2026-08-15")).toBe("2026-08-09");
  });
});

describe("monthStartYMD", () => {
  it("returns the 1st of the anchor's month", () => {
    expect(monthStartYMD(ANCHOR)).toBe("2026-08-01");
  });
});

describe("buildCells", () => {
  const today = ANCHOR;

  it("day view produces exactly 1 cell", () => {
    const cells = buildCells("day", ANCHOR, today);
    expect(cells).toHaveLength(1);
    expect(cells[0].ymd).toBe(ANCHOR);
  });

  it("week view produces 7 cells Sun through Sat", () => {
    const cells = buildCells("week", ANCHOR, today);
    expect(cells).toHaveLength(7);
    expect(cells[0].ymd).toBe("2026-08-09"); // Sun
    expect(cells[6].ymd).toBe("2026-08-15"); // Sat
  });

  it("workweek view produces 5 cells Mon through Fri", () => {
    const cells = buildCells("workweek", ANCHOR, today);
    expect(cells).toHaveLength(5);
    expect(cells.map((c) => c.ymd)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("workweek anchored on a Saturday shows that week's Mon-Fri", () => {
    // 2026-08-15 is a Saturday, in the same Sun-Sat week as the ANCHOR Monday.
    const cells = buildCells("workweek", "2026-08-15", today);
    expect(cells.map((c) => c.ymd)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
  });

  it("workweek anchored on a Sunday shows the FOLLOWING week's Mon-Fri", () => {
    // 2026-08-16 is a Sunday; its Sun-Sat week is 08-16..08-22, so the rule
    // (Monday of that week) lands on 08-17, matching Outlook.
    const cells = buildCells("workweek", "2026-08-16", today);
    expect(cells.map((c) => c.ymd)).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
    ]);
  });

  it("month view always produces 42 cells starting from the Sunday on/before the 1st", () => {
    const cells = buildCells("month", ANCHOR, today);
    expect(cells).toHaveLength(42);
    expect(cells[0].ymd).toBe("2026-07-26");
    const inMonth = cells.filter((c) => c.inCurrentMonth);
    expect(inMonth).toHaveLength(31); // August has 31 days
    expect(inMonth[0].ymd).toBe("2026-08-01");
    expect(inMonth[inMonth.length - 1].ymd).toBe("2026-08-31");
  });

  it("February month view has 28 in-month cells in 2026 (not a leap year)", () => {
    const cells = buildCells("month", "2026-02-10", today);
    expect(cells).toHaveLength(42);
    const inMonth = cells.filter((c) => c.inCurrentMonth);
    expect(inMonth).toHaveLength(28);
  });

  // The boundary ymds are pinned as literals, not just checked for being 7
  // distinct consecutive days: the consecutive-days check would still pass if
  // the whole week were shifted by one on these two dates specifically, which
  // is exactly the failure a DST bug produces.
  it("spring-forward week (2026-03-08, ET DST start) has 7 distinct consecutive days", () => {
    const cells = buildCells("week", "2026-03-08", today);
    expect(cells).toHaveLength(7);
    const unique = new Set(cells.map((c) => c.ymd));
    expect(unique.size).toBe(7);
    for (let i = 1; i < cells.length; i++) {
      expect(addDaysYMD(cells[i - 1].ymd, 1)).toBe(cells[i].ymd);
    }
    expect(cells[0].ymd).toBe("2026-03-08");
    expect(cells[6].ymd).toBe("2026-03-14");
  });

  it("fall-back week (2026-11-01, ET DST end) has 7 distinct consecutive days", () => {
    const cells = buildCells("week", "2026-11-01", today);
    expect(cells).toHaveLength(7);
    const unique = new Set(cells.map((c) => c.ymd));
    expect(unique.size).toBe(7);
    for (let i = 1; i < cells.length; i++) {
      expect(addDaysYMD(cells[i - 1].ymd, 1)).toBe(cells[i].ymd);
    }
    expect(cells[0].ymd).toBe("2026-11-01");
    expect(cells[6].ymd).toBe("2026-11-07");
  });

  it("marks exactly one cell isToday when today is in range", () => {
    const cells = buildCells("week", ANCHOR, "2026-08-12");
    const flagged = cells.filter((c) => c.isToday);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].ymd).toBe("2026-08-12");
  });

  it("marks no cell isToday when today is out of range", () => {
    const cells = buildCells("week", ANCHOR, "2026-09-01");
    expect(cells.some((c) => c.isToday)).toBe(false);
  });
});

describe("rangeBounds", () => {
  it("returns UTC-midnight inclusive bounds for the workweek", () => {
    const cells = buildCells("workweek", ANCHOR, ANCHOR);
    const { startDate, endDateInclusive } = rangeBounds(cells);
    expect(startDate.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(endDateInclusive.toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("shiftAnchor", () => {
  it("day shifts by 1 day", () => {
    expect(shiftAnchor("day", ANCHOR, 1)).toBe("2026-08-11");
    expect(shiftAnchor("day", ANCHOR, -1)).toBe("2026-08-09");
  });

  it("week shifts by 7 days", () => {
    expect(shiftAnchor("week", ANCHOR, 1)).toBe("2026-08-17");
    expect(shiftAnchor("week", ANCHOR, -1)).toBe("2026-08-03");
  });

  it("workweek shifts by 7 days", () => {
    expect(shiftAnchor("workweek", ANCHOR, 1)).toBe("2026-08-17");
    expect(shiftAnchor("workweek", ANCHOR, -1)).toBe("2026-08-03");
  });

  it("month shifts by a calendar month", () => {
    expect(shiftAnchor("month", ANCHOR, 1)).toBe("2026-09-10");
    expect(shiftAnchor("month", ANCHOR, -1)).toBe("2026-07-10");
  });

  it("month shift clamps the day when the target month is shorter", () => {
    expect(shiftAnchor("month", "2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftAnchor("month", "2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("formatViewTitle", () => {
  it("day view formats a single date", () => {
    const cells = buildCells("day", ANCHOR, ANCHOR);
    expect(formatViewTitle("day", cells)).toBe("August 10, 2026");
  });

  it("week/workweek view spanning one month formats a range", () => {
    const cells = buildCells("workweek", ANCHOR, ANCHOR);
    expect(formatViewTitle("workweek", cells)).toBe("August 10–14, 2026");
  });

  it("week view spanning two months formats both month names", () => {
    // 2026-08-30 is a Sunday; that week runs Aug 30 - Sep 5.
    const cells = buildCells("week", "2026-08-30", ANCHOR);
    expect(formatViewTitle("week", cells)).toBe("August 30 – September 5, 2026");
  });

  it("month view formats the month and year", () => {
    const cells = buildCells("month", ANCHOR, ANCHOR);
    expect(formatViewTitle("month" as CalendarView, cells)).toBe("August 2026");
  });
});
