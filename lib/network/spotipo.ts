/**
 * Pure aggregation for the Guest WiFi (Spotipo) subsection (spec §11).
 * SCAFFOLD + DEGRADE (Task 9, Kyle 2026-07-25) — this is the real, testable
 * logic; the HTTP fetch that fills in per-site values is the degraded seam
 * in lib/network/spotipo.server.ts (no Spotipo siteids/API keys exist yet).
 * Kept dependency-free like lib/network/ticketing.ts so it unit-tests
 * cleanly without touching the DB or the network.
 */

export type WifiSiteSummary = {
  propertyId: string;
  shortCode: string;
  configured: boolean;
  /**
   * Why this site has no numbers. null = fine. Set when a configured site
   * FAILED — previously a failure and "configured but empty" both rendered as
   * blanks, which is the bug Kate hit: some properties silently unfilled with
   * no way to tell whether it was broken or just quiet.
   */
  error: "unreachable" | "unauthorized" | null;
  totalGuests: number | null;
  onlineNow: number | null;
  avgDwellMin: number | null;
  /**
   * Always null. Probed against the live API 2026-07-29: there is no revenue
   * field on the guest endpoint, and /stats/, /report/, /analytics/,
   * /transaction/, /payment/, /session/ and /voucher/ all 404. Spec §11's
   * revenue figure does not merely lack confirmation — it is not exposed by this
   * API. Kept in the type so the UI can say "not available" rather than silently
   * omitting a number Kate asked for.
   */
  revenue: number | null;
};

export type WifiPortfolioSummary = {
  totalGuests: number;
  onlineNow: number;
  avgDwellMin: number | null;
  revenue: number | null;
  configuredCount: number;
  totalCount: number;
};

/**
 * Sums totalGuests/onlineNow across all sites (null values are skipped, not
 * zero-filled into the count of contributing sites); avgDwellMin is the mean
 * of the non-null dwell values (null if none); revenue is the sum of the
 * non-null revenue values (null if none — including the all-unconfirmed
 * case, since every site's revenue is null until §11 is resolved).
 */
export function aggregateWifiPortfolio(sites: WifiSiteSummary[]): WifiPortfolioSummary {
  let totalGuests = 0;
  let onlineNow = 0;
  let configuredCount = 0;
  const dwellValues: number[] = [];
  const revenueValues: number[] = [];

  for (const site of sites) {
    if (site.configured) configuredCount++;
    if (site.totalGuests !== null) totalGuests += site.totalGuests;
    if (site.onlineNow !== null) onlineNow += site.onlineNow;
    if (site.avgDwellMin !== null) dwellValues.push(site.avgDwellMin);
    if (site.revenue !== null) revenueValues.push(site.revenue);
  }

  return {
    totalGuests,
    onlineNow,
    avgDwellMin:
      dwellValues.length === 0
        ? null
        : dwellValues.reduce((sum, v) => sum + v, 0) / dwellValues.length,
    revenue: revenueValues.length === 0 ? null : revenueValues.reduce((sum, v) => sum + v, 0),
    configuredCount,
    totalCount: sites.length,
  };
}
