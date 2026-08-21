"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus, InvalidationReason } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessProperty, requireUser } from "@/lib/rbac";
import {
  canDecideInvalidation,
  closesImmediately,
  decideClose,
  type CloseDenial,
} from "@/lib/invalidation";
import { deliverNotificationEmail, logNotification } from "@/lib/notify.server";
import { roomDisplay } from "@/lib/room-label";

// Closing out an assignment that stopped being needed or doable.
//
// ADR-014 as amended 2026-08-22: reasons that are facts about the ROOM close
// immediately; reasons that are facts about the PERSON file a request a manager
// decides. Every path writes audit_log — immediate closure skips the wait, not
// the record. lib/invalidation.ts owns the decision so it is unit-testable; this
// file owns the database and the notifications.

export type InvalidateResult = { ok: true; closed: boolean } | { ok: false; error: string };

const requestSchema = z.object({
  instanceId: z.string().uuid(),
  reasonCode: z.nativeEnum(InvalidationReason),
  // A note is mandatory in every case, including a stayover: "Stayover" alone
  // does not say which guest or until when, and this row is the only record
  // that the scheduled work was deliberately dropped.
  note: z.string().trim().min(1, "Add a short note.").max(500),
});

const DENIAL_MESSAGE: Record<CloseDenial, string> = {
  locked: "This checklist has been verified and locked. An admin must unlock it first.",
  not_open: "This checklist has already been submitted or closed.",
  already_requested: "A request is already waiting for a manager on this checklist.",
  not_yours: "You can only close a checklist assigned to you.",
};

/** Shape both the instance fetch and the notification label need. */
const instanceSelect = {
  id: true,
  status: true,
  propertyId: true,
  assignedUserId: true,
  lockedAt: true,
  invalidationRequestedAt: true,
  invalidationRequestedByUserId: true,
  invalidationReason: true,
  invalidationReasonCode: true,
  scheduledFor: true,
  title: true,
  roomLabel: true,
  template: { select: { name: true } },
  property: { select: { shortCode: true } },
  room: { select: { roomNumber: true } },
  assignedUser: { select: { id: true, email: true, locale: true } },
} as const;

type LoadedInstance = {
  title: string | null;
  roomLabel: string | null;
  template: { name: string };
  property: { shortCode: string };
  room: { roomNumber: string } | null;
};

function labelFor(instance: LoadedInstance): string {
  if (instance.title) return instance.title;
  const room = roomDisplay(instance.room, instance.roomLabel);
  const parts = [instance.template.name, instance.property.shortCode];
  if (room) parts.push(`Rm ${room}`);
  return parts.join(" — ");
}

/**
 * Field-staff and manager entry point: close this assignment, or ask to.
 *
 * Returns `closed: true` when the instance is now INVALIDATED and
 * `closed: false` when a request was filed — the caller needs the difference to
 * tell the user whether they are done or waiting.
 */
