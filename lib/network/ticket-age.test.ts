import { describe, expect, it } from "vitest";
import { ticketAgeBucket, isRecurringDevice } from "./ticket-age";

// Spec §6.1 ticket-age color coding + §6.4 recurring-device threshold. Pure,
// dependency-free (mirrors lib/network/ticketing.ts's downDurationMin style).

describe("ticketAgeBucket", () => {
  const now = new Date("2026-07-25T12:00:00Z");
  const HOUR_MS = 60 * 60 * 1000;

  it("green under 1 hour", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - (HOUR_MS - 1)), now)).toBe("green");
  });

  it("amber at exactly 1 hour (boundary)", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - HOUR_MS), now)).toBe("amber");
  });

  it("amber between 1 and 4 hours", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - 2 * HOUR_MS), now)).toBe("amber");
  });

  it("amber at exactly 4 hours (boundary)", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - 4 * HOUR_MS), now)).toBe("amber");
  });

  it("red just over 4 hours", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - 4 * HOUR_MS - 1), now)).toBe("red");
  });

  it("red well over 4 hours", () => {
    expect(ticketAgeBucket(new Date(now.getTime() - 24 * HOUR_MS), now)).toBe("red");
  });
});

describe("isRecurringDevice", () => {
  it("false below the threshold", () => {
    expect(isRecurringDevice(0)).toBe(false);
    expect(isRecurringDevice(1)).toBe(false);
    expect(isRecurringDevice(2)).toBe(false);
  });

  it("true at exactly 3 (boundary)", () => {
    expect(isRecurringDevice(3)).toBe(true);
  });

  it("true above 3", () => {
    expect(isRecurringDevice(4)).toBe(true);
  });
});
