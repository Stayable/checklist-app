import { describe, expect, it } from "vitest";
import { formatTicketNumber } from "./ticket-number";

describe("formatTicketNumber", () => {
  it("zero-pads seq to a minimum of 3 digits", () => {
    const date = new Date("2026-07-25T12:00:00Z"); // safely mid-day ET
    expect(formatTicketNumber(date, 1)).toBe("TKT-20260725-001");
    expect(formatTicketNumber(date, 42)).toBe("TKT-20260725-042");
    expect(formatTicketNumber(date, 100)).toBe("TKT-20260725-100");
  });

  it("does not truncate seq beyond 3 digits", () => {
    const date = new Date("2026-07-25T12:00:00Z");
    expect(formatTicketNumber(date, 1000)).toBe("TKT-20260725-1000");
  });

  it("uses the ET calendar date, not the UTC date", () => {
    // 2026-07-25T03:30:00Z is 2026-07-24 23:30 ET (EDT, UTC-4) — previous ET day.
    const date = new Date("2026-07-25T03:30:00Z");
    expect(formatTicketNumber(date, 1)).toBe("TKT-20260724-001");
  });

  it("handles a summer (EDT) date correctly", () => {
    // 2026-07-04T12:00:00Z -> 08:00 ET (EDT, UTC-4) -> same ET calendar day.
    const date = new Date("2026-07-04T12:00:00Z");
    expect(formatTicketNumber(date, 5)).toBe("TKT-20260704-005");
  });

  it("handles a winter (EST) date correctly", () => {
    // 2026-01-15T12:00:00Z -> 07:00 ET (EST, UTC-5) -> same ET calendar day.
    const date = new Date("2026-01-15T12:00:00Z");
    expect(formatTicketNumber(date, 5)).toBe("TKT-20260115-005");
  });
});
