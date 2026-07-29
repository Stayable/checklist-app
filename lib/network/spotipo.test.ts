import { describe, expect, it } from "vitest";
import { aggregateWifiPortfolio, type WifiSiteSummary } from "./spotipo";

// Spec §11 Guest WiFi aggregation. Exercises the aggregation contract directly
// with hand-built summaries (configured / unconfigured / partial-null mixes)
// rather than a live fetch. Guest totals are real since 2026-07-29; onlineNow
// now comes from UniFi and revenue from Stripe, so partial-null mixes remain
// the normal case and are what these tests pin down.

function site(overrides: Partial<WifiSiteSummary>): WifiSiteSummary {
  return {
    propertyId: "prop-1",
    shortCode: "LL",
    configured: false,
    error: null,
    totalGuests: null,
    onlineNow: null,
    avgDwellMin: null,
    revenue: null,
    ...overrides,
  };
}

describe("aggregateWifiPortfolio", () => {
  it("all-unconfigured portfolio: zeros, null dwell/revenue, configuredCount 0", () => {
    const sites = [
      site({ propertyId: "p1", shortCode: "LL" }),
      site({ propertyId: "p2", shortCode: "JN" }),
    ];
    expect(aggregateWifiPortfolio(sites)).toEqual({
      totalGuests: 0,
      onlineNow: 0,
      avgDwellMin: null,
      revenue: null,
      configuredCount: 0,
      totalCount: 2,
    });
  });

  it("sums totalGuests/onlineNow across configured sites, skipping null", () => {
    const sites = [
      site({ propertyId: "p1", configured: true, totalGuests: 10, onlineNow: 3 }),
      site({ propertyId: "p2", configured: true, totalGuests: 5, onlineNow: 1 }),
      site({ propertyId: "p3", configured: false }), // null, contributes 0
    ];
    const result = aggregateWifiPortfolio(sites);
    expect(result.totalGuests).toBe(15);
    expect(result.onlineNow).toBe(4);
    expect(result.configuredCount).toBe(2);
    expect(result.totalCount).toBe(3);
  });

  it("avgDwellMin is the mean of non-null dwell values, ignoring nulls", () => {
    const sites = [
      site({ propertyId: "p1", configured: true, avgDwellMin: 30 }),
      site({ propertyId: "p2", configured: true, avgDwellMin: 90 }),
      site({ propertyId: "p3", configured: false, avgDwellMin: null }),
    ];
    expect(aggregateWifiPortfolio(sites).avgDwellMin).toBe(60);
  });

  it("avgDwellMin is null when every site's dwell is null", () => {
    const sites = [site({ configured: true }), site({ configured: true })];
    expect(aggregateWifiPortfolio(sites).avgDwellMin).toBeNull();
  });

  it("revenue sums non-null values and is null when all revenue is null/unconfirmed", () => {
    const allNull = [site({ configured: true }), site({ configured: true })];
    expect(aggregateWifiPortfolio(allNull).revenue).toBeNull();

    const mixed = [
      site({ propertyId: "p1", configured: true, revenue: 100 }),
      site({ propertyId: "p2", configured: true, revenue: 50 }),
      site({ propertyId: "p3", configured: false, revenue: null }),
    ];
    expect(aggregateWifiPortfolio(mixed).revenue).toBe(150);
  });

  it("empty site list aggregates to all zeros/nulls", () => {
    expect(aggregateWifiPortfolio([])).toEqual({
      totalGuests: 0,
      onlineNow: 0,
      avgDwellMin: null,
      revenue: null,
      configuredCount: 0,
      totalCount: 0,
    });
  });
});
