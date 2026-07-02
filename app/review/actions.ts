"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { InstanceStatus, IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";
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
}): string {
  const rm = instance.room ? ` — Rm ${instance.room.roomNumber}` : "";
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
): Promise<ReviewResult> {
  if (!idSchema.safeParse(instanceId).success) return { ok: false, error: "Invalid id." };
  const loaded = await loadGuarded(instanceId);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const { user, instance } = loaded;

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
        after: { status: InstanceStatus.REVIEWED, note: trimmed },
      },
    });
    return logNotification(tx, recipient, "review_approved", lbl, trimmed, {
      type: "checklist_instance",
      id: instanceId,
    });
  });

  await deliverNotificationEmail(emailLogId, recipient, "review_approved", lbl, trimmed);

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}

const flagSchema = z.object({
  note: noteSchema,
  priority: z.nativeEnum(IssuePriority).default(IssuePriority.MEDIUM),
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

  if (instance.status !== InstanceStatus.SUBMITTED) {
    return { ok: false, error: "Only submitted checklists can be flagged." };
  }
  const { note, priority } = parsed.data;
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
        after: { status: InstanceStatus.FLAGGED, note, issueId },
      },
    });
    return logNotification(tx, recipient, "review_flagged", lbl, note, {
      type: "checklist_instance",
      id: instanceId,
    });
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
