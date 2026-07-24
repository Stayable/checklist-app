"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CompletionCheck, InstanceStatus, IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireAdmin, requireManager } from "@/lib/rbac";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";
import { isLocked } from "@/lib/review-lock";
import { normalizeCheckoutFlags } from "@/lib/checkout-flags";
import { roomDisplay } from "@/lib/room-label";
import {
  deliverNotificationEmail,
  logNotification,
  type NotifyRecipient,
} from "@/lib/notify.server";

// Manager review actions (Phase 4, ADR-011): Approve / Flag / Request Re-do.
// All write audit_log; recipient notifications write an IN_APP row (PENDING,
// Phase-6 center) + an EMAIL row delivered post-commit via Resend (bilingual
// per ADR-013). Delivery failure never fails the review action.

export type ReviewResult = { ok: true } | { ok: false; error: string };

const REVIEWABLE: InstanceStatus[] = [InstanceStatus.SUBMITTED, InstanceStatus.FLAGGED];

const LOCKED_ERROR =
  "This checklist has been verified and locked. Ask an admin to unlock it to make changes.";

const idSchema = z.string().uuid();
const noteSchema = z.string().trim().min(1, "A note is required.").max(2000);

async function loadGuarded(instanceId: string) {
  const user = await requireManager();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: { select: { name: true } },
      property: { select: { id: true, shortCode: true } },
      room: { select: { id: true, roomNumber: true } },
      assignedUser: { select: { id: true, name: true, email: true, locale: true } },
    },
  });
  if (!instance) return { ok: false as const, error: "Submission not found." };
  if (!(await canAccessProperty(user, instance.propertyId))) {
    return { ok: false as const, error: "Not authorized for this property." };
  }
  return { ok: true as const, user, instance };
}

function label(instance: {
  template: { name: string };
  property: { shortCode: string };
  room: { roomNumber: string } | null;
  roomLabel: string | null;
}): string {
  const rd = roomDisplay(instance.room, instance.roomLabel);
  const rm = rd ? (instance.room ? ` — Rm ${rd}` : ` — ${rd}`) : "";
  return `${instance.template.name} — ${instance.property.shortCode}${rm}`;
}

/** The submitter is the notification recipient (null when unassigned). */
function recipientOf(instance: {
  assignedUser: { id: string; email: string; locale: "en" | "es" } | null;
}): NotifyRecipient | null {
  const u = instance.assignedUser;
  return u ? { id: u.id, email: u.email, locale: u.locale } : null;
}

export async function approveSubmission(
  instanceId: string,
  note?: string,
  // S1 internal/staff note toggle: approve is internal by default — a note is
  // stored but the submitter is NOT notified unless the manager opts in.
  notifyStaff = false,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  if (!REVIEWABLE.includes(instance.status)) {
    return { ok: false, error: "Only submitted or flagged checklists can be approved." };
  }
  const trimmed = note?.trim() || null;
  const now = new Date();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.REVIEWED,
        reviewedAt: now,
        reviewedByUserId: user.id,
        managerNote: trimmed,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "approve",
        before: { status: instance.status },
        after: { status: InstanceStatus.REVIEWED, note: trimmed, notifyStaff },
      },
    });
    return notifyStaff
      ? logNotification(tx, recipient, "review_approved", lbl, trimmed, {
          type: "checklist_instance",
          id: instanceId,
        })
      : null;
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_approved", lbl, trimmed);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const flagSchema = z.object({
  note: noteSchema,
  priority: z.nativeEnum(IssuePriority).default(IssuePriority.MEDIUM),
  // Flag notifies the submitter by default (its purpose is to tell them to
  // follow up); manager may make it internal.
  notifyStaff: z.boolean().default(true),
});

export async function flagSubmission(
  instanceId: string,
  input: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = flagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  if (instance.status !== InstanceStatus.SUBMITTED) {
    return { ok: false, error: "Only submitted checklists can be flagged." };
  }
  const { note, priority, notifyStaff } = parsed.data;
  const hours = await slaHoursByPriority();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: { status: InstanceStatus.FLAGGED, managerNote: note },
    });
    const issueId = await createIssue(
      tx,
      {
        propertyId: instance.propertyId,
        roomId: instance.room?.id ?? null,
        sourceInstanceId: instanceId,
        title: `Flagged: ${lbl}`,
        description: note,
        priority,
      },
      hours,
    );
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "flag",
        before: { status: instance.status },
        after: { status: InstanceStatus.FLAGGED, note, issueId, notifyStaff },
      },
    });
    return notifyStaff
      ? logNotification(tx, recipient, "review_flagged", lbl, note, {
          type: "checklist_instance",
          id: instanceId,
        })
      : null;
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_flagged", lbl, note);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  revalidatePath("/issues");
  return { ok: true };
}

