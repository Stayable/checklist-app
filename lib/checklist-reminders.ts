import { InstanceStatus } from "@prisma/client";

// ADR-037 due-time reminders — the SELECTION half.
//
// Kyle's spec (2026-09-09): "Reminders before the Required time (1 hour before)
// and on the deadline", to the PM group chat on Teams AND to the person who has
// to do the checklist.
//
// Everything in this file is PURE: it takes `now` plus plain rows and returns
// which rows need which reminder. No database, no clock, no network. That is
// deliberate — the cron fires every 15 minutes, so the cost of getting the
// windows wrong is either a silent miss or a repeating spam loop, and neither
// is something you want to discover in production. The route
// (app/api/cron/checklist-reminders/route.ts) is a thin shell around this.
//
// WHY THE STAMPS ARE THE IDEMPOTENCY GUARD. `remindedBeforeAt` / `remindedDueAt`
// are set only after a reminder is actually delivered, so "already reminded" is
// a fact about a send rather than about a run. A 15-minute cron re-reads the
// same rows four times an hour; without the stamps, a checklist due at 4 PM
// would email its assignee at 3:00, 3:15, 3:30 and 3:45.

/** A `dueAt` this far ahead or nearer earns the "due in 1 hour" reminder. */
export const DUE_SOON_WINDOW_MINUTES = 60;

/**
 * How far back an overdue checklist can be and still earn a `due_now` reminder.
 *
 * WHY THIS EXISTS. `remindedDueAt` is null on every row that predates the
 * column, so without a floor the first run after deploy would treat the entire
 * history of overdue checklists as "never reminded" and blast one email per row
 * plus a Teams card listing all of them. Twelve hours means a reminder is only
 * ever sent while the work could still plausibly be done today — an overdue
 * item from last Tuesday is a reporting problem for the digest, not something
 * to page a housekeeper about.
 *
 * Rows outside the floor stay unstamped forever, which is correct: they were
 * never reminded and we are choosing not to. Nothing re-reads the stamp as
 * "was this checklist late".
 */
export const OVERDUE_BACKLOG_CUTOFF_HOURS = 12;

/**
 * Statuses that still represent outstanding work, as an EXPLICIT allow-list.
 *
 * ⚠ Prisma `in:` lists silently EXCLUDE a new enum value and `notIn:` lists
 * silently INCLUDE it — this repo pins that behaviour with a test, and it is
 * why the stayover work added no new `InstanceStatus`. An allow-list therefore
 * fails in the safe direction: a future status is not reminded until someone
 * adds it here on purpose. A `notIn` of the closed statuses would start
 * emailing people about a status nobody had considered, with a clean typecheck.
 *
 * SUBMITTED / REVIEWED / FLAGGED are all "the work was done" — FLAGGED means a
 * manager wants follow-up on a submission that exists, not that the deadline
 * was missed. INVALIDATED work was cancelled. EXPIRED already missed its
 * window and being told so is noise.
 */
export const REMINDABLE_STATUSES = [
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
] as const;

export type RemindableStatus = (typeof REMINDABLE_STATUSES)[number];

export function isRemindableStatus(status: InstanceStatus): status is RemindableStatus {
  return (REMINDABLE_STATUSES as readonly InstanceStatus[]).includes(status);
}

/** Which of the two reminders a row has earned. */
export type ReminderKind = "due_soon" | "due_now";

/**
 * The minimum a row must carry to be judged. Callers select more columns for
 * the message itself; the generic below keeps those on the returned rows.
 */
export interface RemindableInstance {
  id: string;
  /** Null means no deadline, which means no reminder. See `selectReminders`. */
  dueAt: Date | null;
  status: InstanceStatus;
  remindedBeforeAt: Date | null;
  remindedDueAt: Date | null;
}

export interface ReminderSelection<T> {
  /** Due within the next hour, not yet passed, never warned. */
  dueSoon: T[];
  /** Deadline passed within the backlog window, never chased. */
  dueNow: T[];
}

/**
 * The half-open time band a row's `dueAt` must fall in to be worth loading.
 *
 * Exported so the cron's SQL can narrow on the same numbers this function
 * judges by, instead of pulling every open instance in the portfolio. The SQL
 * is a NARROWING ONLY — it must never be the thing that decides, because then
 * the rules would live in two places and the tests would only cover one of them.
 */
export function reminderWindow(now: Date): { backlogFloor: Date; soonHorizon: Date } {
  return {
    backlogFloor: new Date(now.getTime() - OVERDUE_BACKLOG_CUTOFF_HOURS * 60 * 60 * 1000),
    soonHorizon: new Date(now.getTime() + DUE_SOON_WINDOW_MINUTES * 60 * 1000),
  };
}

/**
 * Split rows into the two reminder buckets.
 *
 * The two are mutually exclusive by construction: `due_soon` requires
 * `dueAt > now` and `due_now` requires `dueAt <= now`. A deadline landing
 * exactly on `now` counts as `due_now` — "it is due" is the more useful thing
 * to say at that instant than "it is due soon".
 *
 * All arithmetic is on absolute instants (UTC millis), so this is DST-agnostic:
 * "one hour before" stays 3,600,000 ms across the March and November
 * transitions, which is what a person waiting on a deadline experiences. ET
 * only enters when a time is FORMATTED for a human, which happens in the route.
 *
 * A row whose deadline has already passed never earns `due_soon`, even if it
 * was never warned — the warning would be a lie. It simply goes to `due_now`
 * and `remindedBeforeAt` stays null, permanently and harmlessly.
 */
export function selectReminders<T extends RemindableInstance>(
  instances: readonly T[],
  now: Date,
): ReminderSelection<T> {
  const { backlogFloor, soonHorizon } = reminderWindow(now);
  const nowMs = now.getTime();

  const dueSoon: T[] = [];
  const dueNow: T[] = [];

  for (const instance of instances) {
    // No deadline, no reminder. Deliberate, and not an oversight to "fix" by
    // falling back to end-of-day: most instances are created without a `dueAt`,
    // and inventing one would turn a quiet backlog into a daily broadcast.
    if (instance.dueAt === null) continue;
    if (!isRemindableStatus(instance.status)) continue;

    const dueMs = instance.dueAt.getTime();

    if (dueMs > nowMs) {
      if (dueMs <= soonHorizon.getTime() && instance.remindedBeforeAt === null) {
        dueSoon.push(instance);
      }
      continue;
    }

    // Past the deadline. The floor is inclusive of its own edge so a row that
    // lands exactly 12h overdue between two ticks is chased rather than lost.
    if (dueMs >= backlogFloor.getTime() && instance.remindedDueAt === null) {
      dueNow.push(instance);
    }
  }

  return { dueSoon, dueNow };
}
