import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
  Ticket,
  Property,
} from "@prisma/client";

/**
 * The mass-outage functions (Task 5) are called from `runMassOutageCheck`,
 * which — per the Task 4 fresh-tx lesson — runs its DB calls directly
 * against the top-level `db` singleton rather than inside one enclosing
 * `$transaction` (so `createStandardTicket`'s own per-attempt retry never
 * inherits a poisoned transaction). So these two accept either a top-level
 * `PrismaClient` or an interactive `Prisma.TransactionClient`, unlike the
 * two ticket-lifecycle loggers above which are always called from within an
 * existing transaction.
 */
type AnyClient = PrismaClient | Prisma.TransactionClient;

// Teams posting degradation seam (Task 4 stub; Task 7 wires the real
// Microsoft Graph call). Until Graph creds land, ticket lifecycle events are
// logged-only via a SKIPPED NotificationLog row — same graceful-degradation
// pattern as the unconfigured-Resend path in lib/notify.server.ts. Task 7
// replaces these bodies with a real Microsoft Graph channel-message post and
// captures the resulting teamsMessageId/teamsMessageUrl back onto the Ticket;
// nothing here should need to change shape-wise for callers when that lands.

function target(property: Pick<Property, "teamsChannelName" | "shortCode">): string {
  return property.teamsChannelName ?? property.shortCode;
}

export async function logTeamsTicketCreated(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, "id" | "ticketNumber" | "alertMessage">,
  property: Pick<Property, "teamsChannelName" | "shortCode">,
): Promise<void> {
  await tx.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: NotificationStatus.SKIPPED,
      event: "network_ticket_created",
      title: `Ticket ${ticket.ticketNumber} created — ${property.shortCode}`,
      body: ticket.alertMessage,
      target: target(property),
      entityType: "ticket",
      entityId: ticket.id,
    },
  });
}

export async function logTeamsTicketResolved(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, "id" | "ticketNumber" | "alertMessage">,
  property: Pick<Property, "teamsChannelName" | "shortCode">,
): Promise<void> {
  await tx.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: NotificationStatus.SKIPPED,
      event: "network_ticket_resolved",
      title: `Ticket ${ticket.ticketNumber} resolved — ${property.shortCode}`,
      body: ticket.alertMessage,
      target: target(property),
      entityType: "ticket",
      entityId: ticket.id,
    },
  });
}

/** Mass-outage ticket created (spec §5.5). Task 7 replaces with real Graph. */
export async function logTeamsMassOutageCreated(
  db: AnyClient,
  ticket: Pick<Ticket, "id" | "ticketNumber" | "alertMessage">,
  property: Pick<Property, "teamsChannelName" | "shortCode">,
): Promise<void> {
  await db.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: NotificationStatus.SKIPPED,
      event: "network_mass_outage",
      title: `Mass outage ${ticket.ticketNumber} — ${property.shortCode}`,
      body: ticket.alertMessage,
      target: target(property),
      entityType: "ticket",
      entityId: ticket.id,
    },
  });
}

/**
 * Mass-outage 10-minute resolution check result (spec §5.5). Task 7
 * replaces with real Graph.
 */
export async function logTeamsMassOutageCheck(
  db: AnyClient,
  ticket: Pick<Ticket, "id" | "ticketNumber">,
  property: Pick<Property, "teamsChannelName" | "shortCode">,
  summary: { recoveredNames: string[]; stillOfflineNames: string[] },
): Promise<void> {
  const body =
    `Recovered: ${summary.recoveredNames.length ? summary.recoveredNames.join(", ") : "none"} | ` +
    `Still offline: ${summary.stillOfflineNames.length ? summary.stillOfflineNames.join(", ") : "none"}`;

  await db.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: NotificationStatus.SKIPPED,
      event: "network_mass_outage_check",
      title: `Mass outage check ${ticket.ticketNumber} — ${property.shortCode}`,
      body,
      target: target(property),
      entityType: "ticket",
      entityId: ticket.id,
    },
  });
}
