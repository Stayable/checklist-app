import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { postTeamsWebhook } from "./teams-webhook";
import {
  GENERAL_TARGET,
  isAnyTeamsWebhookConfigured,
  resolveTeamsWebhook,
} from "./teams-routing";

// Post-commit delivery of queued Teams notifications (2026-07-27).
//
// lib/network/teams-graph.server.ts writes a PENDING TEAMS row inside the
// ticket-lifecycle transaction; this sweep, driven by the existing 1-minute
// cron, delivers it after that transaction has committed and settles the row
// to SENT or FAILED.
//
// Why a queue rather than posting at the call site: the call sites run inside
// Prisma transactions, and an outbound HTTP call inside a transaction holds it
// open across a third-party round trip — and a rollback could never unsend the
// message. Queueing also buys retry and an honest audit trail for free, and
// matches the DB-backed-timer approach already chosen for this epic (no Redis,
// poll from cron).

/** How many queued messages one sweep will attempt. */
const BATCH_LIMIT = 20;

export type TeamsDeliveryOutcome = {
  configured: boolean;
  attempted: number;
  sent: number;
  failed: number;
  /** Posts that went to General because their property channel wasn't set. */
  rerouted: number;
};

export async function deliverPendingTeamsNotifications(): Promise<TeamsDeliveryOutcome> {
  if (!isAnyTeamsWebhookConfigured()) {
    return { configured: false, attempted: 0, sent: 0, failed: 0, rerouted: 0 };
  }

  const pending = await db.notificationLog.findMany({
    where: { channel: NotificationChannel.TEAMS, status: NotificationStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: BATCH_LIMIT,
    // `target` carries the routing key ("GENERAL" or a property short code),
    // resolved to a URL here rather than stored — see teams-routing.ts on why
    // the signed URL never enters the database.
    select: { id: true, title: true, body: true, target: true },
  });

  let sent = 0;
  let failed = 0;
  let rerouted = 0;

  for (const row of pending) {
    // Claim the row BEFORE posting. Two overlapping cron invocations would
    // otherwise both read the same PENDING row and post it twice; a Teams
    // channel duplicate is cheap but confusing during an outage, when message
    // order is how someone reconstructs what happened. Losing the claim means
    // another sweep already took it.
    const claim = await db.notificationLog.updateMany({
      where: { id: row.id, status: NotificationStatus.PENDING },
      data: { status: NotificationStatus.SENT },
    });
    if (claim.count === 0) continue;

    // A row with no target predates per-channel routing; treat it as General
    // rather than dropping it, since that is the channel it would have gone to
    // under the single-URL scheme.
    const destination = resolveTeamsWebhook(row.target ?? GENERAL_TARGET);

    if (!destination) {
      failed += 1;
      await db.notificationLog.update({
        where: { id: row.id },
        data: {
          status: NotificationStatus.FAILED,
          error: `teams_target_not_configured:${row.target ?? GENERAL_TARGET}`,
        },
      });
      continue;
    }

    const result = await postTeamsWebhook(destination.url, row.title, row.body ?? "");

    if (result.ok) {
      sent += 1;
      if (destination.rerouted) {
        rerouted += 1;
        // Record the reroute on the row itself. `status` stays SENT because it
        // genuinely was sent — but a reader asking "why did KE's alert appear
        // in General?" gets the answer from the row instead of guessing.
        await db.notificationLog.update({
          where: { id: row.id },
          data: { error: `rerouted_to_general_from:${row.target}` },
        });
      }
      continue;
    }

    // Settle to FAILED rather than back to PENDING: the webhook returns 202
    // for anything it accepts, so a non-2xx is a real rejection (bad URL,
    // regenerated signature, malformed body) that retrying on a 1-minute loop
    // would just repeat forever. A FAILED row with the reason is the honest
    // record and is visible for a human to act on.
    failed += 1;
    await db.notificationLog.update({
      where: { id: row.id },
      data: { status: NotificationStatus.FAILED, error: result.error },
    });
  }

  return { configured: true, attempted: pending.length, sent, failed, rerouted };
}
