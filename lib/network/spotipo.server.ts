import type { Property } from "@prisma/client";
import type { WifiSiteSummary } from "./spotipo";

// Guest WiFi (Spotipo) fetch seam: SCAFFOLD + DEGRADE (Task 9, Kyle
// 2026-07-25 — no Spotipo siteids/API keys, no confirmed response shape).
// Mirrors the Task 7 Teams-config-gate degradation story
// (lib/network/teams-graph.server.ts): whether or not a property is
// configured, this never throws and never makes a real network call — a
// per-site failure degrades to a null summary so one bad/unconfigured site
// can never break the portfolio view. lib/network/spotipo.ts owns the real,
// testable aggregation over whatever summaries come back.
//
// Key handling: Property.spotipoApiKey is read as-is (plaintext column,
// nullable). At-rest encryption for this key is an OPEN decision (D6,
// schema comment in prisma/schema.prisma) — deliberately NOT built here;
// this task is scaffold-only.

export type WifiProperty = Pick<
  Property,
  "id" | "shortCode" | "spotipoSiteId" | "spotipoApiKey"
>;

/** True iff this property has both a Spotipo site id and an API key set. */
export function isSpotipoConfigured(
  property: Pick<Property, "spotipoSiteId" | "spotipoApiKey">,
): boolean {
  return Boolean(property.spotipoSiteId && property.spotipoApiKey);
}

function nullSummary(property: WifiProperty, configured: boolean): WifiSiteSummary {
  return {
    propertyId: property.id,
    shortCode: property.shortCode,
    configured,
    totalGuests: null,
    onlineNow: null,
    avgDwellMin: null,
    revenue: null,
  };
}

/**
 * One property's Guest WiFi summary. Never throws.
 *  - **not configured** (today's reality for every property — no
 *    spotipoSiteId/spotipoApiKey) → `configured: false`, all-null, no
 *    network call at all.
 *  - **configured** → this is the FUTURE real-fetch seam:
 *      GET https://api.spotipo.com/ext/{spotipoSiteId}/api/v1/guest/
 *      header: Authentication-Token: <spotipoApiKey>
 *    parse totalGuests/onlineNow/avgDwellMin from the response; the revenue
 *    field name is UNCONFIRMED per spec §11 — confirm with Spotipo support
 *    before wiring it, do not guess a field name. Until that lands, a
 *    configured site still returns `configured: true` with an all-null
 *    summary so the UI can tell "configured, no data yet" apart from "not
 *    configured at all". A future real-fetch failure (network error, 4xx,
 *    unexpected shape) must degrade the same way — hence the try/catch below
 *    even though nothing can throw yet.
 */
export async function fetchSiteSummary(property: WifiProperty): Promise<WifiSiteSummary> {
  if (!isSpotipoConfigured(property)) return nullSummary(property, false);

  try {
    // FUTURE (Spotipo creds task): real GET + field parsing goes here. No
    // HTTP client call exists yet — see the doc comment above.
    return nullSummary(property, true);
  } catch {
    // Never throw out of the fetch seam — a single site's failure must not
    // break the rest of the portfolio.
    return nullSummary(property, true);
  }
}

/**
 * Parallel fan-out across every configured (or not) property. Uses
 * `Promise.allSettled` so the shape/parallelism is correct for when real
 * creds land and a real site can genuinely reject; `fetchSiteSummary` itself
 * never throws today, but a rejected settlement is still degraded to a null
 * summary rather than failing the whole call.
 */
export async function fetchPortfolioSummaries(
  properties: WifiProperty[],
): Promise<WifiSiteSummary[]> {
  const results = await Promise.allSettled(properties.map((p) => fetchSiteSummary(p)));
  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : nullSummary(properties[i], isSpotipoConfigured(properties[i])),
  );
}
