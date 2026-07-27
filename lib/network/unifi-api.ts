import type { UnifiApiDevice, UnifiApiHost, UnifiSnapshot } from "./unifi-poll";

// UniFi Site Manager cloud API client (T11, 2026-07-27).
//
// PULL, not push: Kyle's key is a Site Manager cloud key, verified reachable
// (GET /v1/hosts → 200). Polling this documented API avoids three unknowns the
// webhook path carried — unconfirmed payload shape, unconfirmed HMAC scheme,
// and no way for a vendor payload to say which RISE8 property it belongs to.
//
// Follows the established config-gate-and-degrade pattern (see
// lib/network/teams-graph.server.ts, lib/network/spotipo.server.ts): with no
// key configured this makes no network call and reports `configured: false`,
// and a transport/HTTP failure degrades to an error result instead of
// throwing. The caller (a cron route) must never 500 because a third-party
// API had a bad minute.

const API_BASE = "https://api.ui.com";
const REQUEST_TIMEOUT_MS = 15_000;

export type UnifiFetchResult =
  | { ok: true; snapshot: UnifiSnapshot }
  | { ok: false; configured: boolean; error: string };

export function isUnifiConfigured(): boolean {
  return Boolean(process.env.UNIFI_API_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getJson(path: string, apiKey: string): Promise<unknown> {
  // AbortSignal.timeout so one hung upstream request can't hold a cron
  // invocation open until the platform kills it.
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}`);
  }
  return res.json();
}

/**
 * Normalises GET /v1/hosts. The property→console mapping lives in
 * lib/network/unifi-hosts.ts, so all we need from each host is its id and its
 * cloud connection state (`reportedState.state`) — that state is what drives
 * the N4 reachability gate.
 */
export function parseHosts(payload: unknown): UnifiApiHost[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];

  return payload.data.flatMap((raw): UnifiApiHost[] => {
    if (!isRecord(raw) || typeof raw.id !== "string") return [];
    const reported = isRecord(raw.reportedState) ? raw.reportedState : {};
    return [
      {
        id: raw.id,
        state: typeof reported.state === "string" ? reported.state : undefined,
        hostname: typeof reported.hostname === "string" ? reported.hostname : undefined,
      },
    ];
  });
}

/**
 * Normalises GET /v1/devices, which returns one group per host. Devices
 * without a MAC are dropped: the MAC is our identity key, and a device we
 * can't identify stably is worse than one we ignore (it would churn rows and
 * could open a ticket per poll).
 */
export function parseDeviceGroups(payload: unknown): UnifiSnapshot["deviceGroups"] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return [];

  return payload.data.flatMap((group): UnifiSnapshot["deviceGroups"] => {
    if (!isRecord(group) || typeof group.hostId !== "string") return [];
    const rawDevices = Array.isArray(group.devices) ? group.devices : [];

    const devices = rawDevices.flatMap((raw): UnifiApiDevice[] => {
      if (!isRecord(raw) || typeof raw.mac !== "string" || raw.mac.length === 0) return [];
      return [
        {
          id: typeof raw.id === "string" ? raw.id : raw.mac,
          mac: raw.mac,
          name: typeof raw.name === "string" ? raw.name : raw.mac,
          model: typeof raw.model === "string" ? raw.model : "",
          shortname: typeof raw.shortname === "string" ? raw.shortname : undefined,
          productLine: typeof raw.productLine === "string" ? raw.productLine : undefined,
          status: typeof raw.status === "string" ? raw.status : undefined,
          isConsole: typeof raw.isConsole === "boolean" ? raw.isConsole : undefined,
        },
      ];
    });

    return [{ hostId: group.hostId, devices }];
  });
}

/** Fetches one full snapshot (hosts + devices). Never throws. */
export async function fetchUnifiSnapshot(): Promise<UnifiFetchResult> {
  const apiKey = process.env.UNIFI_API_KEY;
  if (!apiKey) {
    return { ok: false, configured: false, error: "unifi_not_configured" };
  }

  try {
    const [hostsPayload, devicesPayload] = await Promise.all([
      getJson("/v1/hosts", apiKey),
      getJson("/v1/devices", apiKey),
    ]);

    return {
      ok: true,
      snapshot: {
        hosts: parseHosts(hostsPayload),
        deviceGroups: parseDeviceGroups(devicesPayload),
      },
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "unifi_fetch_failed",
    };
  }
}
