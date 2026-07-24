import {
  Device,
  NetworkEvent,
  Prisma,
  PrismaClient,
  Property,
  Ticket,
} from "@prisma/client";
import { etYYYYMMDD } from "../datetime";
import { formatTicketNumber } from "./ticket-number";
import { downDurationMin } from "./ticketing";
import { logTeamsTicketCreated, logTeamsTicketResolved } from "./teams-graph.server";

/**
 * A client capable of starting its OWN top-level transaction — i.e. the
 * top-level `db` singleton, not an interactive `Prisma.TransactionClient`
 * handed down from an enclosing `$transaction`. `createStandardTicket` needs
 * this so its P2002 retry runs against FRESH transaction state (see the
 * doc comment on `createStandardTicket` for why).
 */
type TransactableClient = Pick<PrismaClient, "$transaction">;

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/**
 * ET-daily sequence for TKT-YYYYMMDD-NNN (mirrors ADR-009's checklist system-
 * ID seq: restart at 001 each ET day). Uniqueness is enforced by the DB
 * `@unique` on Ticket.ticketNumber — the caller (createStandardTicket) retries
 * once on a P2002 collision rather than this function guaranteeing it.
 */
export async function allocateTicketNumber(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<string> {
  const prefix = `TKT-${etYYYYMMDD(now)}-`;
  const count = await tx.ticket.count({
    where: { ticketNumber: { startsWith: prefix } },
  });
  return formatTicketNumber(now, count + 1);
}

export async function hasOpenTicketForDevice(
  tx: Prisma.TransactionClient,
  deviceId: string,
): Promise<boolean> {
  const count = await tx.ticket.count({
    where: { deviceId, status: { in: [...OPEN_STATUSES] } },
  });
  return count > 0;
}

/**
 * Creates a STANDARD ticket for a device that's still down TICKET_TIMER_MIN
 * after its triggering PROBLEM event, links the event, flips the device
 * OFFLINE, and logs the (currently degraded) Teams notification.
 *
 * Retries the ticket-number allocation once on a P2002 unique-constraint
 * collision (concurrent timer firing / race), mirroring the
 * attemptCreate retry pattern in app/checklists/new/actions.ts.
 *
 * IMPORTANT: this takes a top-level `db`-shaped client (able to start its
 * own `$transaction`), NOT an interactive `Prisma.TransactionClient` handed
 * down from an enclosing transaction. Each attempt (allocate + insert +
 * link event + flip device + Teams log) runs in its OWN fresh transaction.
 * Postgres aborts an entire transaction on any error inside it (SQLSTATE
 * 25P02) — if the caller instead ran this whole function inside ITS OWN
 * outer `$transaction` and attempt #1 threw P2002, attempt #2's
 * `allocateTicketNumber` (a `tx.ticket.count`) would run against that
 * already-poisoned transaction and itself throw "current transaction is
 * aborted", silently swallowing the intended retry. Giving each attempt a
 * brand-new transaction means a P2002 on attempt 1 can never poison
 * attempt 2.
 */
export async function createStandardTicket(
  db: TransactableClient,
  params: {
    device: Pick<Device, "id">;
    property: Pick<Property, "id" | "shortCode" | "teamsChannelName">;
    triggerEvent: Pick<NetworkEvent, "id" | "alertMessage">;
    now: Date;
  },
): Promise<Ticket> {
  const { device, property, triggerEvent, now } = params;

  async function attempt(retrying: boolean): Promise<Ticket> {
    try {
      return await db.$transaction(async (tx) => {
        const ticketNumber = await allocateTicketNumber(tx, now);
        const ticket = await tx.ticket.create({
          data: {
            ticketNumber,
            deviceId: device.id,
            propertyId: property.id,
            triggerEventId: triggerEvent.id,
            alertMessage: triggerEvent.alertMessage,
            status: "OPEN",
            ticketType: "STANDARD",
            openedAt: now,
          },
        });

        await tx.networkEvent.update({
          where: { id: triggerEvent.id },
          data: { ticketId: ticket.id },
        });
        await tx.device.update({
          where: { id: device.id },
          data: { currentStatus: "OFFLINE" },
        });

        await logTeamsTicketCreated(tx, ticket, property);

        return ticket;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        !retrying
      ) {
        // Fresh transaction for the retry — attempt 1's abort can't leak in.
        return attempt(true);
      }
      throw err;
    }
  }

  return attempt(false);
}

/**
 * Closes the device's most recent open ticket (OPEN/IN_PROGRESS) on
 * recovery, if one exists. No-op (returns null) when the device has no open
 * ticket — e.g. it self-resolved before the 5-minute timer ever fired one.
 *
 * Down-duration is computed from the ticket's triggering PROBLEM event's
 * server-trustworthy `receivedAt` (falling back to the ticket's `openedAt`
 * if the trigger event is somehow missing) to `now`.
 */
export async function closeOpenTicketOnRecovery(
  tx: Prisma.TransactionClient,
  params: {
    device: Pick<Device, "id">;
    recoveryEvent: Pick<NetworkEvent, "id">;
    now: Date;
  },
): Promise<Ticket | null> {
  const ticket = await tx.ticket.findFirst({
    where: {
      deviceId: params.device.id,
      status: { in: [...OPEN_STATUSES] },
    },
    orderBy: { openedAt: "desc" },
  });
  if (!ticket) return null;

  let problemReceivedAt = ticket.openedAt;
  if (ticket.triggerEventId) {
    const triggerEvent = await tx.networkEvent.findUnique({
      where: { id: ticket.triggerEventId },
      select: { receivedAt: true },
    });
    if (triggerEvent) problemReceivedAt = triggerEvent.receivedAt;
  }

  const resolved = await tx.ticket.update({
    where: { id: ticket.id },
    data: {
      status: "RESOLVED",
      resolvedAt: params.now,
      downDurationMin: downDurationMin(problemReceivedAt, params.now),
    },
  });

  const property = await tx.property.findUnique({
    where: { id: resolved.propertyId },
    select: { shortCode: true, teamsChannelName: true },
  });
  if (property) {
    await logTeamsTicketResolved(tx, resolved, property);
  }

  return resolved;
}
