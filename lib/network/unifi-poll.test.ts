import { describe, expect, it } from "vitest";
import type { UnifiHostEntry } from "./unifi-hosts";
import {
  classifyDeviceSource,
  classifyDeviceType,
  decidePoll,
  deviceKeyFor,
  isHostConnected,
  type KnownDeviceState,
  type UnifiApiDevice,
  type UnifiSnapshot,
} from "./unifi-poll";

const NOW = new Date("2026-07-27T18:00:00.000Z");

const KW: UnifiHostEntry = {
  hostId: "host-kw",
  label: "SS-KISSWEST",
  propertyRef: "5399",
  monitored: true,
};

function device(overrides: Partial<UnifiApiDevice> & { mac: string }): UnifiApiDevice {
  return {
    id: overrides.mac,
    name: "some device",
    model: "USW Pro 24 PoE",
    status: "online",
    ...overrides,
  };
}

function snapshot(state: string, devices: UnifiApiDevice[]): UnifiSnapshot {
  return {
    hosts: [{ id: KW.hostId, state, hostname: KW.label }],
    deviceGroups: [{ hostId: KW.hostId, devices }],
  };
}

describe("deviceKeyFor", () => {
  it("keys on the MAC, upper-cased, so renames don't fork the device", () => {
    expect(deviceKeyFor("245a4c9fc9f1", "5399")).toBe("245A4C9FC9F1_5399");
  });
});

describe("classifyDeviceType", () => {
  it.each([
    ["USW Pro 24 PoE", "SWITCH"],
    ["USW Flex Mini", "SWITCH"],
    ["UDM Pro", "GATEWAY"],
    ["UCG Ultra", "GATEWAY"],
    ["UCK G2 Plus", "GATEWAY"],
    ["USG 3P", "GATEWAY"],
    ["UNVR Pro", "NVR"],
    ["AC Pro", "AP"],
    ["AC IW", "AP"],
  ])("maps %s to %s", (model, expected) => {
    expect(classifyDeviceType(device({ mac: "AA", model }))).toBe(expected);
  });

  it("treats an isConsole device as a gateway even with an odd model", () => {
    expect(classifyDeviceType(device({ mac: "AA", model: "Official Hosting", isConsole: true }))).toBe(
      "GATEWAY",
    );
  });

  it("classifies protect-line gear as a camera", () => {
    expect(classifyDeviceType(device({ mac: "AA", model: "G5 Bullet", productLine: "protect" }))).toBe(
      "CAMERA",
    );
  });

  it("falls back to SWITCH for unrecognised gear, not to a phantom AP", () => {
    expect(classifyDeviceType(device({ mac: "AA", model: "Mystery Box 9000" }))).toBe("SWITCH");
  });
});

describe("classifyDeviceSource", () => {
  it("routes cameras and recorders to UNIFI_PROTECT", () => {
    expect(classifyDeviceSource(device({ mac: "AA", model: "UNVR Pro" }))).toBe("UNIFI_PROTECT");
  });

  it("routes switches and APs to UNIFI_NETWORK", () => {
    expect(classifyDeviceSource(device({ mac: "AA", model: "AC Pro" }))).toBe("UNIFI_NETWORK");
  });
});

describe("isHostConnected", () => {
  it("is true only for the connected state", () => {
    expect(isHostConnected({ id: "h", state: "connected" })).toBe(true);
    expect(isHostConnected({ id: "h", state: "Connected" })).toBe(true);
    expect(isHostConnected({ id: "h", state: "disconnected" })).toBe(false);
    expect(isHostConnected({ id: "h" })).toBe(false);
    expect(isHostConnected(undefined)).toBe(false);
  });
});

