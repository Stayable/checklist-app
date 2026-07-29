import { describe, expect, it } from "vitest";
import { decideTimerAction, downDurationMin } from "./ticketing";

describe("decideTimerAction", () => {
  it("SKIP_ALREADY_TICKETED when a ticket is already open, regardless of resolution", () => {
    expect(
      decideTimerAction({ hasOpenTicket: true, problemResolved: false }),
    ).toBe("SKIP_ALREADY_TICKETED");
    expect(
      decideTimerAction({ hasOpenTicket: true, problemResolved: true }),
    ).toBe("SKIP_ALREADY_TICKETED");
  });

  it("SKIP_SELF_RESOLVED when no open ticket but the problem already recovered", () => {
    expect(
      decideTimerAction({ hasOpenTicket: false, problemResolved: true }),
    ).toBe("SKIP_SELF_RESOLVED");
  });

  it("CREATE_TICKET when no open ticket and the problem is still unresolved", () => {
    expect(
      decideTimerAction({ hasOpenTicket: false, problemResolved: false }),
    ).toBe("CREATE_TICKET");
  });
});

describe("downDurationMin", () => {
  const problemReceivedAt = new Date("2026-07-25T12:00:00Z");

  it("rounds 7m30s up to 8", () => {
    const resolvedAt = new Date(problemReceivedAt.getTime() + 7 * 60_000 + 30_000);
    expect(downDurationMin(problemReceivedAt, resolvedAt)).toBe(8);
  });

  it("rounds 7m20s down to 7", () => {
    const resolvedAt = new Date(problemReceivedAt.getTime() + 7 * 60_000 + 20_000);
    expect(downDurationMin(problemReceivedAt, resolvedAt)).toBe(7);
  });

  it("is exact whole minutes with no rounding needed", () => {
    const resolvedAt = new Date(problemReceivedAt.getTime() + 5 * 60_000);
    expect(downDurationMin(problemReceivedAt, resolvedAt)).toBe(5);
  });

  it("never returns negative even if resolvedAt precedes problemReceivedAt (clock skew)", () => {
    const resolvedAt = new Date(problemReceivedAt.getTime() - 60_000);
    expect(downDurationMin(problemReceivedAt, resolvedAt)).toBe(0);
  });

  it("is zero when resolved at the same instant", () => {
    expect(downDurationMin(problemReceivedAt, problemReceivedAt)).toBe(0);
  });
});
