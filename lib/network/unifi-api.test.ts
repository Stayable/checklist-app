import { describe, expect, it } from "vitest";
import { mergeSnapshots, parseDeviceGroups, parseHosts, unifiApiKeys } from "./unifi-api";

// Fixtures below are trimmed from a real 2026-07-27 Site Manager response.

describe("parseHosts", () => {
  it("lifts the cloud connection state out of reportedState", () => {
    const hosts = parseHosts({
      data: [
        { id: "host-a", reportedState: { state: "connected", hostname: "SS-KISSWEST" } },
        { id: "host-b", reportedState: { state: "disconnected", hostname: "SS-JAXWEST" } },
      ],
    });

    expect(hosts).toEqual([
      { id: "host-a", state: "connected", hostname: "SS-KISSWEST" },
      { id: "host-b", state: "disconnected", hostname: "SS-JAXWEST" },
    ]);
  });

  it("leaves state undefined when absent, so the gate treats it as untrusted", () => {
    const hosts = parseHosts({ data: [{ id: "host-a", reportedState: {} }] });
    expect(hosts[0]?.state).toBeUndefined();
  });

  it("drops entries with no id instead of inventing one", () => {
    expect(parseHosts({ data: [{ reportedState: { state: "connected" } }] })).toEqual([]);
  });

  it("returns an empty list for malformed payloads rather than throwing", () => {
    expect(parseHosts(null)).toEqual([]);
    expect(parseHosts({})).toEqual([]);
    expect(parseHosts({ data: "nope" })).toEqual([]);
  });
});

describe("parseDeviceGroups", () => {
  it("normalises a host's device list", () => {
    const groups = parseDeviceGroups({
      data: [
        {
          hostId: "host-a",
          hostName: "SS-KISSWEST",
          devices: [
            {
              id: "245A4C9FC9F1",
              mac: "245A4C9FC9F1",
              name: "SS-KW-SW04 RM134",
              model: "USW Pro 24 PoE",
              shortname: "US24PRO",
              productLine: "network",
              status: "online",
              isConsole: false,
            },
          ],
        },
      ],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.hostId).toBe("host-a");
    expect(groups[0]?.devices[0]).toMatchObject({
      mac: "245A4C9FC9F1",
      name: "SS-KW-SW04 RM134",
      model: "USW Pro 24 PoE",
      status: "online",
      isConsole: false,
    });
  });

  it("drops devices with no MAC — identity has to be stable", () => {
    const groups = parseDeviceGroups({
      data: [{ hostId: "host-a", devices: [{ name: "ghost", model: "USW" }, { mac: "AA", name: "real" }] }],
    });

    expect(groups[0]?.devices.map((d) => d.mac)).toEqual(["AA"]);
  });

  it("falls back to the MAC when a device has no name", () => {
    const groups = parseDeviceGroups({ data: [{ hostId: "h", devices: [{ mac: "BB" }] }] });
    expect(groups[0]?.devices[0]?.name).toBe("BB");
  });

  it("keeps a host group with an empty device list", () => {
    expect(parseDeviceGroups({ data: [{ hostId: "h", devices: [] }] })).toEqual([
      { hostId: "h", devices: [] },
    ]);
  });

  it("survives malformed payloads", () => {
    expect(parseDeviceGroups(undefined)).toEqual([]);
    expect(parseDeviceGroups({ data: [{ devices: [] }] })).toEqual([]);
  });
});

// --- Multi-account support (2026-07-29) --------------------------------------

describe("unifiApiKeys", () => {
  it("returns nothing when no key is set", () => {
    expect(unifiApiKeys({})).toEqual([]);
  });

  it("reads the primary key", () => {
    expect(unifiApiKeys({ UNIFI_API_KEY: "a" })).toEqual(["a"]);
  });

  it("reads numbered keys in order after the primary", () => {
    expect(
      unifiApiKeys({ UNIFI_API_KEY: "a", UNIFI_API_KEY_2: "b", UNIFI_API_KEY_3: "c" }),
    ).toEqual(["a", "b", "c"]);
  });

  it("works when only a numbered key is set", () => {
    expect(unifiApiKeys({ UNIFI_API_KEY_2: "b" })).toEqual(["b"]);
  });

  it("de-duplicates the same key pasted twice", () => {
    expect(unifiApiKeys({ UNIFI_API_KEY: "a", UNIFI_API_KEY_2: "a" })).toEqual(["a"]);
  });

  it("ignores empty and whitespace-only values, and trims", () => {
    expect(unifiApiKeys({ UNIFI_API_KEY: "  a  ", UNIFI_API_KEY_2: "   " })).toEqual(["a"]);
  });

  it("stops at 9 — a typo'd UNIFI_API_KEY_10 is not silently honoured", () => {
    expect(unifiApiKeys({ UNIFI_API_KEY_10: "ten" })).toEqual([]);
  });
});

describe("mergeSnapshots", () => {
  const host = (id: string, state?: string) => ({ id, state, hostname: id });
  const dev = (mac: string) => ({ id: mac, mac, name: mac, model: "USW", status: "online" });

  it("unions hosts from two accounts", () => {
    const merged = mergeSnapshots([
      { hosts: [host("a", "connected")], deviceGroups: [] },
      { hosts: [host("b", "connected")], deviceGroups: [] },
    ]);
    expect(merged.hosts.map((h) => h.id).sort()).toEqual(["a", "b"]);
  });

  it("de-duplicates a console visible under both accounts", () => {
    const merged = mergeSnapshots([
      { hosts: [host("a", "connected")], deviceGroups: [] },
      { hosts: [host("a", "connected")], deviceGroups: [] },
    ]);
    expect(merged.hosts).toHaveLength(1);
  });

  it("prefers a host entry that carries a state over one that does not", () => {
    const merged = mergeSnapshots([
      { hosts: [host("a", undefined)], deviceGroups: [] },
      { hosts: [host("a", "connected")], deviceGroups: [] },
    ]);
    expect(merged.hosts[0]?.state).toBe("connected");
  });

  it("keeps the FULLER device list when both accounts see the same console", () => {
    const merged = mergeSnapshots([
      { hosts: [], deviceGroups: [{ hostId: "a", devices: [dev("AA")] }] },
      { hosts: [], deviceGroups: [{ hostId: "a", devices: [dev("AA"), dev("BB"), dev("CC")] }] },
    ]);
    expect(merged.deviceGroups).toHaveLength(1);
    expect(merged.deviceGroups[0]?.devices).toHaveLength(3);
  });

  it("does not let a first, emptier view hide devices the second account sees", () => {
    const merged = mergeSnapshots([
      { hosts: [], deviceGroups: [{ hostId: "a", devices: [] }] },
      { hosts: [], deviceGroups: [{ hostId: "a", devices: [dev("AA")] }] },
    ]);
    expect(merged.deviceGroups[0]?.devices).toHaveLength(1);
  });

  it("handles an empty input list", () => {
    expect(mergeSnapshots([])).toEqual({ hosts: [], deviceGroups: [] });
  });
});
