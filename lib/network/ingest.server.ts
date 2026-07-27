import type { DeviceSource } from "@prisma/client";
import { db } from "@/lib/db";
import type { ParsedWebhook } from "./parse";
import { TICKET_TIMER_MIN } from "./mass-outage";
import { createMassOutageTicket, evaluateMassOutage, type MassOutageEvaluation } from "./mass-outage.server";
import { closeOpenTicketOnRecovery } from "./ticketing.server";
import { TEAMS_PROPERTY_SELECT } from "./teams-config";

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
    select: { propertyId: true, ...TEAMS_PROPERTY_SELECT },
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

    // TASK 5 SEAM: a query against `tx` always sees this transaction's own
    // prior writes (this event insert included), so the mass-outage window
    // read does NOT need a fresh/committed transaction — it belongs in the
    // same atomic unit as the event insert, same as the "an open
    // MASS_OUTAGE ticket already exists → append device" branch and the
    // normal (non-mass-outage) STANDARD_TIMER job insert below. These are
    // all plain reads/updates with no unique-constraint risk. The ONLY
    // thing that genuinely needs to break out to its own fresh top-level
    // transaction is mass-outage TICKET CREATION (`createMassOutageTicket`):
    // it allocates a ticketNumber and can P2002-retry, which per the Task 4
    // lesson needs a transaction that isn't nested inside (or run after, on
    // an already-committed) this one — see `evaluateMassOutage`'s doc
    // comment. A mass outage supersedes the per-device standard-ticket flow
    // with its own MASS_OUTAGE_CHECK job/ticket handling (spec §5.5).
    let massOutageEvaluation: MassOutageEvaluation = { kind: "none" };
    if (parsed.eventType === "PROBLEM") {
      massOutageEvaluation = await evaluateMassOutage(tx, {
        device,
        property,
        now: event.receivedAt,
      });

      if (massOutageEvaluation.kind === "none") {
        // Schedule the standard 5-minute ticket timer (DevSpec §5.2). The
        // 1-minute cron (app/api/cron/network-timers) picks this up once
        // `runAt` has passed and decides whether to create a ticket.
        await tx.networkJob.create({
          data: {
            kind: "STANDARD_TIMER",
            runAt: new Date(event.receivedAt.getTime() + TICKET_TIMER_MIN * 60_000),
            eventId: event.id,
            status: "PENDING",
          },
        });
      }
    }

    return { device, event, massOutageEvaluation };
  });

  // Only the "no existing MASS_OUTAGE ticket → create one" sub-case runs
  // here, in its own fresh transaction, AFTER the insert transaction above
  // has committed — it has the P2002 ticket-number risk, exactly like
  // `createStandardTicket` isolates itself (Finding 1). A crash/throw
  // between that commit and this call would strand this event's cluster
  // with no ticket — the same residual gap Task 4 already accepts for the
  // STANDARD_TIMER path's `createStandardTicket` call in the cron sweep.
  // Unlike the pre-fix bug, this is no longer the common case: every
  // PROBLEM event still atomically gets either a STANDARD_TIMER job or an
  // append-to-existing-ticket update inside the transaction above; only the
  // rare "brand-new mass-outage cluster" case has this narrow window.
  if (result.massOutageEvaluation.kind === "create-needed") {
    await createMassOutageTicket(db, {
      property,
      clusterDevices: result.massOutageEvaluation.clusterDevices,
      problemEventIds: result.massOutageEvaluation.problemEventIds,
      now: result.event.receivedAt,
    });
  }

  return {
    resolved: true,
    deviceId: result.device.id,
    eventId: result.event.id,
    eventType: parsed.eventType,
  };
}
