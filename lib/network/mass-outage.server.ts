import {
  Device,
  NetworkJob,
  Prisma,
  PrismaClient,
  Property,
  Ticket,
} from "@prisma/client";
import { isMassOutage, MASS_OUTAGE_CHECK_MIN, MASS_OUTAGE_WINDOW_SEC, partitionRecovery, type AffectedDevice } from "./mass-outage";
import { downDurationMin } from "./ticketing";
import {
  allocateTicketNumber,
  createStandardTicket,
  hasOpenTicketForDevice,
  type TransactableClient,
} from "./ticketing.server";
import { logTeamsMassOutageCheck, logTeamsMassOutageCreated } from "./teams-graph.server";
import { TEAMS_PROPERTY_SELECT } from "./teams-config";

/** Outcome of the in-transaction mass-outage check+decision (see `evaluateMassOutage`). */
export type MassOutageEvaluation =
  | { kind: "none" }
  | { kind: "joined-existing" }
  | { kind: "create-needed"; clusterDevices: AffectedDevice[]; problemEventIds: string[] };

/**
 * Merges `additions` into `existing` by `deviceId`, leaving any
 * already-present entry untouched (so a "recovered" entry from an earlier
 * check cycle is never clobbered back to "offline"). Pure — no I/O.
 */
function mergeAffectedDevices(
  existing: AffectedDevice[],
  additions: AffectedDevice[],
): { merged: AffectedDevice[]; changed: boolean } {
  const merged = [...existing];
  let changed = false;
  for (const a of additions) {
    if (!merged.some((d) => d.deviceId === a.deviceId)) {
      merged.push(a);
      changed = true;
    }
  }
  return { merged, changed };
}

/**
 * Takes a per-property Postgres transaction-scoped advisory lock as the
 * first statement of the caller's transaction (auto-released at that
 * transaction's commit/rollback). Serializes concurrent mass-outage
 * check+decision (and, separately, ticket-creation) attempts for the SAME
 * property so a second handler always observes the first's committed
 * writes rather than racing it (Finding 2). `hashtext` collapses the cuid
 * property id to an int4, which Postgres implicitly widens to the bigint
 * `pg_advisory_xact_lock(bigint)` overload expects.
 */