export async function requestInvalidation(input: unknown): Promise<InvalidateResult> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { instanceId, reasonCode, note } = parsed.data;
  const user = await requireUser();

  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: instanceSelect,
  });
  if (!instance) return { ok: false, error: "Checklist not found." };

  // Property scope is checked here rather than in the pure helper because it
  // needs a membership read. A manager at one property must not close another
  // property's work.
  if (!(await canAccessProperty(user, instance.propertyId))) {
    return { ok: false, error: "Checklist not found." };
  }

  const outcome = decideClose(instance, user, reasonCode);
  if (outcome.kind === "denied") {
    return { ok: false, error: DENIAL_MESSAGE[outcome.reason] };
  }

  const now = new Date();
  const label = labelFor(instance);

  if (outcome.kind === "close") {
    const raced = await db.$transaction(async (tx) => {
      // Conditional update, not a plain one: between the read above and this
      // write the assignee may have submitted the checklist. Re-asserting the
      // status here means a real submission is never silently discarded — the
      // update becomes a no-op and the user is told why.
      const updated = await tx.checklistInstance.updateMany({
        where: {
          id: instanceId,
          status: {
            in: [
              InstanceStatus.SCHEDULED,
              InstanceStatus.ASSIGNED,
              InstanceStatus.IN_PROGRESS,
            ],
          },
        },
        data: {
          status: InstanceStatus.INVALIDATED,
          invalidationReason: note,
          invalidationReasonCode: reasonCode,
          // Stamp the requester even on a direct close, so every closed
          // instance answers "who decided this, and when" from its own row
          // without a join to audit_log. An existing request keeps its original
          // timestamp — the person who asked first is the requester.
          invalidationRequestedAt: instance.invalidationRequestedAt ?? now,
          invalidationRequestedByUserId: instance.invalidationRequestedByUserId ?? user.id,
        },
      });
      if (updated.count === 0) return true;
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          entityType: "checklist_instance",
          entityId: instanceId,
          action: canDecideInvalidation(user.role) ? "invalidate" : "invalidate_self",
          before: { status: instance.status },
          after: {
            status: InstanceStatus.INVALIDATED,
            reasonCode,
            note,
            immediate: closesImmediately(reasonCode),
          },
        },
      });
      return false;
    });

    if (raced) return { ok: false, error: DENIAL_MESSAGE.not_open };

    revalidatePath("/");
    revalidatePath("/review");
    revalidatePath(`/checklists/${instanceId}`);
    return { ok: true, closed: true };
  }

  // Needs a manager. Status is untouched — a pending request is still assigned
  // work, and leaving it that way keeps every existing status filter correct.
  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        invalidationReason: note,
        invalidationReasonCode: reasonCode,
        invalidationRequestedAt: now,
        invalidationRequestedByUserId: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "invalidate_request",
        before: { status: instance.status },
        after: { reasonCode, note, label },
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/checklists/${instanceId}`);
  return { ok: true, closed: false };
}

const decisionSchema = z.object({
  instanceId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/** Manager decision on a pending request. Approve invalidates; reject clears
 *  the request and hands the assignment back, with the requester notified. */
export async function decideInvalidation(input: unknown): Promise<InvalidateResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { instanceId, approve, note } = parsed.data;

  const user = await requireUser();
  if (!canDecideInvalidation(user.role)) {
    return { ok: false, error: "Only a manager or admin can decide this." };
  }

  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: instanceSelect,
  });
  if (!instance) return { ok: false, error: "Checklist not found." };
  if (!(await canAccessProperty(user, instance.propertyId))) {
    return { ok: false, error: "Checklist not found." };
  }
  if (instance.invalidationRequestedAt == null || instance.status === InstanceStatus.INVALIDATED) {
    return { ok: false, error: "There is no open request on this checklist." };
  }
  if (instance.lockedAt != null) {
    return { ok: false, error: DENIAL_MESSAGE.locked };
  }

  const label = labelFor(instance);
  const recipient = instance.assignedUser
    ? {
        id: instance.assignedUser.id,
        email: instance.assignedUser.email,
        locale: instance.assignedUser.locale === "es" ? ("es" as const) : ("en" as const),
      }
    : null;
  const event = approve ? ("invalidation_approved" as const) : ("invalidation_rejected" as const);
  const decisionNote = note?.trim() || null;

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: approve
        ? { status: InstanceStatus.INVALIDATED }
        : {
            // Rejection returns the assignment intact. The request fields are
            // cleared so the pending lane empties and the staff member can file
            // a different reason; the refusal itself survives in audit_log,
            // which is the table whose job is saying what happened.
            invalidationRequestedAt: null,
            invalidationRequestedByUserId: null,
            invalidationReason: null,
            invalidationReasonCode: null,
          },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: approve ? "invalidate_approve" : "invalidate_reject",
        before: {
          status: instance.status,
          reasonCode: instance.invalidationReasonCode,
          requestedNote: instance.invalidationReason,
        },
        after: { status: approve ? InstanceStatus.INVALIDATED : instance.status, note: decisionNote },
      },
    });
    return logNotification(tx, recipient, event, label, decisionNote, {
      type: "checklist_instance",
      id: instanceId,
    });
  });

  // Post-commit, never able to fail the decision that already succeeded.
  await deliverNotificationEmail(emailLogId, recipient, event, label, decisionNote);

  revalidatePath("/");
  revalidatePath("/review");
  revalidatePath(`/checklists/${instanceId}`);
  return { ok: true, closed: approve };
}
