import { DeviceStatus, Prisma, TicketStatus, TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { ingestWebhook } from "./ingest.server";
import { allocateTicketNumber } from "./ticketing.server";
import { monitoredHosts } from "./unifi-hosts";
import { fetchUnifiSnapshot, isUnifiConfigured, type UnifiFabric } from "./unifi-api";
import { decidePoll, type BlindHost, type ObservedDevice, type PollDecision } from "./unifi-poll";

// UniFi poller orchestration (T11, 2026-07-27).
//
// Fetch a snapshot → decide (pure, lib/network/unifi-poll.ts) → apply:
//   1. upsert inventory for devices under connected consoles
//   2. ingest transition events through the EXISTING pipeline
//      (lib/network/ingest.server.ts) so tickets, 5-min timers, mass-outage
//      clustering and recovery-close all behave exactly as built and reviewed
//      — the poller adds a source, it does not fork the lifecycle
//   3. apply the N4 blind-console gate: devices → UNKNOWN, one monitoring-blind
//      ticket per blind console, auto-resolved when the console reconnects
//
// Never throws for one bad property/device: a failure is counted and reported,
// because a cron that dies halfway leaves the fleet half-updated.

const MONITORING_BLIND_PREFIX = "MONITORING BLIND";

export type PollOutcome = {
  configured: boolean;
  ok: boolean;
  error?: string;
  /** How many API keys answered, and how many failed (one key per fabric). */
  keysUsed: number;
  keysFailed: number;
  /** Which fabrics' keys errored — a bare count doesn't say which sites went dark. */
  fabricsFailed?: UnifiFabric[];
  hostsPolled: number;
  devicesObserved: number;
  /** Inventory rows that failed to write — surfaces a lagging DB, not a 500. */
  devicesFailed: number;
  eventsIngested: number;
  eventsFailed: number;
  devicesMarkedUnknown: number;
  blindHosts: number;
  blindTicketsOpened: number;
  blindTicketsResolved: number;
};

/**
 * Creates inventory rows for devices under a connected console.
 *
 * Deliberately does NOT write `currentStatus` on update: status transitions are
 * owned by event ingestion (which also links recovery events and closes
 * tickets), so having two writers would let a poll silently clear an OFFLINE
 * device without ever closing its ticket. On CREATE the observed status is
 * used, because there is no prior state to respect and a brand-new device that
 * is simply up must still appear in the dashboard.
 */
async function upsertInventory(
  observed: ObservedDevice[],
  propertyIdByRef: Map<string, string>,
  now: Date,
): Promise<{ count: number; failed: number }> {
  let count = 0;
  let failed = 0;

  for (const device of observed) {
    const propertyId = propertyIdByRef.get(device.propertyRef);
    if (propertyId === undefined) continue;

    // Per-device isolation: one bad row must not abort the sweep. The concrete
    // near-term case is the DeviceType widening (SWITCH/GATEWAY/NVR) not yet
    // being applied to a given database — without this, every tick would 500
    // and nothing would update, instead of degrading to "inventory lagging."
    try {
      await db.device.upsert({
        where: { deviceKey: device.deviceKey },
        create: {
          deviceKey: device.deviceKey,
          name: device.name,
          type: device.type,
          source: device.source,
          propertyId,
          currentStatus:
            device.status === "ONLINE" ? DeviceStatus.ONLINE : DeviceStatus.OFFLINE,
          lastSeenAt: device.status === "ONLINE" ? now : null,
        },
        update: {
          name: device.name,
          type: device.type,
          source: device.source,
          ...(device.status === "ONLINE" ? { lastSeenAt: now } : {}),
        },
      });
      count += 1;
    } catch {
      failed += 1;
    }
  }

  return { count, failed };
}

/**
 * Forces every device under an untrustworthy console to UNKNOWN.
 *
 * UNKNOWN, never OFFLINE — this is the whole point of N4. A cloud-disconnected
 * console reports all its devices as offline, which is stale data, not an
 * outage. UNKNOWN reads as "we cannot see this" in the UI and emits no events,
 * so it can never open a ticket. Devices already OFFLINE with an open ticket
 * are left alone: that outage was observed while the console was still
 * trustworthy, and silently erasing it would strand its ticket.
 */
async function markDevicesUnknown(deviceKeys: string[]): Promise<number> {
  if (deviceKeys.length === 0) return 0;

  const result = await db.device.updateMany({
    where: {
      deviceKey: { in: deviceKeys },
      currentStatus: { not: DeviceStatus.OFFLINE },
    },
    data: { currentStatus: DeviceStatus.UNKNOWN },
  });

  return result.count;
}

/**
 * One open monitoring-blind ticket per blind console, so a console we cannot
 * see is a visible, assignable problem rather than an empty panel that reads
 * as healthy.
 *
 * Device-less (`deviceId: null`) and event-less (`triggerEventId: null`) —
 * both columns are nullable, and this is a property-level condition with no
 * originating device event by definition. Idempotent: an already-open ticket
 * for the same console is left as-is rather than duplicated every minute.
 *
 * Ticket-number allocation gets its own transaction per attempt and retries
 * once on a P2002 collision, following the Task 4 lesson (Postgres aborts the
 * whole transaction on error, so a retry inside the poisoned one would throw
 * "current transaction is aborted" instead of retrying).
 */
async function openBlindTicket(
  blind: BlindHost,
  propertyId: string,
  now: Date,
): Promise<boolean> {
  const marker = `${MONITORING_BLIND_PREFIX}: ${blind.label}`;

  const existing = await db.ticket.findFirst({
    where: {
      propertyId,
      status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
      alertMessage: { startsWith: marker },
    },
    select: { id: true },
  });
  if (existing !== null) return false;

  const detail =
    blind.reason === "absent"
      ? "console is no longer returned by the UniFi Site Manager API"
      : `console reports cloud state "${blind.state ?? "unknown"}"`;

  async function attempt(): Promise<void> {
    await db.$transaction(async (tx) => {
      const ticketNumber = await allocateTicketNumber(tx, now);
      await tx.ticket.create({
        data: {
          ticketNumber,
          propertyId,
          deviceId: null,
          triggerEventId: null,
          ticketType: TicketType.MASS_OUTAGE,
          status: TicketStatus.OPEN,
          openedAt: now,
          alertMessage: `${marker} — ${detail}. Device status for this console is UNKNOWN, not verified up. Monitoring is blind here until it reconnects.`,
        },
      });
    });
  }

  try {
    await attempt();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await attempt();
    } else {
      throw error;
    }
  }
  return true;
}

