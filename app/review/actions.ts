"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  InstanceStatus,
  IssuePriority,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";

// Manager review actions (Phase 4, ADR-011): Approve / Flag / Request Re-do.
// All write audit_log; recipient notifications are logged to notification_log —
// EMAIL rows as SKIPPED until Resend lands, IN_APP rows as PENDING for the
// Phase 6 notification center.

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
      assignedUser: { select: { id: true, name: true } },
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

/** Log recipient notifications: EMAIL is SKIPPED (Resend deferred), IN_APP PENDING. */
async function logNotifications(
  tx: Prisma.TransactionClient,
  recipientUserId: string | null,
  event: string,
  title: string,
  body: string | null,
  instanceId: string,
) {
  if (!recipientUserId) return;
  await tx.notificationLog.createMany({
    data: [
      {
        userId: recipientUserId,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
        event,
        title,
        body,
        entityType: "checklist_instance",
        entityId: instanceId,
      },
      {
        userId: recipientUserId,
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SKIPPED,
        event,
        title,
        body,
        entityType: "checklist_instance",
        entityId: instanceId,
        error: "resend_deferred",
      },
    ],
  });
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

  await db.$transaction(async (tx) => {
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
    await logNotifications(
      tx,
      instance.assignedUser?.id ?? null,
      "review_approved",
      `Approved: ${label(instance)}`,
      trimmed,
      instanceId,
    );
  });

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

  await db.$transaction(async (tx) => {
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
        title: `Flagged: ${label(instance)}`,
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
    await logNotifications(
      tx,
      instance.assignedUser?.id ?? null,
      "review_flagged",
      `Flagged: ${label(instance)}`,
      note,
      instanceId,
    );
  });

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

  await db.$transaction(async (tx) => {
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
    await logNotifications(
      tx,
      instance.assignedUser?.id ?? null,
      "review_redo",
      `Re-do requested: ${label(instance)}`,
      parsedNote.data,
      instanceId,
    );
  });

  revalidatePath("/review");
  revalidatePath(`/review/${instanceId}`);
  return { ok: true };
}
