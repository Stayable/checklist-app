import type { Property } from "@prisma/client";
import type { WifiSiteSummary } from "./spotipo";
import { isSpotipoConfiguredFor, resolveSpotipoConfig } from "./spotipo-config";

// Guest WiFi (Spotipo) fetch seam: SCAFFOLD + DEGRADE (Task 9, Kyle
// 2026-07-25 — no Spotipo siteids/API keys, no confirmed response shape).
// Mirrors the Task 7 Teams-config-gate degradation story
// (lib/network/teams-graph.server.ts): whether or not a property is
// configured, this never throws and never makes a real network call — a
// per-site failure degrades to a null summary so one bad/unconfigured site
// can never break the portfolio view. lib/network/spotipo.ts owns the real,
// testable aggregation over whatever summaries come back.
//
// Key handling (revised 2026-07-29): credentials now resolve ENV-FIRST via
// lib/network/spotipo-config.ts, with the Property columns as a fallback. That
// closes open decision D6 for the normal path — an env var keeps the key out of
// the database, and therefore out of backups, query logs and any Property read
// — without needing at-rest column encryption.

export type WifiProperty = Pick<
  Property,
  "id" | "shortCode" | "spotipoSiteId" | "spotipoApiKey"
>;

/**
 * True iff this property resolves to a full Spotipo config.
 *
 * Delegates to lib/network/spotipo-config.ts, which reads env-first (so the key
 * lives in Vercel rather than a plaintext database column) and falls back to the
 * legacy Property columns.
 */
export function isSpotipoConfigured(property: WifiProperty): boolean {
  return isSpotipoConfiguredFor(property);
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
  const config = resolveSpotipoConfig(property);
  if (config === null) return nullSummary(property, false);

  try {
    // FUTURE (Spotipo creds task): the real GET + field parsing goes here, using
    // `config.siteId` / `config.apiKey`. Still not implemented: the endpoint and
    // response shape in the doc comment above are from the DevSpec and remain
    // UNVERIFIED against the live API, and the revenue field name is explicitly
    // unconfirmed. Writing a parser against a guessed shape would produce
    // plausible wrong numbers on an ops dashboard, which is worse than blanks —
    // so this waits for one real captured response.
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
