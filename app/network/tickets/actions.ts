"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireNetworkAccess } from "@/lib/rbac";
import { downDurationMin } from "@/lib/network/ticketing";

// NETWORK ticket edit actions (Task 6). Manual edits are audit-logged only —
// no Teams posting here (Task 7 wires the automated notifications; this is
// the human-in-the-loop edit path on top of Tasks 3-5's automated pipeline).

export type TicketActionResult = { ok: true } | { ok: false; error: string };

const TERMINAL_STATUSES: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

const updateTicketSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.nativeEnum(TicketStatus),
  assignedTo: z.string().trim().max(200).nullable(),
  resolutionNotes: z.string().trim().max(4000).nullable(),
});

/**
 * Updates status/assignee/resolution notes on a ticket. If the ticket is
 * transitioning into a terminal status (RESOLVED/CLOSED) for the first time
 * (resolvedAt was null), stamps resolvedAt=now and — when the ticket has a
 * trigger event and no downDurationMin yet — computes it via the same
 * downDurationMin helper the automated recovery path uses
 * (lib/network/ticketing.ts), so a manually-closed ticket's duration is
 * consistent with an auto-resolved one. Audited; does not touch mass-outage
 * cascade logic (Tasks 4-5 own that automated path).
 */
export async function updateTicket(input: unknown): Promise<TicketActionResult> {
  const user = await requireNetworkAccess();
  const parsed = updateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ticketId, status, assignedTo, resolutionNotes } = parsed.data;

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  const now = new Date();
  const enteringTerminal =
    TERMINAL_STATUSES.includes(status) && !TERMINAL_STATUSES.includes(ticket.status);
  // Carried Task-6 Minor #2: a ticket manually reopened from RESOLVED/CLOSED
  // back to OPEN/IN_PROGRESS previously kept its stale `resolvedAt` +
  // `downDurationMin`, so the detail page could show "Status: OPEN" next to
  // a "Resolved:" timestamp from the prior terminal visit. Clear both on the
  // way out of a terminal status.
  const leavingTerminal =
    !TERMINAL_STATUSES.includes(status) && TERMINAL_STATUSES.includes(ticket.status);

  let resolvedAt = ticket.resolvedAt;
  let downMin = ticket.downDurationMin;
  if (enteringTerminal && !resolvedAt) {
    resolvedAt = now;
    if (downMin === null && ticket.triggerEventId) {
      const triggerEvent = await db.networkEvent.findUnique({
        where: { id: ticket.triggerEventId },
        select: { receivedAt: true },
      });
      if (triggerEvent) downMin = downDurationMin(triggerEvent.receivedAt, now);
    }
  } else if (leavingTerminal) {
    resolvedAt = null;
    downMin = null;
  }

  await db.$transaction(async (tx) => {
    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        assignedTo,
        resolutionNotes,
        resolvedAt,
        downDurationMin: downMin,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ticket",
        entityId: ticketId,
        action: "update_ticket",
        before: {
          status: ticket.status,
          assignedTo: ticket.assignedTo,
          resolutionNotes: ticket.resolutionNotes,
        },
        after: { status, assignedTo, resolutionNotes },
      },
    });
  });

  revalidatePath("/network");
  revalidatePath("/network/tickets");
  revalidatePath(`/network/tickets/${ticketId}`);
  return { ok: true };
}

const addNoteSchema = z.object({
  ticketId: z.string().uuid(),
  content: z.string().trim().min(1, "Note content is required.").max(4000),
});

/** Adds a MANUAL TicketNote (the TEAMS_REPLY source is Task 7's ingestion path). */
export async function addTicketNote(input: unknown): Promise<TicketActionResult> {
  const user = await requireNetworkAccess();
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ticketId, content } = parsed.data;

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!ticket) return { ok: false, error: "Ticket not found." };

  await db.$transaction(async (tx) => {
    await tx.ticketNote.create({
      data: {
        ticketId,
        source: "MANUAL",
        author: user.name || null,
        content,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ticket",
        entityId: ticketId,
        action: "add_ticket_note",
        after: { content },
      },
    });
  });

  revalidatePath(`/network/tickets/${ticketId}`);
  return { ok: true };
}
