import { describe, expect, it } from "vitest";
import { parseDeviceGroups, parseHosts } from "./unifi-api";

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
