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

function nullSummary(
  property: WifiProperty,
  configured: boolean,
  error: WifiSiteSummary["error"] = null,
): WifiSiteSummary {
  return {
    propertyId: property.id,
    shortCode: property.shortCode,
    configured,
    error,
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
const SPOTIPO_BASE = "https://api.spotipo.com";
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Registered-guest totals barely move minute to minute, and Kate saw the counts
 * shift on every refresh with some properties randomly blank — the signature of
 * 8 uncached upstream calls per page view, a few of them timing out each time.
 * A short cache makes a refresh cheap and the numbers stable.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: WifiSiteSummary }>();

/**
 * One site's guest summary from the live Spotipo API.
 *
 * ── What the API actually provides (probed against a live site 2026-07-29) ──
 * `GET /ext/{siteId}/api/v1/guest/` returns
 *   `{ metadata: { page, per_page, total_count, page_count, links }, items: [...] }`
 * where each item is a guest record: `name, email, phonenumber, newsletter,
 * consent, id, last_seen_at`.
 *
 * So:
 *  - **totalGuests** comes from `metadata.total_count`. Real, exact, one request.
 *  - **revenue** is NOT AVAILABLE. There is no revenue field on this endpoint, and
 *    /stats/, /report/, /analytics/, /transaction/, /payment/, /session/ and
 *    /voucher/ all 404. Spec §11's revenue field does not merely lack
 *    confirmation — it appears not to exist on this API surface. Stays null.
 *  - **onlineNow** is NOT AVAILABLE either. There is no online flag; deriving it
 *    from `last_seen_at` would require assuming how often Spotipo refreshes that
 *    stamp, which is a guess we would then display as a fact. Stays null.
 *  - **avgDwellMin** has no source field. Stays null.
 *
 * `per_page=1` is deliberate: we need the count from `metadata`, not the guest
 * records. Those records are PII (names, emails, phone numbers) and this feature
 * has no business reading — let alone storing — them, so we ask for the smallest
 * page the API will give us and discard `items` entirely. Nothing here persists.
 */
export async function fetchSiteSummary(property: WifiProperty): Promise<WifiSiteSummary> {
  const config = resolveSpotipoConfig(property);
  if (config === null) return nullSummary(property, false);

  const cached = cache.get(property.id);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  try {
    const res = await fetch(
      `${SPOTIPO_BASE}/ext/${encodeURIComponent(config.siteId)}/api/v1/guest/?per_page=1`,
      {
        headers: { "Authentication-Token": config.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      },
    );
    if (res.status === 401 || res.status === 403) {
      return nullSummary(property, true, "unauthorized");
    }
    if (!res.ok) return nullSummary(property, true, "unreachable");

    const body: unknown = await res.json();
    const total = readTotalCount(body);

    const summary: WifiSiteSummary = {
      propertyId: property.id,
      shortCode: property.shortCode,
      configured: true,
      error: null,
      totalGuests: total,
      onlineNow: null, // filled by lib/network/wifi-live.server.ts (UniFi)
      avgDwellMin: null,
      revenue: null, // filled by lib/network/wifi-revenue.server.ts (Stripe)
    };
    // Only successes are cached — a failure must be retried on the next view,
    // not remembered for a minute.
    cache.set(property.id, { at: Date.now(), value: summary });
    return summary;
  } catch {
    // Never throw out of the fetch seam — one site's failure must not break the
    // rest of the portfolio. Reported as `unreachable` so the UI can say so
    // instead of rendering an unexplained blank.
    return nullSummary(property, true, "unreachable");
  }
}

/** Pulls metadata.total_count defensively; null if the shape isn't what we saw. */
function readTotalCount(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const meta = (body as { metadata?: unknown }).metadata;
  if (typeof meta !== "object" || meta === null) return null;
  const total = (meta as { total_count?: unknown }).total_count;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
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
    r.status === "fulfilled"
      ? r.value
      : nullSummary(properties[i], isSpotipoConfigured(properties[i]), "unreachable"),
  );
}
