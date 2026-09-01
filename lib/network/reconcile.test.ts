import { describe, expect, it } from "vitest";
import {
  planReArm,
  RE_ARM_CAP_PER_TICK,
  RE_ARM_TIMER_MIN,
  uncoveredOfflineDevices,
  type ReconcileDevice,
  type ReconcileStatus,
} from "./reconcile";
import { TICKET_TIMER_MIN } from "./mass-outage";

const t0 = new Date("2026-08-31T12:00:00Z");
const minutesAgo = (m: number) => new Date(t0.getTime() - m * 60_000);

function device(
  id: string,
  overrides: Partial<ReconcileDevice> = {},
): ReconcileDevice {
  return {
    deviceId: id,
    propertyId: "prop-1",
    status: "OFFLINE" as ReconcileStatus,
    openProblemEventId: `evt-${id}`,
    offlineSince: minutesAgo(60),
    ...overrides,
  };
}

function plan(input: {
  devices: ReconcileDevice[];
  ticketed?: string[];
  massOutage?: string[];
  pending?: string[];
  cap?: number;
}) {
  return planReArm({
    devices: input.devices,
    deviceIdsWithOpenTicket: input.ticketed ?? [],
    propertyIdsWithOpenMassOutage: input.massOutage ?? [],
    deviceIdsWithPendingTimer: input.pending ?? [],
    cap: input.cap,
  });
}

describe("constants", () => {
  it("re-arms with the same grace period as the normal ticket timer", () => {
    // A re-armed device must not be ticketed faster than one that just dropped,
    // or reconciliation would be harsher than detection.
    expect(RE_ARM_TIMER_MIN).toBe(TICKET_TIMER_MIN);
  });

  it("caps above the mass-outage threshold, not at it", () => {
    // The mass-outage exclusion is the storm guard; the cap only meters a
    // stranded backlog. See RE_ARM_CAP_PER_TICK's comment.
    expect(RE_ARM_CAP_PER_TICK).toBe(10);
  });
});

describe("planReArm — the core fix", () => {
  it("re-arms an offline device that nothing is tracking", () => {
    const result = plan({ devices: [device("d1")] });
    expect(result.reArm).toEqual([{ deviceId: "d1", propertyId: "prop-1", eventId: "evt-d1" }]);
  });

  it("does not re-arm a device that already has an open ticket", () => {
    const result = plan({ devices: [device("d1")], ticketed: ["d1"] });
    expect(result.reArm).toEqual([]);
  });
});

describe("guard rail — the legitimate 5-7 minute window (cause #1)", () => {
  it("skips a device whose STANDARD_TIMER is merely PENDING", () => {
    const result = plan({ devices: [device("d1")], pending: ["d1"] });
    expect(result.reArm).toEqual([]);
    expect(result.skippedPendingTimer).toBe(1);
  });

  it("still re-arms its neighbours in the same tick", () => {
    const result = plan({
      devices: [device("d1"), device("d2")],
      pending: ["d1"],
    });
    expect(result.reArm.map((r) => r.deviceId)).toEqual(["d2"]);
    expect(result.skippedPendingTimer).toBe(1);
  });
});

describe("guard rail — mass-outage rollup (cause #2)", () => {
  it("skips every offline device at a property with an open MASS_OUTAGE ticket", () => {
    const result = plan({
      devices: [
        device("d1", { propertyId: "prop-out" }),
        device("d2", { propertyId: "prop-out" }),
        device("d3", { propertyId: "prop-ok" }),
      ],
      massOutage: ["prop-out"],
    });
    expect(result.reArm.map((r) => r.deviceId)).toEqual(["d3"]);
    expect(result.skippedMassOutage).toBe(2);
  });

  it("covers monitoring-blind consoles too — they open MASS_OUTAGE tickets", () => {
    // openBlindTicket() writes ticketType MASS_OUTAGE with deviceId null. A
    // device that was already OFFLINE when its console went blind is NOT moved
    // to UNKNOWN (markDevicesUnknown skips OFFLINE rows), so without this
    // exclusion the reconciler would ticket devices nobody can currently see.
    const result = plan({
      devices: [device("d1", { propertyId: "prop-blind" })],
      massOutage: ["prop-blind"],
    });
    expect(result.reArm).toEqual([]);
  });
});

describe("guard rail — UNKNOWN devices are never touched (cause #3)", () => {
  it("ignores UNKNOWN devices even when they are otherwise uncovered", () => {
    const result = plan({
      devices: [device("d1", { status: "UNKNOWN" }), device("d2", { status: "ONLINE" })],
    });
    expect(result.reArm).toEqual([]);
    expect(result.unarmable).toEqual([]);
    // Not counted as skipped either — they are not candidates at all. A
    // monitoring-blind device is not known to be down, and ticketing it would
    // be a fabricated outage (N4).
    expect(result.skippedMassOutage).toBe(0);
    expect(result.skippedPendingTimer).toBe(0);
  });
});

describe("guard rail — idempotency", () => {
  it("running twice in a row creates one timer, not two", () => {
    const devices = [device("d1"), device("d2")];

    const first = plan({ devices });
    expect(first.reArm).toHaveLength(2);

    // Second run sees the timers the first run created.
    const second = plan({ devices, pending: first.reArm.map((r) => r.deviceId) });
    expect(second.reArm).toEqual([]);
    expect(second.skippedPendingTimer).toBe(2);
  });

  it("is a pure function of state — same input, same plan", () => {
    const devices = [device("d1"), device("d2")];
    expect(plan({ devices })).toEqual(plan({ devices }));
  });
});

