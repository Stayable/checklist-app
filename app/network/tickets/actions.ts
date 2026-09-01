"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireNetworkAccess } from "@/lib/rbac";
import { networkScopeFor } from "@/lib/network/scope.server";
import { isInScope } from "@/lib/network/scope";
import { downDurationMin } from "@/lib/network/ticketing";
import { cascadeParentCloseIfDone } from "@/lib/network/ticketing.server";

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
 * consistent with an auto-resolved one. Audited.
 *
 * Cascade (Task 10 fix): if the ticket being closed is a STANDARD child of a
 * MASS_OUTAGE parent (`parentTicketId` set) and this edit is the one that
 * transitions it INTO a terminal status, `cascadeParentCloseIfDone` runs the
 * SAME sibling-check-and-resolve the automated recovery path
 * (`closeOpenTicketOnRecovery` in lib/network/ticketing.server.ts) already
 * runs — otherwise a manually-resolved last child would leave its
 * MASS_OUTAGE parent stranded IN_PROGRESS forever.
 */
export async function updateTicket(input: unknown): Promise<TicketActionResult> {
  const user = await requireNetworkAccess();
  const parsed = updateTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ticketId, status, assignedTo, resolutionNotes } = parsed.data;

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    include: { device: { select: { id: true, name: true, currentStatus: true } } },
  });
  // Same message for missing and out-of-scope: a distinct "not yours" would
  // confirm the ticket exists. Re-checked server-side rather than trusting the
  // page that rendered the form.
  if (!ticket || !isInScope(await networkScopeFor(user), ticket.propertyId)) {
    return { ok: false, error: "Ticket not found." };
  }

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
    if (downMin === null) {
      // Anchor on the trigger PROBLEM event when there is one, else on the
      // ticket's own openedAt. The trigger-event-only version left every
      // MASS_OUTAGE ticket (no trigger event by design) with a null duration,
      // which the Teams resolution post then printed as "0 min".
      let anchor = ticket.openedAt;
      if (ticket.triggerEventId) {
        const triggerEvent = await db.networkEvent.findUnique({
          where: { id: ticket.triggerEventId },
          select: { receivedAt: true },
        });
        if (triggerEvent) anchor = triggerEvent.receivedAt;
      }
      downMin = downDurationMin(anchor, now);
    }
  } else if (leavingTerminal) {
    resolvedAt = null;
    downMin = null;
  }

  // Closing a ticket on a device that is STILL DOWN used to strand it silently.
  // This action wrote Ticket + AuditLog and nothing else, and `decidePoll` emits
  // on transitions only — so offline -> offline never re-fires and the device sat
  // OFFLINE on the dashboard forever with nobody owning it. That is the largest
  // single contributor to the "offline devices > open tickets" gap.
  //
  // The reconciliation is NOT done here. `runReArmSweep` (lib/network/
  // reconcile.server.ts) already re-arms exactly this case on the next poll
  // tick, with the mass-outage, pending-timer and cap guards applied; doing it a
  // second time in this action would be a second ticket-creating authority that
  // can drift from the first. What this action owes is the TRAIL — so the tech
  // who closed it is told why a new ticket appears in ~7 minutes, instead of it
  // looking like the system ignored them.
  const strandedDevice =
    enteringTerminal && ticket.device !== null && ticket.device.currentStatus === "OFFLINE"
      ? ticket.device
      : null;

  await db.$transaction(async (tx) => {
    const updated = await tx.ticket.update({
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
        after: {
          status,
          assignedTo,
          resolutionNotes,
          // Recorded on the audit row too, not only in the note: a device that
          // keeps reappearing here is one somebody closes repeatedly without
          // fixing, and that pattern is only visible in the audit log.
          ...(strandedDevice ? { deviceStillOffline: true } : {}),
        },
      },
    });

    if (strandedDevice) {
      await tx.ticketNote.create({
        data: {
          ticketId,
          source: "MANUAL",
          author: "System",
          content:
            `Closed while ${strandedDevice.name} is still reported OFFLINE. ` +
            "The device has not recovered, so monitoring will re-open a ticket for it " +
            "within about 7 minutes. To stop that, bring the device back up — or, if it " +
            "has been decommissioned, remove it from UniFi so it stops being polled.",
        },
      });
    }

    if (enteringTerminal) {
      await cascadeParentCloseIfDone(tx, updated, now);
    }
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

  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, propertyId: true },
  });
  if (!ticket || !isInScope(await networkScopeFor(user), ticket.propertyId)) {
    return { ok: false, error: "Ticket not found." };
  }

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
