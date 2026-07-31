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
    staleSince: null,
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
 * ── Why this module paces itself (2026-07-31) ────────────────────────────────
 *
 * Kyle reported properties showing "unreachable", and a DIFFERENT set of them on
 * every refresh. Measured against the live API:
 *
 *   8 requests in parallel  → 4 × 200, 4 × 429, and every request for the next
 *                             minute also 429
 *   8 requests serially, 300ms apart → 8 × 200, repeatably
 *
 * So Spotipo rate-limits, we were tripping it on every page view, and whichever
 * 4 requests happened to win the race rendered — hence the shuffling. It was
 * never a reachability problem. The API returns **no** rate-limit headers (no
 * Retry-After, no X-RateLimit-*), so there is nothing to obey; we self-pace.
 *
 * An earlier pass at this symptom cached successes for 60s but deliberately did
 * NOT cache failures, "so a failure is retried on the next view". That made it
 * worse: the failures were the rate-limited calls, and retrying them on every
 * view is what kept the limit tripped. Reversed below — see serveStale.
 */
const REQUEST_GAP_MS = 350; // 300ms measured clean; 50ms margin
/** Guest totals move slowly; a long TTL keeps the paced fan-out rare. */
const CACHE_TTL_MS = 10 * 60_000;
/** Beyond the TTL a cached value is still shown rather than a blank, up to here. */
const STALE_MAX_MS = 60 * 60_000;

const cache = new Map<string, { at: number; value: WifiSiteSummary }>();
/** In-flight fan-out, so two concurrent renders don't double the request rate. */
let inFlight: Promise<WifiSiteSummary[]> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  /**
   * A number that was right a few minutes ago beats a blank that moves around.
   * On any failure we fall back to the last good value, marked `stale` with the
   * time it was read, and only give up once it is older than STALE_MAX_MS.
   */
  const serveStale = (error: WifiSiteSummary["error"]): WifiSiteSummary => {
    if (cached && Date.now() - cached.at < STALE_MAX_MS) {
      return { ...cached.value, error, staleSince: new Date(cached.at) };
    }
    return nullSummary(property, true, error);
  };

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
    // 429 is its own state. Calling it "unreachable" sent Kyle looking for a
    // network fault at the properties when the limit was ours to respect.
    if (res.status === 429) return serveStale("rate_limited");
    if (!res.ok) return serveStale("unreachable");

    const body: unknown = await res.json();
    const total = readTotalCount(body);

    const summary: WifiSiteSummary = {
      propertyId: property.id,
      shortCode: property.shortCode,
      configured: true,
      error: null,
      staleSince: null,
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
    return serveStale("unreachable");
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
 * SEQUENTIAL fan-out across every property, paced by REQUEST_GAP_MS.
 *
 * Deliberately not parallel: 8 concurrent requests trip Spotipo's rate limit
 * and roughly half come back 429 (see the pacing note at the top of this file).
 * Serial with a 350ms gap returns 8/8 repeatably. Cold cost is ~5s once every
 * CACHE_TTL_MS; cache hits skip the network entirely and cost nothing, so a
 * refresh is instant.
 *
 * Single-flighted: concurrent renders share one fan-out instead of doubling the
 * request rate and re-tripping the very limit this is pacing around.
 */
export async function fetchPortfolioSummaries(
  properties: WifiProperty[],
): Promise<WifiSiteSummary[]> {
  if (inFlight !== null) return inFlight;

  const run = async (): Promise<WifiSiteSummary[]> => {
    const out: WifiSiteSummary[] = [];
    for (const [i, property] of properties.entries()) {
      // Decided BEFORE the call: a successful fetch writes the cache, so asking
      // afterwards would always look like a hit and pacing would never happen.
      const entry = cache.get(property.id);
      const willHitNetwork =
        isSpotipoConfigured(property) &&
        !(entry !== undefined && Date.now() - entry.at < CACHE_TTL_MS);

      try {
        out.push(await fetchSiteSummary(property));
      } catch {
        out.push(nullSummary(property, isSpotipoConfigured(property), "unreachable"));
      }

      // Only real network calls need spacing; cache hits must not add dead time.
      if (willHitNetwork && i < properties.length - 1) await sleep(REQUEST_GAP_MS);
    }
    return out;
  };

  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