async function lockPropertyForOutageHandling(
  tx: Prisma.TransactionClient,
  propertyId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${propertyId}))`;
}

/**
 * Detects and evaluates a mass outage (spec §5.5) for the property a PROBLEM
 * event just landed on. Runs INSIDE the caller's event-insert transaction
 * (see ingest.server.ts) — the 120s window-count read and the "an open
 * MASS_OUTAGE ticket already exists → append device" branch are plain
 * reads/updates with no unique-constraint risk, so they belong in the same
 * atomic unit as the event insert (Finding 1). Only ticket *creation* has
 * the P2002 ticket-number risk (allocateTicketNumber can collide under
 * concurrent webhook delivery) and is therefore NOT done here — when this
 * returns `{ kind: "create-needed" }`, the caller creates the ticket via
 * `createMassOutageTicket` in its own fresh top-level transaction AFTER this
 * transaction commits, exactly like `createStandardTicket` isolates itself.
 *
 * Takes a per-property advisory lock (Finding 2) as its first statement so
 * two PROBLEM webhooks for the same property landing near-simultaneously
 * can't both read "no ticket yet" and both decide to create one, and can't
 * lost-update each other's append to an existing ticket's `affectedDevices`.
 */
export async function evaluateMassOutage(
  tx: Prisma.TransactionClient,
  params: {
    device: Pick<Device, "id" | "name">;
    property: Pick<Property, "id" | "shortCode" | "teamsChannelName">;
    now: Date;
  },
): Promise<MassOutageEvaluation> {
  const { device, property, now } = params;

  await lockPropertyForOutageHandling(tx, property.id);

  const windowStart = new Date(now.getTime() - MASS_OUTAGE_WINDOW_SEC * 1000);

  const recentProblems = await tx.networkEvent.findMany({
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
    return { kind: "none" };
  }

  // An open mass-outage ticket for this property already exists — join it
  // rather than creating a second (spec §5.5: one ticket per outage window).
  const existing = await tx.ticket.findFirst({
    where: {
      propertyId: property.id,
      ticketType: "MASS_OUTAGE",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });

  if (existing) {
    const affected = (existing.affectedDevices as unknown as AffectedDevice[] | null) ?? [];
    const { merged, changed } = mergeAffectedDevices(affected, [
      { deviceId: device.id, deviceName: device.name, status: "offline", recoveredAt: null },
    ]);
    if (changed) {
      await tx.ticket.update({
        where: { id: existing.id },
        data: { affectedDevices: merged as unknown as Prisma.InputJsonValue },
      });
    }
    return { kind: "joined-existing" };
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

  return {
    kind: "create-needed",
    clusterDevices: [...byDevice.values()],
    problemEventIds: recentProblems.map((e) => e.id),
  };
}

/**
 * Creates the MASS_OUTAGE ticket + cancels superseded STANDARD_TIMER jobs +
 * schedules the 10-min MASS_OUTAGE_CHECK job, all per creation attempt in
 * ONE fresh transaction (mirrors `createStandardTicket`'s P2002 retry-once
 * pattern exactly, for the same reason: `allocateTicketNumber` can collide
 * under concurrent webhook delivery, and the retry must not run against a
 * transaction attempt #1 already aborted).
 *
 * Called from ingest.server.ts AFTER its event-insert transaction (which ran
 * `evaluateMassOutage` and got back `{ kind: "create-needed" }`) has already
 * committed — so there is a narrow gap between that commit (which released
 * the per-property advisory lock) and this transaction's start. To close
 * that gap (Finding 2): this transaction re-takes the SAME per-property
 * advisory lock as its first statement, then RE-CHECKS for an open
 * MASS_OUTAGE ticket before creating. If another concurrent handler won that
 * race and already created one (or appended to one) while we were waiting
 * for the lock, we join it — merging in every device from this cluster
 * snapshot — instead of creating a duplicate. Only when no ticket exists do
 * we actually allocate a ticket number and create; that allocation keeps its
 * P2002 retry-once as a backstop (ticketNumber is a global per-ET-day
 * sequence shared across properties, so a cross-property collision is still
 * possible even though the per-property race is now closed).
 */
export async function createMassOutageTicket(
  db: TransactableClient,
  params: {
    property: Pick<Property, "id" | "name" | "shortCode" | "teamsChannelName" | "teamsChannelId">;
    clusterDevices: AffectedDevice[];
    problemEventIds: string[];
    now: Date;
  },
): Promise<Ticket> {
  const { property, clusterDevices, problemEventIds, now } = params;

  async function cancelSupersededTimers(tx: Prisma.TransactionClient): Promise<void> {
    if (problemEventIds.length === 0) return;
    await tx.networkJob.updateMany({
      where: {
        kind: "STANDARD_TIMER",
        status: "PENDING",
        eventId: { in: problemEventIds },
      },
      data: { status: "CANCELLED" },
    });
  }

  async function attempt(retrying: boolean): Promise<Ticket> {
    try {
      return await db.$transaction(async (tx) => {
        await lockPropertyForOutageHandling(tx, property.id);

        const already = await tx.ticket.findFirst({
          where: {
            propertyId: property.id,
            ticketType: "MASS_OUTAGE",
            status: { in: ["OPEN", "IN_PROGRESS"] },
          },
        });

        if (already) {
          // A racing handler created (or joined) the cluster ticket while we
          // were waiting on the lock — join it rather than creating a
          // duplicate (Finding 2's whole point of re-checking here).
          const affected = (already.affectedDevices as unknown as AffectedDevice[] | null) ?? [];
          const { merged, changed } = mergeAffectedDevices(affected, clusterDevices);
          if (changed) {
            await tx.ticket.update({
              where: { id: already.id },
              data: { affectedDevices: merged as unknown as Prisma.InputJsonValue },
            });
          }
          await cancelSupersededTimers(tx);
          return already;
        }

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
        await cancelSupersededTimers(tx);

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
    select: TEAMS_PROPERTY_SELECT,
  });
  if (property) {
    // Carried Task-7 Important fix: thread the recovered devices' down
    // duration through to the Teams reply (spec §5.5's "Down Duration:
    // {max} min" line, which buildMassOutageCheckReply only renders in the
    // all-recovered branch). Data passthrough only — does not touch the
    // mass-outage clustering/recovery decision above.
    const recoveredDurations = recovered
      .map((d) => (d.recoveredAt ? downDurationMin(ticket.openedAt, new Date(d.recoveredAt)) : null))
      .filter((n): n is number => n !== null);
    const maxDurationMin =
      recoveredDurations.length > 0 ? Math.max(...recoveredDurations) : undefined;

    await logTeamsMassOutageCheck(db, ticket, property, {
      recoveredNames: recovered.map((d) => d.deviceName),
      stillOfflineNames: stillOffline.map((d) => d.deviceName),
      maxDurationMin,
    });
  }

  if (property) {
    // Finding 3: `affected`/`updated` was already persisted above, so if this
    // loop throws partway through, the job is left PENDING and retried by
    // next cron tick (see route.ts's try/catch around runMassOutageCheck) —
    // which would call createStandardTicket again for a device that already
    // got one on the prior attempt. Guard each iteration with
    // hasOpenTicketForDevice (mirrors processJob in the cron route) so a
    // retry is idempotent, and isolate each device in its own try/catch so
    // one device's failure doesn't strand the rest of the cluster.
    for (const d of stillOffline) {
      try {
        const hasOpenTicket = await hasOpenTicketForDevice(db, d.deviceId);
        if (hasOpenTicket) continue;

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
      } catch (err) {
        console.error(
          `mass-outage: failed creating child ticket for device ${d.deviceId}`,
          err,
        );
      }
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