describe("decidePoll — reachability gate (N4)", () => {
  const twelveDevices = Array.from({ length: 12 }, (_, i) =>
    device({ mac: `AA${i}`, name: `dev-${i}`, status: "offline" }),
  );

  it("emits NO events when the console is disconnected, even with every device offline", () => {
    const decision = decidePoll({
      snapshot: snapshot("disconnected", twelveDevices),
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toEqual([]);
    expect(decision.blindHosts).toHaveLength(1);
    expect(decision.blindHosts[0]).toMatchObject({ reason: "disconnected", propertyRef: "5399" });
    expect(decision.unknownDeviceKeys).toHaveLength(12);
    expect(decision.healthyHostIds).toEqual([]);
  });

  it("does not record inventory from an untrusted console", () => {
    const decision = decidePoll({
      snapshot: snapshot("disconnected", twelveDevices),
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.observedDevices).toEqual([]);
  });

  it("treats a host missing from the API as blind, not as healthy", () => {
    const decision = decidePoll({
      snapshot: { hosts: [], deviceGroups: [] },
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.blindHosts[0]).toMatchObject({ reason: "absent", state: null });
    expect(decision.events).toEqual([]);
  });

  it("reports a connected console as healthy so its blind ticket can clear", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1" })]),
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.healthyHostIds).toEqual([KW.hostId]);
    expect(decision.blindHosts).toEqual([]);
  });
});

describe("decidePoll — transitions only", () => {
  const known = (status: KnownDeviceState["currentStatus"]): KnownDeviceState[] => [
    { deviceKey: "AA1_5399", currentStatus: status },
  ];

  it("emits PROBLEM when a known-online device goes offline", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1", name: "SW-FD", status: "offline" })]),
      known: known("ONLINE"),
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]).toMatchObject({
      eventType: "PROBLEM",
      deviceIdent: "AA1",
      deviceName: "SW-FD",
      propertyRef: "5399",
      occurredAt: NOW,
    });
  });

  it("emits RECOVERY when an offline device comes back", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1", status: "online" })]),
      known: known("OFFLINE"),
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events[0]).toMatchObject({ eventType: "RECOVERY", alertMessage: null });
  });

  it("emits RECOVERY when an UNKNOWN device is confirmed up", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1", status: "online" })]),
      known: known("UNKNOWN"),
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events[0]?.eventType).toBe("RECOVERY");
  });

  it("emits nothing for a device that was and still is offline", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1", status: "offline" })]),
      known: known("OFFLINE"),
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toEqual([]);
  });

  it("emits nothing for a device that was and still is online", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1", status: "online" })]),
      known: known("ONLINE"),
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toEqual([]);
  });

  it("records a never-seen online device without raising an event", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "NEW1", name: "new switch" })]),
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toEqual([]);
    expect(decision.observedDevices).toHaveLength(1);
    expect(decision.observedDevices[0]).toMatchObject({
      deviceKey: "NEW1_5399",
      status: "ONLINE",
      type: "SWITCH",
    });
  });

  it("does raise PROBLEM for a never-seen device that is already offline", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "NEW1", status: "offline" })]),
      known: [],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events[0]?.eventType).toBe("PROBLEM");
  });

  it("stamps every event in a tick with the same time, so mass-outage clusters", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [
        device({ mac: "AA1", status: "offline" }),
        device({ mac: "AA2", status: "offline" }),
        device({ mac: "AA3", status: "offline" }),
      ]),
      known: [
        { deviceKey: "AA1_5399", currentStatus: "ONLINE" },
        { deviceKey: "AA2_5399", currentStatus: "ONLINE" },
        { deviceKey: "AA3_5399", currentStatus: "ONLINE" },
      ],
      monitored: [KW],
      now: NOW,
    });

    expect(decision.events).toHaveLength(3);
    expect(new Set(decision.events.map((e) => e.occurredAt.getTime())).size).toBe(1);
  });

  it("ignores devices belonging to unmonitored hosts entirely", () => {
    const decision = decidePoll({
      snapshot: {
        hosts: [
          { id: KW.hostId, state: "connected" },
          { id: "host-legacy", state: "disconnected" },
        ],
        deviceGroups: [
          { hostId: KW.hostId, devices: [device({ mac: "AA1" })] },
          {
            hostId: "host-legacy",
            devices: Array.from({ length: 48 }, (_, i) =>
              device({ mac: `LEG${i}`, status: "offline" }),
            ),
          },
        ],
      },
      known: [],
      monitored: [KW], // legacy host is not registered as monitored
      now: NOW,
    });

    expect(decision.events).toEqual([]);
    expect(decision.blindHosts).toEqual([]);
    expect(decision.unknownDeviceKeys).toEqual([]);
    expect(decision.observedDevices).toHaveLength(1);
  });
});