/**
 * Closes monitoring-blind tickets for consoles that came back. Scoped by the
 * label marker so it only ever resolves tickets this mechanism opened — it
 * must never touch a real device outage ticket.
 */
async function resolveBlindTickets(
  healthyLabels: { label: string; propertyId: string }[],
  now: Date,
): Promise<number> {
  let resolved = 0;

  for (const { label, propertyId } of healthyLabels) {
    const result = await db.ticket.updateMany({
      where: {
        propertyId,
        status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] },
        alertMessage: { startsWith: `${MONITORING_BLIND_PREFIX}: ${label}` },
      },
      data: {
        status: TicketStatus.RESOLVED,
        resolvedAt: now,
        resolutionNotes: "Console reconnected to the UniFi cloud; monitoring restored.",
      },
    });
    resolved += result.count;
  }

  return resolved;
}

/** Runs one poll cycle. Safe to call every minute; safe to call concurrently. */
export async function runUnifiPoll(now: Date = new Date()): Promise<PollOutcome> {
  const empty: PollOutcome = {
    configured: isConfiguredForReport(),
    ok: false,
    keysUsed: 0,
    keysFailed: 0,
    hostsPolled: 0,
    devicesObserved: 0,
    devicesFailed: 0,
    eventsIngested: 0,
    eventsFailed: 0,
    devicesMarkedUnknown: 0,
    blindHosts: 0,
    blindTicketsOpened: 0,
    blindTicketsResolved: 0,
  };

  const monitored = monitoredHosts();
  if (monitored.length === 0) {
    return { ...empty, ok: true, error: "no_monitored_hosts" };
  }

  const fetched = await fetchUnifiSnapshot();
  if (!fetched.ok) {
    return { ...empty, configured: fetched.configured, error: fetched.error };
  }

  // Resolve only the properties the registry actually references.
  const refs = [...new Set(monitored.map((entry) => entry.propertyRef!))];
  const properties = await db.property.findMany({
    where: { propertyId: { in: refs } },
    select: { id: true, propertyId: true },
  });
  const propertyIdByRef = new Map(properties.map((p) => [p.propertyId, p.id]));

  const known = await db.device.findMany({
    where: { property: { propertyId: { in: refs } } },
    select: { deviceKey: true, currentStatus: true },
  });

  const decision: PollDecision = decidePoll({
    snapshot: fetched.snapshot,
    known,
    monitored,
    now,
  });

  const inventory = await upsertInventory(decision.observedDevices, propertyIdByRef, now);

  // Events go through the untouched webhook ingest path. `rawBody` is a
  // synthetic marker: the poller has no HTTP body, and nothing downstream
  // reads it today (see ingestWebhook's doc comment).
  let eventsIngested = 0;
  let eventsFailed = 0;
  for (const event of decision.events) {
    try {
      const result = await ingestWebhook(event.source, "unifi-poll", {
        deviceName: event.deviceName,
        deviceIdent: event.deviceIdent,
        propertyRef: event.propertyRef,
        eventType: event.eventType,
        source: event.source,
        deviceType: event.deviceType,
        alertMessage: event.alertMessage,
        occurredAt: event.occurredAt,
      });
      if (result.resolved) eventsIngested += 1;
      else eventsFailed += 1;
    } catch {
      // One device must not abort the sweep — the rest of the fleet still
      // needs updating this tick, and a PENDING timer will be retried anyway.
      eventsFailed += 1;
    }
  }

  const devicesMarkedUnknown = await markDevicesUnknown(decision.unknownDeviceKeys);

  let blindTicketsOpened = 0;
  for (const blind of decision.blindHosts) {
    const propertyId = propertyIdByRef.get(blind.propertyRef);
    if (propertyId === undefined) continue;
    try {
      if (await openBlindTicket(blind, propertyId, now)) blindTicketsOpened += 1;
    } catch {
      // Counted as not-opened; next tick retries.
    }
  }

  const healthyLabels = monitored
    .filter((entry) => decision.healthyHostIds.includes(entry.hostId))
    .flatMap((entry) => {
      const propertyId = propertyIdByRef.get(entry.propertyRef!);
      return propertyId === undefined ? [] : [{ label: entry.label, propertyId }];
    });
  const blindTicketsResolved = await resolveBlindTickets(healthyLabels, now);

  return {
    configured: true,
    ok: true,
    keysUsed: fetched.keysUsed,
    keysFailed: fetched.keysFailed,
    fabricsFailed: fetched.fabricsFailed,
    hostsPolled: monitored.length,
    devicesObserved: inventory.count,
    devicesFailed: inventory.failed,
    eventsIngested,
    eventsFailed,
    devicesMarkedUnknown,
    blindHosts: decision.blindHosts.length,
    blindTicketsOpened,
    blindTicketsResolved,
  };
}

function isConfiguredForReport(): boolean {
  return isUnifiConfigured();
}
