import { describe, expect, it } from "vitest";
import { ESCALATION_THRESHOLD_HOURS, escalationLevel, isOvernight } from "./escalation";

// Spec §9 display-only escalation + overnight tagging. Both drive no
// notifications in v1 (escalation threshold is a documented placeholder,
// like the SLA defaults) — pure, dependency-free like lib/network/ticket-age.ts.

describe("isOvernight", () => {
  // 2026-07-25 is EDT (UTC-4): 22:00 ET == 2026-07-26T02:00:00Z.
  it("false just before the overnight window (21:59 ET)", () => {
    expect(isOvernight(new Date("2026-07-26T01:59:00Z"))).toBe(false);
  });

  it("true at the start of the overnight window (22:00 ET, boundary)", () => {
    expect(isOvernight(new Date("2026-07-26T02:00:00Z"))).toBe(true);
  });

  it("true just before the end of the overnight window (07:59 ET)", () => {
    expect(isOvernight(new Date("2026-07-25T11:59:00Z"))).toBe(true);
  });

  it("false at the end of the overnight window (08:00 ET, boundary)", () => {
    expect(isOvernight(new Date("2026-07-25T12:00:00Z"))).toBe(false);
  });

  it("derives the hour in ET, not UTC (UTC hour is daytime but ET hour is overnight)", () => {
    // 2026-07-25T10:30:00Z is 10:30 UTC (daytime by a naive UTC-hour check)
    // but 06:30 EDT — overnight in ET. Proves the ET conversion is real.
    expect(isOvernight(new Date("2026-07-25T10:30:00Z"))).toBe(true);
  });

  it("EDT (summer) case: 23:00 ET is overnight", () => {
    // 2026-07-25 is EDT (UTC-4): 23:00 ET == 2026-07-26T03:00:00Z.
    expect(isOvernight(new Date("2026-07-26T03:00:00Z"))).toBe(true);
  });

  it("EST (winter) case: 22:00 ET is overnight", () => {
    // 2026-01-15 is EST (UTC-5): 22:00 ET == 2026-01-16T03:00:00Z.
    expect(isOvernight(new Date("2026-01-16T03:00:00Z"))).toBe(true);
  });

  it("EST (winter) case: 21:59 ET is not overnight", () => {
    expect(isOvernight(new Date("2026-01-16T02:59:00Z"))).toBe(false);
  });
});

describe("escalationLevel", () => {
  const openedAt = new Date("2026-07-25T12:00:00Z");
  const HOUR_MS = 60 * 60 * 1000;

  it("NONE just under the threshold", () => {
    const now = new Date(openedAt.getTime() + ESCALATION_THRESHOLD_HOURS * HOUR_MS - 1);
    expect(escalationLevel({ openedAt, now, status: "OPEN" })).toBe("NONE");
  });

  it("NONE exactly at the threshold (boundary — strictly greater-than required)", () => {
    const now = new Date(openedAt.getTime() + ESCALATION_THRESHOLD_HOURS * HOUR_MS);
    expect(escalationLevel({ openedAt, now, status: "OPEN" })).toBe("NONE");
  });

  it("ESCALATED just over the threshold", () => {
    const now = new Date(openedAt.getTime() + ESCALATION_THRESHOLD_HOURS * HOUR_MS + 1);
    expect(escalationLevel({ openedAt, now, status: "OPEN" })).toBe("ESCALATED");
  });

  it("ESCALATED for IN_PROGRESS past the threshold too", () => {
    const now = new Date(openedAt.getTime() + 5 * HOUR_MS);
    expect(escalationLevel({ openedAt, now, status: "IN_PROGRESS" })).toBe("ESCALATED");
  });

  it("RESOLVED is NONE regardless of age", () => {
    const now = new Date(openedAt.getTime() + 30 * 24 * HOUR_MS);
    expect(escalationLevel({ openedAt, now, status: "RESOLVED" })).toBe("NONE");
  });

  it("CLOSED is NONE regardless of age", () => {
    const now = new Date(openedAt.getTime() + 30 * 24 * HOUR_MS);
    expect(escalationLevel({ openedAt, now, status: "CLOSED" })).toBe("NONE");
  });
});
