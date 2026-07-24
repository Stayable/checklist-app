import { describe, expect, it } from "vitest";
import {
  countWithinWindow,
  isMassOutage,
  MASS_OUTAGE_CHECK_MIN,
  MASS_OUTAGE_THRESHOLD,
  MASS_OUTAGE_WINDOW_SEC,
  TICKET_TIMER_MIN,
} from "./mass-outage";

const now = new Date("2026-07-25T12:00:00Z");
const secondsAgo = (s: number) => new Date(now.getTime() - s * 1000);

describe("constants", () => {
  it("match the spec values", () => {
    expect(MASS_OUTAGE_THRESHOLD).toBe(5);
    expect(MASS_OUTAGE_WINDOW_SEC).toBe(120);
    expect(TICKET_TIMER_MIN).toBe(5);
    expect(MASS_OUTAGE_CHECK_MIN).toBe(10);
  });
});

describe("countWithinWindow", () => {
  it("counts timestamps within the window inclusive of the boundary", () => {
    const times = [secondsAgo(0), secondsAgo(60), secondsAgo(119), secondsAgo(120)];
    expect(countWithinWindow(times, now)).toBe(4);
  });

  it("excludes timestamps older than the window", () => {
    const times = [secondsAgo(0), secondsAgo(60), secondsAgo(121)];
    expect(countWithinWindow(times, now)).toBe(2);
  });

  it("ignores future timestamps", () => {
    const future = new Date(now.getTime() + 5000);
    expect(countWithinWindow([future, secondsAgo(0)], now)).toBe(1);
  });

  it("respects a custom window", () => {
    const times = [secondsAgo(10), secondsAgo(40)];
    expect(countWithinWindow(times, now, 30)).toBe(1);
  });
});

describe("isMassOutage", () => {
  it("is false with 4 devices within the window", () => {
    const times = [secondsAgo(0), secondsAgo(30), secondsAgo(60), secondsAgo(90)];
    expect(isMassOutage(times, now)).toBe(false);
  });

  it("is true with 5 devices within the window", () => {
    const times = [secondsAgo(0), secondsAgo(30), secondsAgo(60), secondsAgo(90), secondsAgo(119)];
    expect(isMassOutage(times, now)).toBe(true);
  });

  it("is false when 5 are present but one is 121s old (only 4 count)", () => {
    const times = [secondsAgo(0), secondsAgo(30), secondsAgo(60), secondsAgo(90), secondsAgo(121)];
    expect(isMassOutage(times, now)).toBe(false);
  });

  it("counts a timestamp exactly 120s old (true at 5)", () => {
    const times = [secondsAgo(0), secondsAgo(30), secondsAgo(60), secondsAgo(90), secondsAgo(120)];
    expect(isMassOutage(times, now)).toBe(true);
  });

  it("ignores a future timestamp when evaluating the threshold", () => {
    const future = new Date(now.getTime() + 5000);
    const times = [secondsAgo(0), secondsAgo(30), secondsAgo(60), secondsAgo(90), future];
    expect(isMassOutage(times, now)).toBe(false);
  });
});
