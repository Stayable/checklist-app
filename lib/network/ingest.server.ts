import type { DeviceSource } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedWebhook } from "./parse";
import { TICKET_TIMER_MIN } from "./mass-outage";
import { checkAndHandleMassOutage } from "./mass-outage.server";
import { closeOpenTicketOnRecovery } from "./ticketing.server";

export type IngestResult =
  | { resolved: false }
  | {
      resolved: true;
      deviceId: string;
      eventId: string;
      eventType: ParsedWebhook["eventType"];
    };

/**
 * Ingests one already-parsed webhook event: resolves the property, upserts
 * the device, logs the NetworkEvent, and updates device status. The raw
 * payload is persisted by the caller (route handler) BEFORE this runs —
 * capture-before-trust (spec §3.3) — this function only handles the
 * "we understood the event" path.
 *
 * `source` is the DeviceSource-family of the webhook vendor (UNIFI_PROTECT /
 * UNIFI_NETWORK / ARUBA); it's threaded straight from the parsed payload, not
 * re-derived here.
 *
 * `rawBody` is accepted (not used yet) so the call site can pass it straight
 * through without a redundant re-fetch — the Task 4 seam below may end up
 * wanting it (e.g. attaching original payload context to a mass-outage
 * decision); it is NOT re-persisted here (the route handler already wrote
 * RawWebhookPayload before calling this).
 */
export async function ingestWebhook(
  source: DeviceSource,
  rawBody: string,
  parsed: ParsedWebhook,
): Promise<IngestResult> {
  const property = await db.property.findUnique({
    where: { propertyId: parsed.propertyRef },
    select: { id: true, propertyId: true, shortCode: true, teamsChannelName: true },
  });

  // Can't attribute the event to a known property — don't create a Device or
  // NetworkEvent for it. The caller still returns 200 (raw payload already
  // stored for reconciliation); this is not the caller's fault to retry.
  if (!property) return { resolved: false };

  const deviceKey = `${parsed.deviceName}_${property.propertyId}`;

  const result = await db.$transaction(async (tx) => {
    const device = await tx.device.upsert({
      where: { deviceKey },
      create: {
        deviceKey,
        name: parsed.deviceName,
        type: parsed.deviceType,
        source,
        propertyId: property.id,
      },
      update: {
        name: parsed.deviceName,
        type: parsed.deviceType,
        source,
      },
    });

    const event = await tx.networkEvent.create({
      data: {
        deviceId: device.id,
        propertyId: property.id,
        eventType: parsed.eventType,
        source,
        alertMessage: parsed.alertMessage,
        occurredAt: parsed.occurredAt,
      },
    });

    if (parsed.eventType === "PROBLEM") {
      await tx.device.update({
        where: { id: device.id },
        data: { currentStatus: "OFFLINE" },
      });
    } else {
      // RECOVERY: spec §4.2 — lastSeenAt updates on every recovery.
      await tx.device.update({
        where: { id: device.id },
        data: { currentStatus: "ONLINE", lastSeenAt: new Date() },
      });

      // Spec §5.1: link this RECOVERY to the most recent still-open PROBLEM
      // for the device (server-trustworthy receivedAt ordering, not
      // occurredAt), then close any open ticket it was tracked under.
      const openProblem = await tx.networkEvent.findFirst({
        where: {
          deviceId: device.id,
          eventType: "PROBLEM",
          resolvedByEventId: null,
        },
        orderBy: { receivedAt: "desc" },
      });
      if (openProblem) {
        await tx.networkEvent.update({
          where: { id: openProblem.id },
          data: { resolvedByEventId: event.id },
        });
      }

      await closeOpenTicketOnRecovery(tx, {
        device,
        recoveryEvent: event,
        now: event.receivedAt,
      });
    }

    return { device, event };
  });

  // TASK 5 SEAM: the mass-outage check runs AFTER the main insert
  // transaction above has committed, not nested inside it. Two reasons:
  // (1) it needs to read this PROBLEM event back via a fresh top-level `db`
  // query (property-scoped PROBLEM events in the last 120s) — that read
  // must see this event, which it only can once the insert transaction has
  // committed; (2) mass-outage TICKET CREATION allocates a ticketNumber and
  // can P2002-retry, which per the Task 4 lesson needs its own fresh
  // transaction per attempt, not one nested inside (or chained directly
  // after, uncommitted) this function's insert transaction. A mass outage
  // supersedes the per-device standard-ticket flow with its own
  // MASS_OUTAGE_CHECK job/ticket handling (spec §5.5).
  if (parsed.eventType === "PROBLEM") {
    const { suppressStandardTimer } = await checkAndHandleMassOutage(db, {
      device: result.device,
      property,
      now: result.event.receivedAt,
    });

    if (!suppressStandardTimer) {
      // Schedule the standard 5-minute ticket timer (DevSpec §5.2). The
      // 1-minute cron (app/api/cron/network-timers) picks this up once
      // `runAt` has passed and decides whether to create a ticket.
      await db.networkJob.create({
        data: {
          kind: "STANDARD_TIMER",
          runAt: new Date(result.event.receivedAt.getTime() + TICKET_TIMER_MIN * 60_000),
          eventId: result.event.id,
          status: "PENDING",
        },
      });
    }
  }

  return {
    resolved: true,
    deviceId: result.device.id,
    eventId: result.event.id,
    eventType: parsed.eventType,
  };
}
