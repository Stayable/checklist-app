import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decideTimerAction } from "@/lib/network/ticketing";
import { createStandardTicket, hasOpenTicketForDevice } from "@/lib/network/ticketing.server";
import { runMassOutageCheck } from "@/lib/network/mass-outage.server";
import { deliverPendingTeamsNotifications } from "@/lib/network/teams-deliver.server";
import { runEscalationSweep } from "@/lib/network/escalate.server";
import { TEAMS_PROPERTY_SELECT } from "@/lib/network/teams-config";

// Standard ticket-timer sweep (DevSpec §5.2) + mass-outage resolution sweep
// (DevSpec §5.5). Vercel Cron fires this every minute (vercel.json) to poll
// PENDING NetworkJob rows whose deadline (`runAt`) has passed (D2 — DB-backed
// timer, no Redis/BullMQ; ~1-min granularity on a 5-/10-min SLA is
// acceptable) — STANDARD_TIMER (5-min standard-ticket threshold) and
// MASS_OUTAGE_CHECK (10-min mass-outage resolution check) jobs both land
// here (Task 5).
//
// Auth mirrors app/api/cron/generate-checklists/route.ts: fail-closed in
// production when CRON_SECRET is unset, dev-open otherwise.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type JobOutcome = "created" | "skipped" | "noop";

/**
 * Evaluates and resolves a single STANDARD_TIMER job.
 *
 * Deliberately does NOT wrap this whole function in one outer
 * `db.$transaction` (as an earlier version did). `createStandardTicket`
 * retries once on a ticketNumber P2002 collision, and that retry needs a
 * FRESH transaction to run in — Postgres aborts an entire transaction on
 * any error inside it (SQLSTATE 25P02), so if the retry's
 * `allocateTicketNumber` count query ran on the same outer `tx` that just
 * saw attempt #1's P2002, it would itself throw "current transaction is
 * aborted" and the whole job would silently fail closed (leaving the job
 * PENDING for next-minute retry instead of succeeding this tick). The
 * read-only checks here (`hasOpenTicketForDevice`, event/device lookup) run
 * directly against `db`; `createStandardTicket` owns its own per-attempt
 * transaction internally. If ticket creation throws (e.g. both attempts
 * collide), this function throws too and the job is correctly left PENDING
 * by the caller's try/catch — no partial state, no job marked DONE without
 * a ticket.
 */
async function processJob(jobId: string, eventId: string | null): Promise<JobOutcome> {
  if (!eventId) {
    // Nothing to evaluate against — mark DONE, not worth retrying forever.
    await db.networkJob.update({ where: { id: jobId }, data: { status: "DONE" } });
    return "noop";
  }

  const event = await db.networkEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      alertMessage: true,
      resolvedByEventId: true,
      device: { select: { id: true } },
      property: { select: TEAMS_PROPERTY_SELECT },
    },
  });

  if (!event?.device || !event.property) {
    await db.networkJob.update({ where: { id: jobId }, data: { status: "DONE" } });
    return "noop";
  }

  const hasOpenTicket = await hasOpenTicketForDevice(db, event.device.id);
  const problemResolved = event.resolvedByEventId != null;
  const action = decideTimerAction({ hasOpenTicket, problemResolved });

  if (action === "CREATE_TICKET") {
    await createStandardTicket(db, {
      device: event.device,
      property: event.property,
      triggerEvent: { id: event.id, alertMessage: event.alertMessage },
      now: new Date(),
    });
  }

  await db.networkJob.update({ where: { id: jobId }, data: { status: "DONE" } });
  return action === "CREATE_TICKET" ? "created" : "skipped";
}

async function run() {
  const now = new Date();
  const jobs = await db.networkJob.findMany({
    where: {
      status: "PENDING",
      kind: { in: ["STANDARD_TIMER", "MASS_OUTAGE_CHECK"] },
      runAt: { lte: now },
    },
    orderBy: { runAt: "asc" },
  });

  let processed = 0;
  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    processed++;
    try {
      if (job.kind === "MASS_OUTAGE_CHECK") {
        // runMassOutageCheck owns marking its own job DONE (including its
        // early-return "ticket missing/already resolved" paths) — see its
        // doc comment. Nothing else to do here on success.
        await runMassOutageCheck(db, { id: job.id, ticketId: job.ticketId });
      } else {
        const outcome = await processJob(job.id, job.eventId);
        if (outcome === "created") created++;
        else skipped++;
      }
    } catch (err) {
      // Leave the job PENDING so next minute's cron retries it. Never throw
      // out of run() — one bad job must not block the rest of the sweep.
      console.error(`network-timers: job ${job.id} failed`, err);
    }
  }

  return { processed, created, skipped };
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await run();

  // Escalation sweep (Kyle 2026-08-01). BEFORE the delivery sweep, so a ticket
  // that escalates on this tick is also posted on this tick rather than waiting
  // a further minute. Own try/catch for the same reason as Teams below.
  let escalation;
  try {
    escalation = await runEscalationSweep(new Date());
  } catch (err) {
    console.error("network-timers: escalation sweep failed", err);
    escalation = { escalated: 0, remaining: 0, emailed: 0, emailFailed: 0, error: true };
  }

  // Deliver Teams notifications queued by the lifecycle transactions that just
  // committed (theirs, or an earlier tick's). Runs after `run()` and in its own
  // try/catch so a Teams outage can never affect ticket-timer processing — the
  // tickets are the product, the notification is an accessory.
  let teams;
  try {
    teams = await deliverPendingTeamsNotifications();
  } catch (err) {
    console.error("network-timers: teams delivery sweep failed", err);
    teams = { configured: true, attempted: 0, sent: 0, failed: 0, rerouted: 0, error: true };
  }

  const outcome = { ok: true, ...result, escalation, teams };
  console.log("[network-timers]", JSON.stringify(outcome));
  return NextResponse.json(outcome);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
