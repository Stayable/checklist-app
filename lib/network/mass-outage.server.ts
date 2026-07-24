import {
  Device,
  NetworkJob,
  Prisma,
  PrismaClient,
  Property,
  Ticket,
} from "@prisma/client";
import { isMassOutage, MASS_OUTAGE_CHECK_MIN, MASS_OUTAGE_WINDOW_SEC, partitionRecovery, type AffectedDevice } from "./mass-outage";
import {
  allocateTicketNumber,
  createStandardTicket,
  type TransactableClient,
} from "./ticketing.server";
import { logTeamsMassOutageCheck, logTeamsMassOutageCreated } from "./teams-graph.server";

/**
 * Detects and handles a mass outage (spec §5.5) for the property a PROBLEM
 * event just landed on. Called from the ingest PROBLEM path AFTER the main
 * device/event-insert transaction has committed (see the "TASK 5 SEAM" in
 * ingest.server.ts) — the read below needs to see the just-inserted event,
 * and mass-outage TICKET CREATION needs its own fresh top-level transaction
 * per attempt (the Task 4 P2002-retry lesson: a create that can collide on
 * a unique constraint must never run nested inside an already-committed-or-
 * poisoned outer transaction). `db` is therefore the top-level client, not
 * an interactive `Prisma.TransactionClient`.
 *
 * Returns `suppressStandardTimer: true` whenever a mass outage is detected
 * (whether this call created the cluster ticket or joined an existing one)
 * — the caller must not also schedule/leave scheduled a per-device
 * STANDARD_TIMER job for this event.
 */