describe("guard rail — the cap", () => {
  it("re-arms at most `cap` devices and reports the rest as deferred", () => {
    const devices = Array.from({ length: 25 }, (_, i) => device(`d${i}`));
    const result = plan({ devices, cap: 10 });
    expect(result.reArm).toHaveLength(10);
    expect(result.deferred).toBe(15);
  });

  it("defaults to RE_ARM_CAP_PER_TICK", () => {
    const devices = Array.from({ length: RE_ARM_CAP_PER_TICK + 3 }, (_, i) => device(`d${i}`));
    const result = plan({ devices });
    expect(result.reArm).toHaveLength(RE_ARM_CAP_PER_TICK);
    expect(result.deferred).toBe(3);
  });

  it("drains oldest-offline first, so the backlog is deterministic", () => {
    const devices = [
      device("newest", { offlineSince: minutesAgo(1) }),
      device("oldest", { offlineSince: minutesAgo(5000) }),
      device("middle", { offlineSince: minutesAgo(90) }),
    ];
    const result = plan({ devices, cap: 2 });
    expect(result.reArm.map((r) => r.deviceId)).toEqual(["oldest", "middle"]);
    expect(result.deferred).toBe(1);
  });

  it("does not let the cap hide devices behind an arbitrary reshuffle", () => {
    // Same set, different input order — the same two must be chosen.
    const a = device("a", { offlineSince: minutesAgo(10) });
    const b = device("b", { offlineSince: minutesAgo(20) });
    const c = device("c", { offlineSince: minutesAgo(30) });
    expect(plan({ devices: [a, b, c], cap: 2 }).reArm.map((r) => r.deviceId)).toEqual(["c", "b"]);
    expect(plan({ devices: [c, a, b], cap: 2 }).reArm.map((r) => r.deviceId)).toEqual(["c", "b"]);
  });
});

describe("devices with no PROBLEM event to arm against", () => {
  it("reports them instead of fabricating an event", () => {
    const result = plan({
      devices: [device("d1", { openProblemEventId: null }), device("d2")],
    });
    expect(result.reArm.map((r) => r.deviceId)).toEqual(["d2"]);
    expect(result.unarmable).toEqual(["d1"]);
  });

  it("does not count them against the cap", () => {
    const devices = [
      ...Array.from({ length: 4 }, (_, i) => device(`armable${i}`)),
      device("orphan", { openProblemEventId: null }),
    ];
    const result = plan({ devices, cap: 10 });
    expect(result.reArm).toHaveLength(4);
    expect(result.deferred).toBe(0);
    expect(result.unarmable).toEqual(["orphan"]);
  });
});

describe("uncoveredOfflineDevices — shared with the dashboard card", () => {
  it("uses the same coverage predicate the re-arm plan does", () => {
    const devices = [
      device("ticketed"),
      device("massOutage", { propertyId: "prop-out" }),
      device("unknown", { status: "UNKNOWN" }),
      device("uncovered"),
    ];
    const uncovered = uncoveredOfflineDevices({
      devices,
      deviceIdsWithOpenTicket: ["ticketed"],
      propertyIdsWithOpenMassOutage: ["prop-out"],
    });
    expect(uncovered.map((d) => d.deviceId)).toEqual(["uncovered"]);
  });

  it("still counts a device whose timer is pending — the card names the gap, it does not hide it", () => {
    // The dashboard has no view of pending timers, and that is deliberate: the
    // card is "offline with nobody owning it", and a device 3 minutes into its
    // ticket timer genuinely has no ticket yet. The banner explains that a few
    // minutes' worth is normal.
    const devices = [device("d1")];
    expect(
      uncoveredOfflineDevices({
        devices,
        deviceIdsWithOpenTicket: [],
        propertyIdsWithOpenMassOutage: [],
      }),
    ).toHaveLength(1);
    expect(plan({ devices, pending: ["d1"] }).reArm).toEqual([]);
  });

  it("returns nothing when every offline device is ticketed", () => {
    expect(
      uncoveredOfflineDevices({
        devices: [device("d1"), device("d2")],
        deviceIdsWithOpenTicket: ["d1", "d2"],
        propertyIdsWithOpenMassOutage: [],
      }),
    ).toEqual([]);
  });

  it("accepts a Set as well as an array", () => {
    expect(
      uncoveredOfflineDevices({
        devices: [device("d1")],
        deviceIdsWithOpenTicket: new Set(["d1"]),
        propertyIdsWithOpenMassOutage: new Set<string>(),
      }),
    ).toEqual([]);
  });
});

describe("the three stranding paths this closes", () => {
  it("A — a ticket resolved by hand on a device that is still down", () => {
    // The ticket is gone (not in `ticketed`), the device is still OFFLINE, and
    // its PROBLEM event is still unresolved because only a RECOVERY sets
    // resolvedByEventId. Nothing else in the system will ever look at it again.
    const result = plan({ devices: [device("d1", { openProblemEventId: "evt-old" })] });
    expect(result.reArm).toEqual([{ deviceId: "d1", propertyId: "prop-1", eventId: "evt-old" }]);
  });

  it("C — a device first seen offline whose PROBLEM ingest failed", () => {
    // Root-fixed in unifi-poll.server.ts (ingest before inventory), but rows
    // stranded before that fix have no event at all — reported, not invented.
    const result = plan({ devices: [device("d1", { openProblemEventId: null })] });
    expect(result.reArm).toEqual([]);
    expect(result.unarmable).toEqual(["d1"]);
  });

  it("D — a mass-outage child ticket that failed to be created", () => {
    // While the parent is open this device is deliberately left to the
    // mass-outage machinery (which now reschedules its own check). Once the
    // parent closes, the reconciler picks the device up.
    const devices = [device("d1", { propertyId: "prop-out" })];
    expect(plan({ devices, massOutage: ["prop-out"] }).reArm).toEqual([]);
    expect(plan({ devices }).reArm).toHaveLength(1);
  });
});
