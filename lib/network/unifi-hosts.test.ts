import { describe, expect, it } from "vitest";
import {
  UNIFI_HOST_REGISTRY,
  findHostEntry,
  hostsForProperty,
  isMonitoredHost,
  monitoredHosts,
  type UnifiHostEntry,
} from "./unifi-hosts";

const fixture: UnifiHostEntry[] = [
  { hostId: "live-a", label: "A", propertyRef: "5399", monitored: true },
  { hostId: "live-b", label: "B", propertyRef: "5399", monitored: true },
  { hostId: "dead", label: "Dead", propertyRef: "6802", monitored: false },
  { hostId: "orphan", label: "Hosting", propertyRef: null, monitored: true },
];

describe("monitoredHosts", () => {
  it("keeps only opted-in hosts that map to a property", () => {
    expect(monitoredHosts(fixture).map((h) => h.hostId)).toEqual(["live-a", "live-b"]);
  });

  it("excludes decommissioned consoles (N2)", () => {
    expect(monitoredHosts(fixture).some((h) => h.hostId === "dead")).toBe(false);
  });

  it("excludes monitored hosts with no property, so they can't be ingested", () => {
    expect(monitoredHosts(fixture).some((h) => h.hostId === "orphan")).toBe(false);
  });
});

describe("hostsForProperty", () => {
  it("returns every console for a property (N3: one-to-many)", () => {
    expect(hostsForProperty("5399", fixture).map((h) => h.hostId)).toEqual(["live-a", "live-b"]);
  });

  it("returns an empty list for an unmapped property", () => {
    expect(hostsForProperty("4645", fixture)).toEqual([]);
  });
});

describe("isMonitoredHost", () => {
  it("accepts a registered, opted-in, property-mapped host", () => {
    expect(isMonitoredHost("live-a", fixture)).toBe(true);
  });

  it("rejects a registered but excluded host", () => {
    expect(isMonitoredHost("dead", fixture)).toBe(false);
  });

  it("rejects an unknown host — monitoring is opt-in, never implicit", () => {
    expect(isMonitoredHost("brand-new-console", fixture)).toBe(false);
  });
});

describe("findHostEntry", () => {
  it("returns null rather than throwing for an unknown host", () => {
    expect(findHostEntry("nope", fixture)).toBeNull();
  });
});

describe("the real registry", () => {
  it("monitors exactly the Kissimmee West pilot console today", () => {
    const live = monitoredHosts();
    expect(live).toHaveLength(1);
    expect(live[0]?.propertyRef).toBe("5399");
    expect(live[0]?.label).toBe("SS-KISSWEST");
  });

  it("has no duplicate host ids", () => {
    const ids = UNIFI_HOST_REGISTRY.map((h) => h.hostId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents a reason for every excluded console", () => {
    for (const entry of UNIFI_HOST_REGISTRY.filter((h) => !h.monitored)) {
      expect(entry.note, `${entry.label} needs a note explaining the exclusion`).toBeTruthy();
    }
  });
});