export async function requestRedo(
  instanceId: string,
  note: string,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsedNote = noteSchema.safeParse(note);
  if (!parsedNote.success) {
    return { ok: false, error: parsedNote.error.issues[0]?.message ?? "A note is required." };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  if (!REVIEWABLE.includes(instance.status)) {
    return { ok: false, error: "Only submitted or flagged checklists can be sent back." };
  }

  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.ASSIGNED,
        managerNote: parsedNote.data,
        // Reset run timestamps so time-to-complete reflects the redo run.
        // Prior responses stay until resubmit replaces them.
        openedAt: null,
        submittedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "request_redo",
        before: { status: instance.status },
        after: { status: InstanceStatus.ASSIGNED, note: parsedNote.data },
      },
    });
    return logNotification(tx, recipient, "review_redo", lbl, parsedNote.data, {
      type: "checklist_instance",
      id: instanceId,
    });
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_redo", lbl, parsedNote.data);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const verifySchema = z.object({
  note: z.string().trim().max(2000).optional(),
  // Verify is internal by default — the PM sign-off doesn't notify staff unless
  // the manager opts in.
  notifyStaff: z.boolean().default(false),
});

/**
 * S1: PM verify + lock. Requires a REVIEWED (approved) instance; stamps the
 * verify fields and lockedAt=now, making the instance immutable except an
 * admin unlock. Notifies the submitter only when notifyStaff is set.
 */
export async function verifySubmission(
  instanceId: string,
  input?: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = verifySchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: "This checklist is already verified." };

  if (instance.status !== InstanceStatus.REVIEWED) {
    return { ok: false, error: "Only reviewed (approved) checklists can be verified." };
  }
  const { note, notifyStaff } = parsed.data;
  const trimmed = note?.trim() || null;
  const now = new Date();
  const recipient = recipientOf(instance);
  const lbl = label(instance);

  const emailLogId = await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        verifiedByPm: true,
        verifiedAt: now,
        verifiedByUserId: user.id,
        lockedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "verify",
        after: { verifiedByPm: true, note: trimmed, notifyStaff },
      },
    });
    return notifyStaff
      ? logNotification(tx, recipient, "review_verified", lbl, trimmed, {
          type: "checklist_instance",
          id: instanceId,
        })
      : null;
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_verified", lbl, trimmed);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const checkoutFlagsSchema = z.object({
  notifyCorporate: z.boolean(),
  returnDeposit: z.boolean(),
  itemsToReplace: z.boolean(),
  itemsToReplaceList: z.string().max(2000),
  placeOOO: z.boolean(),
});

/**
 * S1: manager confirms / edits the staff-captured checkout flags at review
 * (Q2=B). Blocked once locked; audited (before/after). Values also lock at
 * Verify via the shared lock guard.
 */
export async function saveCheckoutFlags(
  instanceId: string,
  input: unknown,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const parsed = checkoutFlagsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  const nf = normalizeCheckoutFlags(parsed.data);

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        notifyCorporate: nf.notifyCorporate,
        returnDeposit: nf.returnDeposit,
        itemsToReplace: nf.itemsToReplace,
        itemsToReplaceList: nf.itemsToReplaceList || null,
        placeOOO: nf.placeOOO,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "checkout_flags",
        before: {
          notifyCorporate: instance.notifyCorporate,
          returnDeposit: instance.returnDeposit,
          itemsToReplace: instance.itemsToReplace,
          itemsToReplaceList: instance.itemsToReplaceList,
          placeOOO: instance.placeOOO,
        },
        after: nf,
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

/**
 * S1: manager's manual Pass/Fail completion check (Q1). Settable any time the
 * instance is unlocked; audited. The review UI shows the derived hint beside it.
 */
export async function setCompletionCheck(
  instanceId: string,
  value: CompletionCheck,
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  if (!Object.values(CompletionCheck).includes(value)) {
    return { ok: false, error: "Invalid value." };
  }
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;
  if (isLocked(instance)) return { ok: false, error: LOCKED_ERROR };

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: { completionCheck: value },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "completion_check",
        before: { completionCheck: instance.completionCheck },
        after: { completionCheck: value },
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

/**
 * S1: admin-only unlock (Q4). Clears the verify fields incl. lockedAt so the
 * instance can be re-reviewed. Audited. No staff notification.
 */
export async function unlockSubmission(instanceId: string): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const user = await requireAdmin();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: { id: true, lockedAt: true },
  });
  if (!instance) return { ok: false, error: "Submission not found." };
  if (!isLocked(instance)) return { ok: false, error: "This checklist is not locked." };

  await db.$transaction(async (tx) => {
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        verifiedByPm: false,
        verifiedAt: null,
        verifiedByUserId: null,
        lockedAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "unlock",
      },
    });
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}
