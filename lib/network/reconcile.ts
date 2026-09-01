// Offline-device reconciliation (the "24 offline, 21 open tickets" gap).
//
// The ticket pipeline is TRANSITIONS-ONLY. `decidePoll` emits a PROBLEM event
// when a device crosses ONLINE -> OFFLINE and never again; from then on the
// ticket is the only thing tracking that device. So any path that destroys the
// ticket without restoring the device to ONLINE strands it permanently: it is
// OFFLINE on the dashboard, nobody owns it, and no future poll will ever
// re-fire, because offline -> offline is not a transition.
//
// Three such paths were found in production (2026-08-31):
//
//   A. A tech resolves a ticket by hand on a still-down device.
//      app/network/tickets/actions.ts writes Ticket + AuditLog and nothing else.
//   C. A device FIRST SEEN offline whose PROBLEM ingest throws. The inventory
//      upsert had already written currentStatus: OFFLINE, so the next tick sees
//      no transition. (Fixed at the root in unifi-poll.server.ts by ingesting
//      events before writing inventory; this module still catches the rows that
//      were stranded before that fix.)
//   D. runMassOutageCheck marks its job DONE even when a child ticket throws.
//
// Rather than patch each one and hope the fourth never appears, this module is
// a RECONCILIATION PASS: every tick, look at what is actually offline, subtract
// everything that is already covered, and re-arm the standard 5-minute timer for
// the remainder. It is a function of present state, not of event history, so it
// closes the class of bug and not just the three instances.
//
// Pure: no Prisma, no clock, no I/O. The server layer (reconcile.server.ts)
// gathers the state and applies the plan. `uncoveredOfflineDevices` is exported
// on its own because the /network dashboard shows the SAME set as a card — one
// definition of "offline and unowned", so the number on the screen and the
// backlog the reconciler works from cannot drift apart.

import { TICKET_TIMER_MIN } from "./mass-outage";

/**
 * How many devices one tick may re-arm.
 *
 * Ten. The reconciler is a backstop for stragglers, not a bulk importer. Ten
 * tickets is a page of work a tech can triage in one sitting; more than that
 * appearing in a single 2-minute tick is a systemic condition — a console
 * re-homing, a bad deploy, an estate-wide outage — and a human should look at
 * it before the system opens two hundred tickets nobody reads. Anything over
 * the cap is not dropped: it is counted in `deferred` and re-offered next tick,
 * so a real backlog still drains (10 per 2 min = 300/hour) and the cap being
 * hit is visible in the poll outcome rather than silent.
 *
 * Note this is deliberately ABOVE the mass-outage threshold (5 devices at one
 * property in 120s). A genuine simultaneous outage is already rolled up by the
 * mass-outage path and is excluded from this pass entirely; the cap is not the
 * storm guard, the mass-outage exclusion is. The cap guards against a stranded
 * BACKLOG being flushed all at once.
 */
export const RE_ARM_CAP_PER_TICK = 10;

/** Minutes of grace a re-armed timer gets before it may open a ticket. */
export const RE_ARM_TIMER_MIN = TICKET_TIMER_MIN;

/** Device status as the reconciler cares about it. Mirrors DeviceStatus. */
export type ReconcileStatus = "ONLINE" | "OFFLINE" | "UNKNOWN";

/** One device as the reconciler sees it, with the state needed to decide. */
export type ReconcileDevice = {
  deviceId: string;
  propertyId: string;
  status: ReconcileStatus;
  /**
   * The most recent PROBLEM event for this device with no linked RECOVERY, or
   * null when the device has no such event on record. A STANDARD_TIMER job is
   * keyed to an event (NetworkJob.eventId), and the cron resolves the device
   * through it, so a device with no open PROBLEM event has nothing to arm.
   */
  openProblemEventId: string | null;
  /** Oldest-first ordering key, so the backlog drains deterministically. */
  offlineSince: Date;
};

export type ReconcileInput = {
  devices: ReconcileDevice[];
  /** Devices already named by an OPEN/IN_PROGRESS ticket. */
  deviceIdsWithOpenTicket: Iterable<string>;
  /** Properties with an open MASS_OUTAGE ticket (includes MONITORING BLIND). */
  propertyIdsWithOpenMassOutage: Iterable<string>;
};

