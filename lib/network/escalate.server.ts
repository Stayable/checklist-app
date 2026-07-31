import {
  NotificationChannel,
  NotificationStatus,
  TicketStatus,
} from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
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
// TWO CHANNELS, ON PURPOSE:
//   * a Teams post to the GENERAL channel — where the daily digest also lands,
//     so escalations sit alongside the portfolio view rather than in one
//     property's channel where only that manager looks;
//   * an email to the escalation contact — because the Power Automate webhook
//     cannot be verified to render a real @-mention (see buildEscalationMessage).
//     Kyle asked for Gerardo to be notified, and an email is a notification we
//     can actually stand behind. If the flow is later taught to mention him, the
//     email becomes redundant rather than wrong.
//
// Runs off the existing 1-minute network-timers cron, so worst-case latency to
// an escalation post is ~1 minute after the 4-hour mark.

/**
 * Who gets the escalation email. Overridable so this doesn't need a code change
 * when the on-call person changes; defaults to the address Kyle specified.
 */
const DEFAULT_ESCALATION_EMAIL = "gerardo@rentstayable.com";
const DEFAULT_ESCALATION_NAME = "Gerardo";

function escalationContact(): { email: string; name: string } {
  return {
    email: process.env.NETWORK_ESCALATION_EMAIL?.trim() || DEFAULT_ESCALATION_EMAIL,
    name: process.env.NETWORK_ESCALATION_NAME?.trim() || DEFAULT_ESCALATION_NAME,
  };
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
  emailed: number;
  emailFailed: number;
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

  const contact = escalationContact();
  const queued = isAnyTeamsWebhookConfigured();
  let escalated = 0;
  let emailed = 0;
  let emailFailed = 0;

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
      notifyName: contact.name,
      notifyEmail: contact.email,
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

      // Sent inline rather than queued: Resend is a single fast call, this runs
      // outside any transaction, and lib/email.ts never throws. Mirrors
      // lib/notify.server.ts's post-commit send.
      const mail = await sendEmail({
        to: contact.email,
        subject: title,
        text: body,
      });
      if (mail.ok) emailed += 1;
      else emailFailed += 1;

      await db.notificationLog.create({
        data: {
          userId: null,
          channel: NotificationChannel.EMAIL,
          status: mail.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
          error: mail.ok ? null : mail.error,
          event: "network_ticket_escalated",
          title,
          body,
          target: contact.email,
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

  return {
    escalated,
    remaining: Math.max(0, totalDue - escalated),
    emailed,
    emailFailed,
  };
}
