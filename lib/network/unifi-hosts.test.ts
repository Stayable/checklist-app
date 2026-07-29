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
  it("monitors the five properties whose consoles are reachable", () => {
    const live = monitoredHosts();
    const props = [...new Set(live.map((h) => h.propertyRef))].sort();
    // Lexicographic sort, so "44199" precedes "4645".
    // KE 2295 · DP 44199 · LL 4645 · KW 5399 · OR 8700
    expect(props).toEqual(["2295", "44199", "4645", "5399", "8700"]);
    expect(live).toHaveLength(10);
  });

  it("does NOT monitor Jacksonville West or North — no key reaches them (N1)", () => {
    const live = monitoredHosts().map((h) => h.propertyRef);
    expect(live).not.toContain("6802"); // JW
    expect(live).not.toContain("812"); // JN
  });

  it("keeps the stale Orlando view excluded while monitoring the live one", () => {
    const orlando = hostsForProperty("8700");
    const monitored = orlando.filter((h) => h.monitored);
    const excluded = orlando.filter((h) => !h.monitored);
    expect(monitored.length).toBe(3); // network + 2 NVRs
    expect(excluded.length).toBe(1); // the stale-view duplicate
    // Same physical console: the ids share their MAC-derived prefix.
    const livePrefix = monitored.find((h) => h.label.includes("live"))?.hostId.split(":")[0];
    expect(excluded[0]?.hostId.split(":")[0]).toBe(livePrefix);
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