export type ReArmInput = ReconcileInput & {
  /** Devices with a PENDING STANDARD_TIMER job — the legitimate 5-7 min window. */
  deviceIdsWithPendingTimer: Iterable<string>;
  cap?: number;
};

export type ReArmPlan = {
  /** Timers to create, oldest-offline first, at most `cap` of them. */
  reArm: { deviceId: string; propertyId: string; eventId: string }[];
  /**
   * Offline and unowned, but with no open PROBLEM event to hang a timer on.
   * Counted, never fabricated: inventing a PROBLEM event would land inside the
   * mass-outage 120s window and could manufacture a fake cluster out of rows
   * that have been stranded for days. These are reported so the gap stays
   * visible instead of being papered over.
   */
  unarmable: string[];
  /** Over the cap this tick; re-offered next tick. */
  deferred: number;
  /** Skipped because their property is under an open MASS_OUTAGE ticket. */
  skippedMassOutage: number;
  /** Skipped because a STANDARD_TIMER is already pending (cause #1). */
  skippedPendingTimer: number;
};

/**
 * Devices that are offline and NOT covered by anything.
 *
 * "Covered" means one of:
 *   - a ticket of its own is OPEN or IN_PROGRESS, or
 *   - its property has an open MASS_OUTAGE ticket.
 *
 * The mass-outage exclusion is property-level on purpose. A MASS_OUTAGE ticket
 * is the rollup that exists precisely so 40 devices at one property do not
 * produce 40 tickets, and `openBlindTicket` uses the same type for a console we
 * cannot see. In both cases the devices underneath are already someone's
 * problem, and re-ticketing them individually would recreate the storm the
 * rollup was built to prevent.
 *
 * UNKNOWN devices are excluded, not merely absent: monitoring-blind gear is not
 * known to be down, and a ticket saying otherwise would be a fabricated outage
 * (N4). The server layer also filters on OFFLINE in SQL; this is the belt to
 * that braces, and it is the part that can be unit-tested.
 */
export function uncoveredOfflineDevices(input: ReconcileInput): ReconcileDevice[] {
  const ticketed = new Set(input.deviceIdsWithOpenTicket);
  const massOutage = new Set(input.propertyIdsWithOpenMassOutage);

  return input.devices
    .filter((d) => d.status === "OFFLINE")
    .filter((d) => !ticketed.has(d.deviceId))
    .filter((d) => !massOutage.has(d.propertyId))
    .sort((a, b) => a.offlineSince.getTime() - b.offlineSince.getTime());
}

/**
 * Turns present state into the timers to create this tick.
 *
 * Idempotent by construction: a device it re-arms this tick has a PENDING
 * STANDARD_TIMER next tick, which puts it in `deviceIdsWithPendingTimer` and
 * out of the plan. Running the sweep twice in a row therefore produces one
 * timer, not two — and the same exclusion is what keeps it off a device that is
 * merely inside the legitimate 5-7 minute detection window.
 */
export function planReArm(input: ReArmInput): ReArmPlan {
  const cap = input.cap ?? RE_ARM_CAP_PER_TICK;
  const pending = new Set(input.deviceIdsWithPendingTimer);
  const ticketed = new Set(input.deviceIdsWithOpenTicket);
  const massOutage = new Set(input.propertyIdsWithOpenMassOutage);

  let skippedMassOutage = 0;
  let skippedPendingTimer = 0;

  const candidates = input.devices
    .filter((d) => d.status === "OFFLINE")
    .filter((d) => {
      if (ticketed.has(d.deviceId)) return false;
      if (massOutage.has(d.propertyId)) {
        skippedMassOutage += 1;
        return false;
      }
      if (pending.has(d.deviceId)) {
        skippedPendingTimer += 1;
        return false;
      }
      return true;
    })
    .sort((a, b) => a.offlineSince.getTime() - b.offlineSince.getTime());

  const armable = candidates.filter((d) => d.openProblemEventId !== null);
  const unarmable = candidates.filter((d) => d.openProblemEventId === null).map((d) => d.deviceId);

  return {
    reArm: armable.slice(0, cap).map((d) => ({
      deviceId: d.deviceId,
      propertyId: d.propertyId,
      eventId: d.openProblemEventId as string,
    })),
    unarmable,
    deferred: Math.max(0, armable.length - cap),
    skippedMassOutage,
    skippedPendingTimer,
  };
}
