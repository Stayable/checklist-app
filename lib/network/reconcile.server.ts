import { DeviceStatus, TicketStatus, TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { planReArm, RE_ARM_TIMER_MIN, type ReconcileDevice } from "./reconcile";

// Server half of the offline-device reconciliation pass. Gathers present state,
// hands it to the pure planner (lib/network/reconcile.ts — read its header for
// WHY this exists), and writes the resulting STANDARD_TIMER jobs.
//
// It creates JOBS, not TICKETS. The existing 1-minute cron
// (app/api/cron/network-timers) already owns ticket creation, and it re-checks
// `hasOpenTicketForDevice` and `resolvedByEventId` at fire time. Routing through
// it means the reconciler never becomes a second ticket-creating authority that
// can drift from the first, and it means a device that recovers in the five
// minutes between the sweep and the fire correctly gets no ticket at all —
// `decideTimerAction` returns SKIP_SELF_RESOLVED and the loop closes itself.

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

export type ReArmOutcome = {
  /** Devices offline with nothing covering them, before the cap. */
  uncovered: number;
  /** STANDARD_TIMER jobs actually written this tick. */
  reArmed: number;
  /** Over the cap; re-offered next tick. */
  deferred: number;
  /**
   * Offline, unowned, and with no open PROBLEM event to arm a timer against.
   * Nothing can be done for these without fabricating an event — see the
   * `unarmable` note in reconcile.ts. Non-zero here is a real, reportable gap.
   */
  unarmable: number;
  skippedMassOutage: number;
  skippedPendingTimer: number;
};

const EMPTY: ReArmOutcome = {
  uncovered: 0,
  reArmed: 0,
  deferred: 0,
  unarmable: 0,
  skippedMassOutage: 0,
  skippedPendingTimer: 0,
};

/**
 * One reconciliation sweep.
 *
 * `propertyIds` scopes it to the properties the caller owns — the poller passes
 * the ones in its console registry, so a property nobody polls is never
 * reconciled off stale rows.
 *
 * Must run AFTER event ingest and AFTER `markDevicesUnknown` in the poll cycle:
 * ingest is what creates this tick's legitimate PENDING timers (which this pass
 * must see and skip), and marking unknown is what removes blind-console devices
 * from the OFFLINE set before it is read.
 */
export async function runReArmSweep(
  propertyIds: string[],
  now: Date = new Date(),
  cap?: number,
): Promise<ReArmOutcome> {
  if (propertyIds.length === 0) return EMPTY;

  const inScope = { propertyId: { in: propertyIds } };

  const [offlineRows, openTickets, pendingJobs] = await Promise.all([
    db.device.findMany({
      where: { ...inScope, currentStatus: DeviceStatus.OFFLINE },
      select: { id: true, propertyId: true, updatedAt: true, lastSeenAt: true },
    }),
    // deviceId AND ticketType in one read: the per-device coverage set and the
    // property-level mass-outage set both come out of it.
    db.ticket.findMany({
      where: { ...inScope, status: { in: OPEN_STATUSES } },
      select: { deviceId: true, propertyId: true, ticketType: true },
    }),
    db.networkJob.findMany({
      where: { kind: "STANDARD_TIMER", status: "PENDING" },
      select: { eventId: true },
    }),
  ]);

  if (offlineRows.length === 0) return EMPTY;

  const offlineIds = offlineRows.map((d) => d.id);

  // A NetworkJob points at an event, not a device, so the pending-timer set has
  // to be resolved through the events. Scoped to the offline devices we are
  // about to consider rather than the whole event table.
  const pendingEventIds = pendingJobs
    .map((j) => j.eventId)
    .filter((id): id is string => id !== null);

  const [pendingEvents, openProblems] = await Promise.all([
    pendingEventIds.length === 0
      ? Promise.resolve([] as { deviceId: string }[])
      : db.networkEvent.findMany({
          where: { id: { in: pendingEventIds }, deviceId: { in: offlineIds } },
          select: { deviceId: true },
        }),
    // Newest first, so the first row seen per device is the one to arm.
    db.networkEvent.findMany({
      where: { deviceId: { in: offlineIds }, eventType: "PROBLEM", resolvedByEventId: null },
      select: { id: true, deviceId: true, receivedAt: true },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  const openProblemByDevice = new Map<string, { id: string; receivedAt: Date }>();
  for (const e of openProblems) {
    if (!openProblemByDevice.has(e.deviceId)) {
      openProblemByDevice.set(e.deviceId, { id: e.id, receivedAt: e.receivedAt });
    }
  }

  const devices: ReconcileDevice[] = offlineRows.map((d) => {
    const problem = openProblemByDevice.get(d.id);
    return {
      deviceId: d.id,
      propertyId: d.propertyId,
      status: "OFFLINE",
      openProblemEventId: problem?.id ?? null,
      // Best available "offline since": the PROBLEM event that put it there,
      // else the last time it was seen up, else the row's own last write. Used
      // only for ordering, so an approximation is fine — it just has to be
      // stable, or the cap would drain a different arbitrary ten each tick.
      offlineSince: problem?.receivedAt ?? d.lastSeenAt ?? d.updatedAt,
    };
  });

  const plan = planReArm({
    devices,
    deviceIdsWithOpenTicket: openTickets
      .map((t) => t.deviceId)
      .filter((id): id is string => id !== null),
    propertyIdsWithOpenMassOutage: openTickets
      .filter((t) => t.ticketType === TicketType.MASS_OUTAGE)
      .map((t) => t.propertyId),
    deviceIdsWithPendingTimer: pendingEvents.map((e) => e.deviceId),
    cap,
  });

  let reArmed = 0;
  if (plan.reArm.length > 0) {
    const created = await db.networkJob.createMany({
      data: plan.reArm.map((r) => ({
        kind: "STANDARD_TIMER",
        runAt: new Date(now.getTime() + RE_ARM_TIMER_MIN * 60_000),
        eventId: r.eventId,
        status: "PENDING",
      })),
    });
    reArmed = created.count;
  }

  return {
    uncovered: plan.reArm.length + plan.deferred + plan.unarmable.length,
    reArmed,
    deferred: plan.deferred,
    unarmable: plan.unarmable.length,
    skippedMassOutage: plan.skippedMassOutage,
    skippedPendingTimer: plan.skippedPendingTimer,
  };
}
