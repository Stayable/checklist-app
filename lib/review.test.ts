import { describe, expect, it } from "vitest";
import { IssuePriority } from "@prisma/client";
import {
  SLA_PLACEHOLDER_HOURS,
  formatMinutes,
  isSlaBreached,
  slaTargetAt,
  timeToCompleteMinutes,
} from "./review";

const T0 = new Date("2026-06-02T10:00:00.000Z");
const hoursLater = (h: number) => new Date(T0.getTime() + h * 3_600_000);

describe("slaTargetAt", () => {
  it("uses placeholder hours when no overrides given", () => {
    expect(slaTargetAt(T0, IssuePriority.URGENT)).toEqual(hoursLater(4));
    expect(slaTargetAt(T0, IssuePriority.HIGH)).toEqual(hoursLater(24));
    expect(slaTargetAt(T0, IssuePriority.MEDIUM)).toEqual(hoursLater(72));
    expect(slaTargetAt(T0, IssuePriority.LOW)).toEqual(hoursLater(168));
  });

  it("prefers configured hours over placeholders", () => {
    expect(slaTargetAt(T0, IssuePriority.HIGH, { HIGH: 8 })).toEqual(hoursLater(8));
  });

  it("falls back per-priority when overrides are partial", () => {
    expect(slaTargetAt(T0, IssuePriority.LOW, { HIGH: 8 })).toEqual(hoursLater(168));
  });
});

describe("timeToCompleteMinutes", () => {
  it("rounds to whole minutes", () => {
    expect(timeToCompleteMinutes(T0, new Date(T0.getTime() + 90_000))).toBe(2);
  });

  it("returns null when either timestamp is missing", () => {
    expect(timeToCompleteMinutes(null, T0)).toBeNull();
    expect(timeToCompleteMinutes(T0, null)).toBeNull();
  });

  it("clamps negative durations (clock skew) to 0", () => {
    expect(timeToCompleteMinutes(hoursLater(1), T0)).toBe(0);
  });
});

describe("formatMinutes", () => {
  it("formats sub-hour, hour+, and missing values", () => {
    expect(formatMinutes(null)).toBe("—");
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(59)).toBe("59m");
    expect(formatMinutes(65)).toBe("1h 05m");
    expect(formatMinutes(180)).toBe("3h 00m");
  });
});

describe("isSlaBreached", () => {
  it("breaches only when unresolved past target", () => {
    expect(isSlaBreached(hoursLater(4), null, hoursLater(5))).toBe(true);
    expect(isSlaBreached(hoursLater(4), null, hoursLater(3))).toBe(false);
  });

  it("resolved or target-less issues never breach", () => {
    expect(isSlaBreached(hoursLater(4), hoursLater(2), hoursLater(5))).toBe(false);
    expect(isSlaBreached(null, null, hoursLater(99))).toBe(false);
  });

  it("placeholder table covers all four priorities", () => {
    expect(Object.keys(SLA_PLACEHOLDER_HOURS)).toHaveLength(4);
  });
});
