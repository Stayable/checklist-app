import type { DeviceSource, DeviceType, NetworkEventType } from "@prisma/client";
import type { UnifiHostEntry } from "./unifi-hosts";

// Pure decision layer for the UniFi poller (T11, 2026-07-27). No I/O, no
// Prisma — everything here is a function of (API snapshot, known device
// state, registry) so the rules that matter can be tested directly.
//
// The rule that matters most is the reachability gate (N4). The Site Manager
// cloud API reports every device under a cloud-disconnected console as
// `offline`. That is STALE DATA, not an outage: against the current key,
// three legacy consoles would have contributed ~63 devices all claiming to be
// down, and a naive status→PROBLEM mapping would have opened ~63 tickets on
// the first tick. So:
//
//   console connected     → trust device status, emit PROBLEM/RECOVERY on
//                           transitions only
//   console NOT connected → trust nothing; devices become UNKNOWN (never
//                           OFFLINE) and the property raises ONE
//                           "monitoring blind" condition
//
// UNKNOWN is deliberate: it is visibly not-green in the UI, so a blind
// console can never be mistaken for a healthy one, and it emits no events, so
// it can never open a ticket.

/** One device as returned by GET /v1/devices (the fields we rely on). */
export type UnifiApiDevice = {
  id: string;
  mac: string;
  name: string;
  model: string;
  shortname?: string;
  productLine?: string;
  status?: string;
  isConsole?: boolean;
};

/** One host as returned by GET /v1/hosts (the fields we rely on). */
export type UnifiApiHost = {
  id: string;
  /** reportedState.state — "connected" | "disconnected" | ... */
  state?: string;
  hostname?: string;
};

export type UnifiSnapshot = {
  hosts: UnifiApiHost[];
  /** Devices grouped by host, as /v1/devices returns them. */
  deviceGroups: { hostId: string; devices: UnifiApiDevice[] }[];
};

/** What we already believe about a device, keyed by `deviceKey`. */
export type KnownDeviceState = {
  deviceKey: string;
  currentStatus: "ONLINE" | "OFFLINE" | "UNKNOWN";
};

/** An event the poller wants ingested. Shape mirrors ParsedWebhook. */
export type PolledEvent = {
  deviceIdent: string; // MAC — stable across renames
  deviceName: string;
  propertyRef: string;
  eventType: NetworkEventType;
  source: DeviceSource;
  deviceType: DeviceType;
  alertMessage: string | null;
  occurredAt: Date;
};

export type BlindHost = {
  hostId: string;
  label: string;
  propertyRef: string;
  /** "disconnected" when the API says so, "absent" when the host is missing. */
  reason: "disconnected" | "absent";
  state: string | null;
};

/**
 * A device seen under a connected console this tick. Emitted for EVERY such
 * device, transition or not, so the server layer can upsert inventory rows.
 *
 * Without this, a device that is simply up would never reach the database:
 * events only fire on transitions, and Device rows are only created by event
 * ingestion, so a healthy fleet would render as an empty dashboard. Inventory
 * and events are genuinely different concerns — this is inventory.
 */
export type ObservedDevice = {
  deviceKey: string;
  deviceIdent: string;
  name: string;
  propertyRef: string;
  type: DeviceType;
  source: DeviceSource;
  status: "ONLINE" | "OFFLINE";
};

export type PollDecision = {
  events: PolledEvent[];
  observedDevices: ObservedDevice[];
  blindHosts: BlindHost[];
  /** Device keys to force to UNKNOWN because their console can't be trusted. */
  unknownDeviceKeys: string[];
  /** Hosts whose console is connected — their "monitoring blind" clears. */
  healthyHostIds: string[];
};

const CONNECTED_STATE = "connected";

/**
 * Device identity is the MAC, not the name. UniFi names are edited freely by
 * whoever is in the controller that day ("AP-RM122" → "AP Room 122"); keying
 * on the name would strand the old row OFFLINE forever and open a ticket for
 * a device that never went down.
 */
export function deviceKeyFor(mac: string, propertyRef: string): string {
  return `${mac.toUpperCase()}_${propertyRef}`;
}

/**
 * Classifies a UniFi device into our DeviceType. Model prefixes are the
 * reliable signal; `productLine` and `isConsole` disambiguate the rest.
 * Unrecognised gear falls back to SWITCH rather than AP — a mislabelled
 * switch is less misleading in an ops dashboard than a phantom access point,
 * and both are still monitored identically.
 */