// --- Two consoles, one device (2026-07-31) ----------------------------------
//
// Regression cover for the Orlando flap: 44 cameras re-homed from Orlando-NVR
// to Orlando-NVR2 were listed by BOTH recorders at the same property with
// opposite statuses. One event per sighting made the verdict alternate every
// tick — 704 PROBLEM/RECOVERY events in 40 minutes for cameras that were up.

const OR_OLD: UnifiHostEntry = {
  hostId: "host-or-nvr1",
  label: "Orlando-NVR",
  propertyRef: "8700",
  monitored: true,
};
const OR_NEW: UnifiHostEntry = {
  hostId: "host-or-nvr2",
  label: "Orlando-NVR2",
  propertyRef: "8700",
  monitored: true,
};

/** The same MAC under both recorders: stale-offline on the old, live on the new. */
function twoConsoleSnapshot(oldStatus: string, newStatus: string): UnifiSnapshot {
  return {
    hosts: [
      { id: OR_OLD.hostId, state: "connected", hostname: OR_OLD.label },
      { id: OR_NEW.hostId, state: "connected", hostname: OR_NEW.label },
    ],
    deviceGroups: [
      { hostId: OR_OLD.hostId, devices: [device({ mac: "CAM1", name: "G5 Bullet", status: oldStatus })] },
      { hostId: OR_NEW.hostId, devices: [device({ mac: "CAM1", name: "B2-RM2204", status: newStatus })] },
    ],
  };
}

describe("decidePoll — one device reported by two consoles", () => {
  it("records the device once, not once per console", () => {
    const decision = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.observedDevices).toHaveLength(1);
  });

  it("ONLINE wins — a stale recorder cannot report a live camera as down", () => {
    const decision = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.observedDevices[0]?.status).toBe("ONLINE");
    // First sighting while ONLINE emits nothing (no RECOVERY from nothing).
    expect(decision.events).toEqual([]);
  });

  it("wins regardless of console order in the registry", () => {
    const forward = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    const reversed = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [],
      monitored: [OR_NEW, OR_OLD],
      now: NOW,
    });
    expect(forward.observedDevices[0]?.status).toBe(reversed.observedDevices[0]?.status);
    expect(forward.observedDevices[0]?.consoleHostId).toBe(OR_NEW.hostId);
    expect(reversed.observedDevices[0]?.consoleHostId).toBe(OR_NEW.hostId);
  });

  it("takes the live console's name, not the stale generic model name", () => {
    const decision = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.observedDevices[0]?.name).toBe("B2-RM2204");
  });

  it("does NOT flap: a device already ONLINE emits nothing on the next tick", () => {
    const decision = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "online"),
      known: [{ deviceKey: "CAM1_8700", currentStatus: "ONLINE" }],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.events).toEqual([]);
  });

  it("still reports OFFLINE when BOTH consoles agree it is down", () => {
    const decision = decidePoll({
      snapshot: twoConsoleSnapshot("offline", "offline"),
      known: [{ deviceKey: "CAM1_8700", currentStatus: "ONLINE" }],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.observedDevices[0]?.status).toBe("OFFLINE");
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]?.eventType).toBe("PROBLEM");
  });

  it("attributes the device to the console that reports it", () => {
    const decision = decidePoll({
      snapshot: snapshot("connected", [device({ mac: "AA1" })]),
      known: [],
      monitored: [KW],
      now: NOW,
    });
    expect(decision.observedDevices[0]?.consoleHostId).toBe(KW.hostId);
  });

  it("a blind console cannot force UNKNOWN on a device a healthy console can see", () => {
    const decision = decidePoll({
      snapshot: {
        hosts: [
          { id: OR_OLD.hostId, state: "disconnected", hostname: OR_OLD.label },
          { id: OR_NEW.hostId, state: "connected", hostname: OR_NEW.label },
        ],
        deviceGroups: [
          { hostId: OR_OLD.hostId, devices: [device({ mac: "CAM1", status: "offline" })] },
          { hostId: OR_NEW.hostId, devices: [device({ mac: "CAM1", status: "online" })] },
        ],
      },
      known: [],
      monitored: [OR_OLD, OR_NEW],
      now: NOW,
    });
    expect(decision.blindHosts).toHaveLength(1);
    expect(decision.unknownDeviceKeys).toEqual([]); // seen for real by NVR2
    expect(decision.observedDevices[0]?.status).toBe("ONLINE");
  });
});
