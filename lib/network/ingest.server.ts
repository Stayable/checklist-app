import type { DeviceSource } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedWebhook } from "./parse";

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
    select: { id: true, propertyId: true },
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

    // ── TASK 4 SEAM ──────────────────────────────────────────────────────
    // Not implemented here. Task 4 will, right after this event insert:
    //   - on PROBLEM: run the mass-outage predicate (lib/network/mass-outage.ts)
    //     against recent property-scoped PROBLEM events, and schedule a
    //     5-minute NetworkJob ticket timer (lib/network/mass-outage.ts
    //     TICKET_TIMER_MIN) if one isn't already pending for this device.
    //   - on RECOVERY: close any open Ticket tied to this device (set
    //     resolvedByEventId on the PROBLEM event it resolves) instead of
    //     leaving a stale open ticket.
    // Deliberately out of scope for Task 3 (webhook receipt + event logging
    // only) per the NETWORK implementation plan.
    // ─────────────────────────────────────────────────────────────────────

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
    }

    return { deviceId: device.id, eventId: event.id };
  });

  return {
    resolved: true,
    deviceId: result.deviceId,
    eventId: result.eventId,
    eventType: parsed.eventType,
  };
}
