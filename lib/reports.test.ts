import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@prisma/client";
import { summarizeCompleteness, type StatusCount } from "./reports";

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, ""); // test stub

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("summarizeCompleteness", () => {
  it("computes scheduled/completed/incomplete/pct per property+day", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.SUBMITTED, count: 3 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.REVIEWED, count: 1 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.ASSIGNED, count: 2 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.propertyId).toBe("P1");
    expect(row.scheduled).toBe(6);
    expect(row.completed).toBe(4); // SUBMITTED + REVIEWED
    expect(row.incomplete).toBe(2);
    expect(row.pct).toBe(67); // round(4/6*100)
    expect(row.withIssues).toBe(0);
  });

  it("excludes INVALIDATED/EXPIRED from the scheduled denominator", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.REVIEWED, count: 2 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.INVALIDATED, count: 5 },
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.EXPIRED, count: 1 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.scheduled).toBe(2);
    expect(row.completed).toBe(2);
    expect(row.pct).toBe(100);
  });

  it("maps withIssues by property|day key", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.SUBMITTED, count: 4 },
    ];
    const [row] = summarizeCompleteness(counts, { "P1|20260624": 2 }, ymd);
    expect(row.withIssues).toBe(2);
  });

  it("pct is 0 when nothing scheduled (no divide-by-zero)", () => {
    const counts: StatusCount[] = [
      { propertyId: "P1", scheduledFor: D("2026-06-24"), status: InstanceStatus.INVALIDATED, count: 3 },
    ];
    const [row] = summarizeCompleteness(counts, {}, ymd);
    expect(row.scheduled).toBe(0);
    expect(row.pct).toBe(0);
  });
});