export async function checkAndHandleMassOutage(
  db: TransactableClient & Pick<PrismaClient, "networkEvent" | "ticket">,
  params: {
    device: Pick<Device, "id" | "name">;
    property: Pick<Property, "id" | "shortCode" | "teamsChannelName">;
    now: Date;
  },
): Promise<{ massOutage: boolean; suppressStandardTimer: boolean }> {
  const { device, property, now } = params;
  const windowStart = new Date(now.getTime() - MASS_OUTAGE_WINDOW_SEC * 1000);

  const recentProblems = await db.networkEvent.findMany({
    where: {
      propertyId: property.id,
      eventType: "PROBLEM",
      receivedAt: { gte: windowStart, lte: now },
    },
    select: {
      id: true,
      receivedAt: true,
      deviceId: true,
      device: { select: { id: true, name: true } },
    },
  });

  if (!isMassOutage(recentProblems.map((e) => e.receivedAt), now)) {
    return { massOutage: false, suppressStandardTimer: false };
  }

  // An open mass-outage ticket for this property already exists — join it
  // rather than creating a second (spec §5.5: one ticket per outage window).
  const existing = await db.ticket.findFirst({
    where: {
      propertyId: property.id,
      ticketType: "MASS_OUTAGE",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });

  if (existing) {
    const affected = ((existing.affectedDevices as unknown as AffectedDevice[] | null) ?? []);
    const alreadyPresent = affected.some((d) => d.deviceId === device.id);
    if (!alreadyPresent) {
      const updated: AffectedDevice[] = [
        ...affected,
        { deviceId: device.id, deviceName: device.name, status: "offline", recoveredAt: null },
      ];
      await db.ticket.update({
        where: { id: existing.id },
        data: { affectedDevices: updated as unknown as Prisma.InputJsonValue },
      });
    }
    return { massOutage: true, suppressStandardTimer: true };
  }

  // Distinct devices with a PROBLEM event in the cluster window — the
  // clustered devices for the new ticket's affectedDevices snapshot.
  const byDevice = new Map<string, AffectedDevice>();
  for (const e of recentProblems) {
    if (!byDevice.has(e.deviceId)) {
      byDevice.set(e.deviceId, {
        deviceId: e.deviceId,
        deviceName: e.device.name,
        status: "offline",
        recoveredAt: null,
      });
    }
  }
  // Defensive: the triggering device itself should already be among
  // recentProblems (its own PROBLEM event is inside the window it just
  // landed in), but guard against it being absent for any reason.
  if (!byDevice.has(device.id)) {
    byDevice.set(device.id, {
      deviceId: device.id,
      deviceName: device.name,
      status: "offline",
      recoveredAt: null,
    });
  }

  await createMassOutageTicket(db, {
    property,
    clusterDevices: [...byDevice.values()],
    problemEventIds: recentProblems.map((e) => e.id),
    now,
  });

  return { massOutage: true, suppressStandardTimer: true };
}

/**
 * Creates the MASS_OUTAGE ticket + cancels superseded STANDARD_TIMER jobs +
 * schedules the 10-min MASS_OUTAGE_CHECK job, all per creation attempt in
 * ONE fresh transaction (mirrors `createStandardTicket`'s P2002 retry-once
 * pattern exactly, for the same reason: `allocateTicketNumber` can collide
 * under concurrent webhook delivery, and the retry must not run against a
 * transaction attempt #1 already aborted).
 */
async function createMassOutageTicket(
  db: TransactableClient,
  params: {
    property: Pick<Property, "id" | "shortCode" | "teamsChannelName">;
    clusterDevices: AffectedDevice[];
    problemEventIds: string[];
    now: Date;
  },
): Promise<Ticket> {
  const { property, clusterDevices, problemEventIds, now } = params;

  async function attempt(retrying: boolean): Promise<Ticket> {
    try {
      return await db.$transaction(async (tx) => {
        const ticketNumber = await allocateTicketNumber(tx, now);
        const ticket = await tx.ticket.create({
          data: {
            ticketNumber,
            propertyId: property.id,
            deviceId: null,
            ticketType: "MASS_OUTAGE",
            status: "OPEN",
            alertMessage: `Mass outage — ${clusterDevices.length} devices offline simultaneously`,
            affectedDevices: clusterDevices as unknown as Prisma.InputJsonValue,
            openedAt: now,
          },
        });

        // Cancel superseded standard timers (spec §5.5): the per-device
        // 5-min timers for devices now folded into this mass-outage cluster
        // no longer need to fire their own standard ticket.
        if (problemEventIds.length > 0) {
          await tx.networkJob.updateMany({
            where: {
              kind: "STANDARD_TIMER",
              status: "PENDING",
              eventId: { in: problemEventIds },
            },
            data: { status: "CANCELLED" },
          });
        }

        await tx.networkJob.create({
          data: {
            kind: "MASS_OUTAGE_CHECK",
            runAt: new Date(now.getTime() + MASS_OUTAGE_CHECK_MIN * 60_000),
            ticketId: ticket.id,
            status: "PENDING",
          },
        });

        await logTeamsMassOutageCreated(tx, ticket, property);

        return ticket;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        !retrying
      ) {
        return attempt(true);
      }
      throw err;
    }
  }

  return attempt(false);
}

/**
 * The 10-minute mass-outage resolution check (spec §5.5), fired by the
 * MASS_OUTAGE_CHECK NetworkJob. Splits the ticket's affected devices into
 * recovered vs still-offline, spawns a STANDARD child ticket per
 * still-offline device (linked via `parentTicketId`), and resolves the
 * mass-outage ticket outright if every device recovered.
 *
 * Deliberately NOT wrapped in one outer `$transaction` — same Task 4 lesson
 * as the STANDARD_TIMER cron sweep: `createStandardTicket` needs to run its
 * own fresh per-attempt transactions for its P2002 retry, which can't
 * happen if this whole function were nested inside a single enclosing tx.
 * `db` is the top-level client throughout; each write below is its own
 * atomic statement (or, for ticket creation, its own internally-managed
 * transaction).
 */
export async function runMassOutageCheck(
  db: PrismaClient,
  job: Pick<NetworkJob, "id" | "ticketId">,
): Promise<void> {
  if (!job.ticketId) {
    await db.networkJob.update({ where: { id: job.id }, data: { status: "DONE" } });
    return;
  }

  const ticket = await db.ticket.findUnique({ where: { id: job.ticketId } });
  if (!ticket || ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    await db.networkJob.update({ where: { id: job.id }, data: { status: "DONE" } });
    return;
  }

  const now = new Date();
  const affected = (ticket.affectedDevices as unknown as AffectedDevice[] | null) ?? [];
  const stillTrackedIds = affected.filter((d) => d.status === "offline").map((d) => d.deviceId);

  const recoveredIds = new Set<string>();
  if (stillTrackedIds.length > 0) {
    const devices = await db.device.findMany({
      where: { id: { in: stillTrackedIds } },
      select: { id: true, currentStatus: true },
    });
    for (const d of devices) {
      if (d.currentStatus === "ONLINE") recoveredIds.add(d.id);
    }

    const recoveries = await db.networkEvent.findMany({
      where: {
        deviceId: { in: stillTrackedIds },
        eventType: "RECOVERY",
        receivedAt: { gte: ticket.openedAt },
      },
      select: { deviceId: true },
    });
    for (const r of recoveries) recoveredIds.add(r.deviceId);
  }

  const { updated, recovered, stillOffline } = partitionRecovery(affected, recoveredIds, now);

  await db.ticket.update({
    where: { id: ticket.id },
    data: { affectedDevices: updated as unknown as Prisma.InputJsonValue },
  });

  const property = await db.property.findUnique({
    where: { id: ticket.propertyId },
    select: { id: true, shortCode: true, teamsChannelName: true },
  });
  if (property) {
    await logTeamsMassOutageCheck(db, ticket, property, {
      recoveredNames: recovered.map((d) => d.deviceName),
      stillOfflineNames: stillOffline.map((d) => d.deviceName),
    });
  }

  if (property) {
    for (const d of stillOffline) {
      const triggerEvent = await findTriggerEventForChildTicket(db, d.deviceId);
      if (!triggerEvent) {
        // Device is tracked as still-offline but has no PROBLEM event on
        // record — shouldn't happen in practice; skip rather than create a
        // child ticket with no valid trigger-event FK to link.
        console.error(
          `mass-outage: no PROBLEM event found for still-offline device ${d.deviceId}, skipping child ticket`,
        );
        continue;
      }
      await createStandardTicket(db, {
        device: { id: d.deviceId },
        property,
        triggerEvent,
        now,
        parentTicketId: ticket.id,
      });
    }
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data:
      stillOffline.length === 0
        ? { status: "RESOLVED", resolvedAt: now }
        : { status: "IN_PROGRESS" },
  });

  await db.networkJob.update({ where: { id: job.id }, data: { status: "DONE" } });
}

async function findTriggerEventForChildTicket(
  db: PrismaClient,
  deviceId: string,
): Promise<{ id: string; alertMessage: string | null } | null> {
  const unresolved = await db.networkEvent.findFirst({
    where: { deviceId, eventType: "PROBLEM", resolvedByEventId: null },
    orderBy: { receivedAt: "desc" },
    select: { id: true, alertMessage: true },
  });
  if (unresolved) return unresolved;

  // Fall back to the most recent PROBLEM event regardless of resolution
  // state — still gives the child ticket a valid trigger-event link.
  return db.networkEvent.findFirst({
    where: { deviceId, eventType: "PROBLEM" },
    orderBy: { receivedAt: "desc" },
    select: { id: true, alertMessage: true },
  });
}
