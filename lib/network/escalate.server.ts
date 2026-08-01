import {
  NotificationChannel,
  NotificationStatus,
  TicketStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { ESCALATION_THRESHOLD_HOURS, escalationCutoff } from "./escalation";
import { buildEscalationMessage } from "./teams-message";
import { GENERAL_TARGET, isAnyTeamsWebhookConfigured } from "./teams-routing";

// Realtime escalation notification (Kyle 2026-08-01).
//
// "But will have realtime update/sending notification when a ticket is Escalated
// -> and notify/tag Gerardo". Escalation was a computed badge until now; this
// turns the threshold crossing into an event that fires exactly once per ticket.
//
// TEAMS ONLY — NO EMAIL (Kyle, 2026-08-02).
//
// An earlier version also emailed the escalation contact, on the reasoning that a
// real Teams @-mention couldn't be verified from here so email was the delivery
// we could stand behind. Kyle's call is that escalation stays in Teams: "do not
// do email for gerardo". So this posts to the GENERAL channel and nothing else.
// General rather than the property's own channel because by the time a ticket has
// sat past the threshold, that property's channel has already had its chance.
//
// The post names the contact in plain text. Turning that into a real @-mention is
// Kyle's Monday task and needs the Power Automate flow to construct a mention
// entity — which is why the name is configurable here and why no code in this
// file claims to have tagged anybody.
//
// Runs off the existing 1-minute network-timers cron, so worst-case latency to
// an escalation post is ~1 minute after the 4-hour mark.

const DEFAULT_ESCALATION_NAME = "Gerardo";

function escalationName(): string {
  return process.env.NETWORK_ESCALATION_NAME?.trim() || DEFAULT_ESCALATION_NAME;
}

/**
 * Cap on announcements per sweep.
 *
 * Matters most on the very first run after deploy: `escalated_at` starts NULL
 * for every existing ticket, so every open ticket already past 4 hours is
 * "newly escalated" at once. Without a cap that is one burst of posts and
 * emails for backlog nobody is going to act on in the next minute anyway. With
 * it, the backlog drains a few per minute and stays legible; steady state never
 * approaches this number.
 */
const BATCH_LIMIT = 5;

export type EscalationSweepOutcome = {
  escalated: number;
  /** Open tickets past the threshold still awaiting announcement after this tick. */
  remaining: number;
};

function ticketUrl(ticketId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/network/tickets/${ticketId}`;
}

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

/**
 * Finds open tickets that have crossed the escalation threshold without being
 * announced, stamps them, and queues the notifications.
 *
 * Never throws — an escalation-notification failure must not break the ticket
 * timer sweep it shares a cron with. Same discipline as the Teams delivery
 * sweep: the tickets are the product, the notification is an accessory.
 */
export async function runEscalationSweep(now = new Date()): Promise<EscalationSweepOutcome> {
  const cutoff = escalationCutoff(now);
  const where = {
    status: { in: OPEN_STATUSES },
    escalatedAt: null,
    openedAt: { lt: cutoff },
  };

  const [due, totalDue] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: { openedAt: "asc" }, // oldest first — the worst offender is announced first
      take: BATCH_LIMIT,
      select: {
        id: true,
        ticketNumber: true,
        alertMessage: true,
        openedAt: true,
        property: { select: { name: true, shortCode: true } },
        device: { select: { name: true } },
      },
    }),
    db.ticket.count({ where }),
  ]);

  const notifyName = escalationName();
  const queued = isAnyTeamsWebhookConfigured();
  let escalated = 0;

  for (const ticket of due) {
    const ageHours = Math.floor((now.getTime() - ticket.openedAt.getTime()) / 3_600_000);
    const body = buildEscalationMessage({
      propertyName: ticket.property.name,
      propertyShortCode: ticket.property.shortCode,
      deviceName: ticket.device?.name ?? null,
      alertMessage: ticket.alertMessage ?? "—",
      openedAt: ticket.openedAt,
      ageHours,
      thresholdHours: ESCALATION_THRESHOLD_HOURS,
      ticketNumber: ticket.ticketNumber,
      ticketUrl: ticketUrl(ticket.id),
      notifyName,
    });
    const title = `⚠️ Escalated: ${ticket.ticketNumber} — ${ticket.property.shortCode} open ${ageHours} h`;

    try {
      // Claim-then-notify, in that order and conditionally on escalatedAt still
      // being null. Two overlapping cron invocations would otherwise both read
      // the same ticket and announce it twice; the stamp is the lock. A crash
      // between stamp and queue loses one notification, which is the right way
      // round — a missed post is recoverable by looking at the dashboard, a
      // duplicated page at 2 AM erodes trust in the whole alerting rail.
      const claim = await db.ticket.updateMany({
        where: { id: ticket.id, escalatedAt: null },
        data: { escalatedAt: now },
      });
      if (claim.count === 0) continue;
      escalated += 1;

      await db.notificationLog.create({
        data: {
          userId: null,
          channel: NotificationChannel.TEAMS,
          status: queued ? NotificationStatus.PENDING : NotificationStatus.SKIPPED,
          error: queued ? null : "teams_not_configured",
          event: "network_ticket_escalated",
          title,
          body,
          // Portfolio-wide, not the property's channel — escalation means the
          // property's own channel has already had its chance.
          target: GENERAL_TARGET,
          entityType: "ticket",
          entityId: ticket.id,
        },
      });
    } catch (err) {
      // Leave whatever was already stamped stamped: re-announcing on the next
      // tick is worse than losing one notification, and the ticket is still
      // visible as Escalated on the dashboard either way.
      console.error(
        `network-escalation: ticket ${ticket.ticketNumber} at ${formatInET(now)} failed`,
        err,
      );
    }
  }

  return { escalated, remaining: Math.max(0, totalDue - escalated) };
}
