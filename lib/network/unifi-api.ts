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
  | {
      ok: true;
      snapshot: UnifiSnapshot;
      keysUsed: number;
      keysFailed: number;
      /** Fabrics whose key errored this poll — named, so a dead key is diagnosable. */
      fabricsFailed: UnifiFabric[];
    }
  | { ok: false; configured: boolean; error: string };

/**
 * The Site Manager "fabrics" the estate's consoles are split across.
 *
 * MULTIPLE ACCOUNTS (2026-07-29, renamed 2026-07-31): the 19 consoles are not
 * visible to any single Ubiquiti account — finding N1. Ubiquiti organises them
 * into three fabrics (Stayable Central / Independent Sites / North), each with
 * its own API key, so a key per fabric is the vendor's own structure rather than
 * a workaround. Keys are named after the fabric instead of numbered
 * (`UNIFI_API_KEY_2`) because a number says nothing about which sites went dark
 * when one key is revoked.
 */
export const UNIFI_FABRICS = ["CENTRAL", "INDEPENDENT", "NORTH"] as const;
export type UnifiFabric = (typeof UNIFI_FABRICS)[number];

export type UnifiApiKey = { fabric: UnifiFabric; key: string };

/** Env var name carrying a fabric's key. */
export function unifiKeyEnvName(fabric: UnifiFabric): string {
  return `UNIFI_API_KEY_${fabric}`;
}

/**
 * Every configured API key with the fabric it belongs to, in declaration order.
 * A fabric with no key set is simply absent — the poller degrades per-fabric.
 */
export function unifiApiKeys(env: Record<string, string | undefined> = process.env): UnifiApiKey[] {
  const keys: UnifiApiKey[] = [];
  for (const fabric of UNIFI_FABRICS) {
    const raw = env[unifiKeyEnvName(fabric)];
    const key = typeof raw === "string" ? raw.trim() : "";
    // De-duplicate: the same key pasted into two fabrics would otherwise double
    // every request and every host, for no benefit.
    if (key.length > 0 && !keys.some((k) => k.key === key)) keys.push({ fabric, key });
  }
  return keys;
}

export function isUnifiConfigured(): boolean {
  return unifiApiKeys().length > 0;
}

/**
 * Merges per-account snapshots into one.
 *
 * A console can legitimately appear under two accounts (one owns it, another was
 * invited), so hosts are de-duplicated by id. For devices, the group with MORE
 * devices wins: an invited account often sees a partial or stale inventory, and
 * between two views of the same console the fuller one is the better evidence.
 * Taking "first wins" instead would let whichever key happened to be listed first
 * hide devices the other account can see.
 */
export function mergeSnapshots(snapshots: UnifiSnapshot[]): UnifiSnapshot {
  const hostById = new Map<string, UnifiApiHost>();
  for (const snap of snapshots) {
    for (const host of snap.hosts) {
      const existing = hostById.get(host.id);
      // Prefer an entry that actually carries a state over one that doesn't.
      if (existing === undefined || (existing.state === undefined && host.state !== undefined)) {
        hostById.set(host.id, host);
      }
    }
  }

  const groupByHost = new Map<string, UnifiSnapshot["deviceGroups"][number]>();
  for (const snap of snapshots) {
    for (const group of snap.deviceGroups) {
      const existing = groupByHost.get(group.hostId);
      if (existing === undefined || group.devices.length > existing.devices.length) {
        groupByHost.set(group.hostId, group);
      }
    }
  }

  return { hosts: [...hostById.values()], deviceGroups: [...groupByHost.values()] };
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
  const keys = unifiApiKeys();
  if (keys.length === 0) {
    return { ok: false, configured: false, error: "unifi_not_configured" };
  }

  const perKey = await Promise.all(
    keys.map(async ({ fabric, key }): Promise<UnifiSnapshot | { fabric: UnifiFabric; error: string }> => {
      try {
        const [hostsPayload, devicesPayload] = await Promise.all([
          getJson("/v1/hosts", key),
          getJson("/v1/devices", key),
        ]);
        return {
          hosts: parseHosts(hostsPayload),
          deviceGroups: parseDeviceGroups(devicesPayload),
        };
      } catch (error) {
        return { fabric, error: error instanceof Error ? error.message : "unifi_fetch_failed" };
      }
    }),
  );

  const good = perKey.filter((r): r is UnifiSnapshot => !("error" in r));
  const failed = perKey.filter((r): r is { fabric: UnifiFabric; error: string } => "error" in r);

  // One bad key must not blind us to the fabrics that DID answer — a revoked or
  // mistyped key would otherwise take the whole fleet's monitoring down with it.
  // Only a total failure is reported as a failure.
  if (good.length === 0) {
    return {
      ok: false,
      configured: true,
      error: failed[0] ? `${failed[0].fabric}: ${failed[0].error}` : "unifi_fetch_failed",
    };
  }

  return {
    ok: true,
    snapshot: mergeSnapshots(good),
    keysUsed: keys.length,
    keysFailed: failed.length,
    fabricsFailed: failed.map((f) => f.fabric),
  };
}
