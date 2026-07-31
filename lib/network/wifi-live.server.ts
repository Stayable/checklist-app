import { unifiApiKeys } from "./unifi-api";
import { findHostEntry } from "./unifi-hosts";

// Live client counts per property, from UniFi's own site statistics (2026-07-29).
//
// WHY THIS EXISTS: the WiFi page's "online now" was always null, because Spotipo
// does not expose it — probed exhaustively, its entire API surface is
// /api/v1/guest/ and every other path 404s. But Kate is right that real online
// devices exist, and UniFi already knows: GET /v1/sites returns
// `statistics.counts` per site with wifiClient / guestClient / wiredClient.
//
// That is a better source anyway. It is the network itself reporting who is
// actually connected right now, rather than a captive-portal's registration
// count — which is what Spotipo's total_count really measures.

const API_BASE = "https://api.ui.com";
const REQUEST_TIMEOUT_MS = 15_000;
/** Client counts move constantly; a short cache stops every page refresh from
 *  re-hitting the API once per configured key. */
const CACHE_TTL_MS = 60_000;

export type LiveClients = {
  /** Portal/guest-network clients right now. */
  guestClients: number;
  /** WiFi clients right now (all SSIDs the console reports). */
  wifiClients: number;
  wiredClients: number;
};

type CacheEntry = { at: number; value: Map<string, LiveClients> };
let cache: CacheEntry | null = null;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Live client counts keyed by `Property.propertyId`, summed across every
 * monitored console at that property.
 *
 * Summing is correct here: a property's Network console and its Protect NVR are
 * different sites, and a guest connected at the property is counted by whichever
 * console serves them. Unmonitored consoles are excluded via the same registry
 * that gates polling, so a stale view can't inflate a live number.
 *
 * Never throws. On total failure the map is empty and callers render "—" rather
 * than a fabricated zero.
 */
export async function fetchLiveClientsByProperty(
  now: number = Date.now(),
): Promise<Map<string, LiveClients>> {
  if (cache !== null && now - cache.at < CACHE_TTL_MS) return cache.value;

  const keys = unifiApiKeys();
  const byProperty = new Map<string, LiveClients>();

  for (const { key } of keys) {
    try {
      const res = await fetch(`${API_BASE}/v1/sites`, {
        headers: { "X-API-KEY": key, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.data)) continue;

      for (const raw of body.data) {
        if (!isRecord(raw) || typeof raw.hostId !== "string") continue;
        // Only registered, monitored consoles count — same gate as polling.
        const entry = findHostEntry(raw.hostId);
        if (entry === null || !entry.monitored || entry.propertyRef === null) continue;

        const stats = isRecord(raw.statistics) ? raw.statistics : {};
        const counts = isRecord(stats.counts) ? stats.counts : {};

        const prev = byProperty.get(entry.propertyRef) ?? {
          guestClients: 0,
          wifiClients: 0,
          wiredClients: 0,
        };
        byProperty.set(entry.propertyRef, {
          guestClients: prev.guestClients + num(counts.guestClient),
          wifiClients: prev.wifiClients + num(counts.wifiClient),
          wiredClients: prev.wiredClients + num(counts.wiredClient),
        });
      }
    } catch {
      // One key failing must not blank the properties the other key covers.
    }
  }

  cache = { at: now, value: byProperty };
  return byProperty;
}

/** Test seam — the module-level cache would otherwise leak between tests. */
export function __clearLiveClientsCache(): void {
  cache = null;
}
