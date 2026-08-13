import { describe, expect, it } from "vitest";
import {
  allChildrenResolved,
  countWithinWindow,
  isMassOutage,
  MASS_OUTAGE_CHECK_MIN,
  MASS_OUTAGE_THRESHOLD,
  MASS_OUTAGE_WINDOW_SEC,
  partitionRecovery,
  TICKET_TIMER_MIN,
  type AffectedDevice,
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

function device(overrides: Partial<AffectedDevice> = {}): AffectedDevice {
  return {
    deviceId: "d1",
    deviceName: "Cam 1",
    status: "offline",
    recoveredAt: null,
    ...overrides,
  };
}

describe("partitionRecovery", () => {
  it("marks recovered devices and preserves offline ones (empty recoveredIds -> all offline)", () => {
    const affected = [device({ deviceId: "d1" }), device({ deviceId: "d2" })];
    const { updated, recovered, stillOffline } = partitionRecovery(affected, new Set(), now);
    expect(updated).toEqual(affected);
    expect(recovered).toEqual([]);
    expect(stillOffline).toEqual(affected);
  });

  it("marks every device recovered when all ids are in recoveredIds", () => {
    const affected = [device({ deviceId: "d1" }), device({ deviceId: "d2" })];
    const { updated, recovered, stillOffline } = partitionRecovery(
      affected,
      new Set(["d1", "d2"]),
      now,
    );
    expect(stillOffline).toEqual([]);
    expect(recovered).toHaveLength(2);
    expect(updated.every((d) => d.status === "recovered")).toBe(true);
    expect(updated.every((d) => d.recoveredAt === now.toISOString())).toBe(true);
  });

  it("splits mixed recovered/offline devices", () => {
    const affected = [device({ deviceId: "d1" }), device({ deviceId: "d2" })];
    const { updated, recovered, stillOffline } = partitionRecovery(
      affected,
      new Set(["d1"]),
      now,
    );
    expect(recovered.map((d) => d.deviceId)).toEqual(["d1"]);
    expect(stillOffline.map((d) => d.deviceId)).toEqual(["d2"]);
    expect(updated.find((d) => d.deviceId === "d1")?.status).toBe("recovered");
    expect(updated.find((d) => d.deviceId === "d2")?.status).toBe("offline");
  });

  // Regression: every recovery used to be stamped `now` — the moment the
  // 10-minute check ran — so the derived down-duration measured the cron's own
  // latency, not the outage, and always came out ~10-11 min.
  it("stamps the device's real recovery time when one is known", () => {
    const realRecovery = new Date(now.getTime() - 7 * 60_000);
    const affected = [device({ deviceId: "d1" }), device({ deviceId: "d2" })];
    const { updated } = partitionRecovery(
      affected,
      new Set(["d1", "d2"]),
      now,
      new Map([["d1", realRecovery]]),
    );
    expect(updated.find((d) => d.deviceId === "d1")?.recoveredAt).toBe(realRecovery.toISOString());
    // d2 has no recovery event on record — `now` is the best upper bound left.
    expect(updated.find((d) => d.deviceId === "d2")?.recoveredAt).toBe(now.toISOString());
  });

  it("preserves an already-recovered entry's earlier recoveredAt instead of overwriting with now", () => {
    const earlier = new Date(now.getTime() - 60_000).toISOString();
    const affected = [device({ deviceId: "d1", status: "recovered", recoveredAt: earlier })];
    const { updated, recovered } = partitionRecovery(affected, new Set(["d1"]), now);
    expect(recovered[0].recoveredAt).toBe(earlier);
    expect(updated[0].recoveredAt).toBe(earlier);
  });
});

describe("allChildrenResolved", () => {
  it("is true when every child is RESOLVED or CLOSED", () => {
    expect(allChildrenResolved(["RESOLVED", "CLOSED", "RESOLVED"])).toBe(true);
  });

  it("is false when at least one child is still open", () => {
    expect(allChildrenResolved(["RESOLVED", "IN_PROGRESS"])).toBe(false);
    expect(allChildrenResolved(["OPEN"])).toBe(false);
  });

  it("is false for an empty list (no children yet -> nothing to cascade-close on)", () => {
    expect(allChildrenResolved([])).toBe(false);
  });
});