export function classifyDeviceType(device: UnifiApiDevice): DeviceType {
  const model = (device.model ?? "").toUpperCase();
  const short = (device.shortname ?? "").toUpperCase();
  const line = (device.productLine ?? "").toLowerCase();
  const haystack = `${model} ${short}`;

  if (/\bUNVR\b|NETWORK VIDEO RECORDER/.test(haystack)) return "NVR";
  if (line === "protect" || /\bUVC\b|\bG[3-6]\b|CAMERA|DOORBELL/.test(haystack)) return "CAMERA";
  if (device.isConsole === true) return "GATEWAY";
  if (/\bUDM\b|\bUCG\b|\bUCK\b|\bUSG\b|\bUXG\b|DREAM MACHINE|CLOUD GATEWAY|CLOUD KEY/.test(haystack))
    return "GATEWAY";
  if (/\bUSW\b|\bUS-?\d|SWITCH|FLEX MINI/.test(haystack)) return "SWITCH";
  if (/\bUAP\b|\bU[6-7]\b|\bAC\b|ACCESS POINT|\bIW\b|\bLR\b|\bAP\b/.test(haystack)) return "AP";
  return "SWITCH";
}

/** Protect gear reports under UNIFI_PROTECT; everything else is Network. */
export function classifyDeviceSource(device: UnifiApiDevice): DeviceSource {
  const type = classifyDeviceType(device);
  return type === "CAMERA" || type === "NVR" ? "UNIFI_PROTECT" : "UNIFI_NETWORK";
}

export function isHostConnected(host: UnifiApiHost | undefined): boolean {
  return (host?.state ?? "").toLowerCase() === CONNECTED_STATE;
}

/**
 * Turns one API snapshot into the work the server layer should do.
 *
 * `occurredAt` is passed in (the poll timestamp) rather than read from the
 * clock: a poller has no per-event vendor timestamp to trust, and every
 * device discovered in the same tick sharing one timestamp is what makes
 * mass-outage clustering work — the 120s window sees them as one cluster.
 *
 * Events are emitted on TRANSITIONS ONLY. A device that was OFFLINE and is
 * still offline emits nothing; re-emitting every tick would spam duplicate
 * events and re-arm ticket timers forever. A device we have never seen is
 * recorded silently when online (no RECOVERY from nothing) but does emit
 * PROBLEM when first seen offline — that is a genuine "it is down right now"
 * we should act on.
 */
export function decidePoll(input: {
  snapshot: UnifiSnapshot;
  known: KnownDeviceState[];
  monitored: UnifiHostEntry[];
  now: Date;
}): PollDecision {
  const { snapshot, known, monitored, now } = input;

  const knownByKey = new Map(known.map((k) => [k.deviceKey, k.currentStatus]));
  const hostById = new Map(snapshot.hosts.map((h) => [h.id, h]));
  const devicesByHost = new Map(snapshot.deviceGroups.map((g) => [g.hostId, g.devices]));

  const events: PolledEvent[] = [];
  const observedDevices: ObservedDevice[] = [];
  const blindHosts: BlindHost[] = [];
  const unknownDeviceKeys: string[] = [];
  const healthyHostIds: string[] = [];

  for (const entry of monitored) {
    const propertyRef = entry.propertyRef;
    if (propertyRef === null) continue; // monitoredHosts() already filters these

    const host = hostById.get(entry.hostId);
    const devices = devicesByHost.get(entry.hostId) ?? [];

    // N4 — the gate. Absent from the API is treated exactly like
    // disconnected: in both cases we have no trustworthy present-tense view.
    if (host === undefined || !isHostConnected(host)) {
      blindHosts.push({
        hostId: entry.hostId,
        label: entry.label,
        propertyRef,
        reason: host === undefined ? "absent" : "disconnected",
        state: host?.state ?? null,
      });
      // Every device we already track under this console loses credibility,
      // including ones the API no longer lists at all.
      for (const device of devices) {
        unknownDeviceKeys.push(deviceKeyFor(device.mac, propertyRef));
      }
      continue;
    }

    healthyHostIds.push(entry.hostId);

    for (const device of devices) {
      const deviceKey = deviceKeyFor(device.mac, propertyRef);
      const online = (device.status ?? "").toLowerCase() === "online";
      const previous = knownByKey.get(deviceKey);

      observedDevices.push({
        deviceKey,
        deviceIdent: device.mac.toUpperCase(),
        name: device.name || device.mac,
        propertyRef,
        type: classifyDeviceType(device),
        source: classifyDeviceSource(device),
        status: online ? "ONLINE" : "OFFLINE",
      });

      const isTransition = online
        ? previous === "OFFLINE" || previous === "UNKNOWN"
        : previous !== "OFFLINE"; // includes first sighting while offline

      if (!isTransition) continue;

      events.push({
        deviceIdent: device.mac.toUpperCase(),
        deviceName: device.name || device.mac,
        propertyRef,
        eventType: online ? "RECOVERY" : "PROBLEM",
        source: classifyDeviceSource(device),
        deviceType: classifyDeviceType(device),
        alertMessage: online
          ? null
          : `${device.model || "device"} ${device.name || device.mac} is offline (UniFi poll)`,
        occurredAt: now,
      });
    }
  }

  return { events, observedDevices, blindHosts, unknownDeviceKeys, healthyHostIds };
}
