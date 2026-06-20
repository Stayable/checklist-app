import { describe, expect, it } from "vitest";
import {
  buildHumanLabel,
  buildSystemId,
  expandRooms,
  shouldGenerateOn,
  type RecurrencePattern,
} from "./recurrence";

// UTC-midnight of an ET calendar date (matches lib/datetime.etDateOnly output).
const d = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("shouldGenerateOn", () => {
  it("daily fires every day", () => {
    expect(shouldGenerateOn({ type: "daily" }, d("2026-06-20"))).toBe(true);
    expect(shouldGenerateOn({ type: "daily" }, d("2026-12-25"))).toBe(true);
  });

  it("on-demand never auto-fires", () => {
    expect(shouldGenerateOn({ type: "on-demand" }, d("2026-06-20"))).toBe(false);
  });

  it("weekly fires only on listed days of week", () => {
    // 2026-06-20 is a Saturday (6); 2026-06-22 is Monday (1).
    const mwf: RecurrencePattern = { type: "weekly", daysOfWeek: [1, 3, 5] };
    expect(shouldGenerateOn(mwf, d("2026-06-20"))).toBe(false); // Sat
    expect(shouldGenerateOn(mwf, d("2026-06-22"))).toBe(true); // Mon
    expect(shouldGenerateOn(mwf, d("2026-06-24"))).toBe(true); // Wed
    expect(shouldGenerateOn(mwf, d("2026-06-23"))).toBe(false); // Tue
  });

  it("monthly fires on the day-of-month", () => {
    const m15: RecurrencePattern = { type: "monthly", dayOfMonth: 15 };
    expect(shouldGenerateOn(m15, d("2026-06-15"))).toBe(true);
    expect(shouldGenerateOn(m15, d("2026-06-14"))).toBe(false);
  });

  it("monthly day 31 clamps to the last day of short months", () => {
    const m31: RecurrencePattern = { type: "monthly", dayOfMonth: 31 };
    expect(shouldGenerateOn(m31, d("2026-02-28"))).toBe(true); // Feb has 28 days in 2026
    expect(shouldGenerateOn(m31, d("2026-02-27"))).toBe(false);
    expect(shouldGenerateOn(m31, d("2026-04-30"))).toBe(true); // Apr has 30
    expect(shouldGenerateOn(m31, d("2026-01-31"))).toBe(true); // Jan has 31
  });

  it("quarterly fires only in Jan/Apr/Jul/Oct on the day-of-month", () => {
    const q1: RecurrencePattern = { type: "quarterly", dayOfMonth: 1 };
    expect(shouldGenerateOn(q1, d("2026-01-01"))).toBe(true);
    expect(shouldGenerateOn(q1, d("2026-04-01"))).toBe(true);
    expect(shouldGenerateOn(q1, d("2026-07-01"))).toBe(true);
    expect(shouldGenerateOn(q1, d("2026-10-01"))).toBe(true);
    expect(shouldGenerateOn(q1, d("2026-05-01"))).toBe(false); // not a quarter-start month
    expect(shouldGenerateOn(q1, d("2026-01-02"))).toBe(false); // wrong day
  });

  it("respects the effective window (inclusive bounds)", () => {
    const daily: RecurrencePattern = { type: "daily" };
    const win = { effectiveFrom: d("2026-06-10"), effectiveTo: d("2026-06-20") };
    expect(shouldGenerateOn(daily, d("2026-06-09"), win)).toBe(false);
    expect(shouldGenerateOn(daily, d("2026-06-10"), win)).toBe(true); // lower bound inclusive
    expect(shouldGenerateOn(daily, d("2026-06-20"), win)).toBe(true); // upper bound inclusive
    expect(shouldGenerateOn(daily, d("2026-06-21"), win)).toBe(false);
  });

  it("skips listed skip-days", () => {
    const daily: RecurrencePattern = { type: "daily" };
    const win = { skipDays: ["20260704"] };
    expect(shouldGenerateOn(daily, d("2026-07-04"), win)).toBe(false);
    expect(shouldGenerateOn(daily, d("2026-07-05"), win)).toBe(true);
  });
});

describe("expandRooms", () => {
  const rooms = [
    { roomNumber: "101", status: "OCCUPIED" as const },
    { roomNumber: "102", status: "VACANT" as const },
    { roomNumber: "103", status: "OOO" as const },
    { roomNumber: "210", status: "OCCUPIED" as const },
  ];

  it("all excludes OOO rooms", () => {
    expect(expandRooms(rooms, { kind: "all" }).map((r) => r.roomNumber)).toEqual([
      "101",
      "102",
      "210",
    ]);
  });

  it("occupied / vacant filter by status", () => {
    expect(expandRooms(rooms, { kind: "occupied" }).map((r) => r.roomNumber)).toEqual(["101", "210"]);
    expect(expandRooms(rooms, { kind: "vacant" }).map((r) => r.roomNumber)).toEqual(["102"]);
  });

  it("list selects explicit rooms but still excludes OOO", () => {
    expect(
      expandRooms(rooms, { kind: "list", roomNumbers: ["101", "103", "210"] }).map((r) => r.roomNumber),
    ).toEqual(["101", "210"]); // 103 is OOO → dropped
  });

  it("range selects numerically and is order-insensitive", () => {
    expect(expandRooms(rooms, { kind: "range", from: "100", to: "150" }).map((r) => r.roomNumber)).toEqual([
      "101",
      "102",
    ]);
    expect(expandRooms(rooms, { kind: "range", from: "210", to: "100" }).map((r) => r.roomNumber)).toEqual([
      "101",
      "102",
      "210",
    ]);
  });
});

describe("buildSystemId", () => {
  it("formats CL-{prop}-{code}-{ymd}-{seq} with zero-padded 3-digit seq", () => {
    expect(buildSystemId("4645", "ARR", "20260526", 12)).toBe("CL-4645-ARR-20260526-012");
    expect(buildSystemId("6802", "PWR", "20260526", 1)).toBe("CL-6802-PWR-20260526-001");
  });
});

describe("buildHumanLabel", () => {
  it("includes scope when present", () => {
    expect(
      buildHumanLabel({
        templateName: "Arrival Checklist",
        shortCode: "LL",
        scope: "Rm 312",
        dateLabel: "May 26, 2026",
      }),
    ).toBe("Arrival Checklist — LL — Rm 312 — May 26, 2026");
  });

  it("omits scope when null (property-wide instance)", () => {
    expect(
      buildHumanLabel({
        templateName: "Pressure Washing",
        shortCode: "JW",
        scope: null,
        dateLabel: "May 2026",
      }),
    ).toBe("Pressure Washing — JW — May 2026");
  });
});
