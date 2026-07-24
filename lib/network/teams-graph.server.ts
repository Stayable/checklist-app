import { NotificationChannel, NotificationStatus, Prisma, Ticket, Property } from "@prisma/client";

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
