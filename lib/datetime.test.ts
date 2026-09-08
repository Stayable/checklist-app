import { describe, expect, it } from "vitest";
import {
  etYMD,
  etYYYYMMDD,
  formatDateInET,
  formatDateOnly,
  ymdOfDateOnly,
} from "./datetime";

// What Prisma hands back for a `@db.Date` column: the calendar day, at UTC
// midnight, with no time and no zone of its own.
const SCHEDULED_SEP_8 = new Date("2026-09-08T00:00:00.000Z");

describe("formatDateOnly — date-only columns", () => {
  it("renders the day that is stored, not the day before", () => {
    // The bug this exists to prevent: `scheduledFor` 2026-09-08 rendered as
    // "Sep 7, 2026" on the checklist, review and completed screens, because
    // UTC midnight converted to Eastern is 8pm the previous day.
    expect(formatDateOnly(SCHEDULED_SEP_8)).toBe("Sep 8, 2026");
    expect(formatDateInET(SCHEDULED_SEP_8)).toBe("Sep 7, 2026");
  });

  it("holds across the EDT/EST boundary, where a fixed offset would not", () => {
    // Early November: EDT (-4) becomes EST (-5). Neither shifts a date-only
    // value, because it is never converted at all.
    expect(formatDateOnly(new Date("2026-11-01T00:00:00.000Z"))).toBe("Nov 1, 2026");
    expect(formatDateOnly(new Date("2026-11-02T00:00:00.000Z"))).toBe("Nov 2, 2026");
    // And at the start of DST in March.
    expect(formatDateOnly(new Date("2026-03-08T00:00:00.000Z"))).toBe("Mar 8, 2026");
  });

  it("honours a custom pattern", () => {
    expect(formatDateOnly(SCHEDULED_SEP_8, "MMddyy")).toBe("090826");
    // Matches the six-digit stamp buildInstanceName puts in the title, so a
    // row can no longer disagree with its own name.
    expect(formatDateOnly(SCHEDULED_SEP_8, "EEE d MMM")).toBe("Tue 8 Sep");
  });

  it("ymdOfDateOnly gives a groupable key", () => {
    expect(ymdOfDateOnly(SCHEDULED_SEP_8)).toBe("2026-09-08");
  });
});

describe("etYMD vs etYYYYMMDD", () => {
  it("differ only by separators, and both describe the same ET day", () => {
    const at = new Date("2026-09-08T16:00:00.000Z"); // noon ET
    expect(etYMD(at)).toBe("2026-09-08");
    expect(etYYYYMMDD(at)).toBe("20260908");
  });

  it("etYMD is the parseable one — the wizard crash of 2026-09-08", () => {
    const at = new Date("2026-09-08T16:00:00.000Z");
    expect(Number.isNaN(new Date(`${etYMD(at)}T12:00:00Z`).getTime())).toBe(false);
    expect(Number.isNaN(new Date(`${etYYYYMMDD(at)}T12:00:00Z`).getTime())).toBe(true);
  });

  it("both use the ET day, not the machine's — this box runs UTC+8", () => {
    // 9pm ET on the 8th is already the 9th in UTC and the 9th locally here.
    const lateEvening = new Date("2026-09-09T01:00:00.000Z");
    expect(etYMD(lateEvening)).toBe("2026-09-08");
  });
});
