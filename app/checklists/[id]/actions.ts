"use server";

import { GeofenceStatus, InstanceStatus, Prisma, QuestionType } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAbove } from "@/lib/rbac";
import { normalizeCheckoutFlags, type CheckoutFlags } from "@/lib/checkout-flags";
import { roomDisplay } from "@/lib/room-label";
import {
  isVisible,
  validateAll,
  type AnswerMap,
  type AnswerValue,
  type PhotoRef,
  type QuestionLike,
} from "@/lib/checklist-logic";
import { geofenceStatusFor } from "@/lib/geofence";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";
import { isLocked } from "@/lib/review-lock";

// Submit pipeline (Phase 3 + Phase 4 auto-Issue + ADR-015 photos): validate →
// persist responses + Photo rows → mark SUBMITTED → open an Issue for each
// visible PASSFAIL=FAIL answer whose question has fail_flags_issue (deduped on
// redo → resubmit). Photo BYTES were already PUT to R2 by the client via
// presigned URLs; the answer carries {count, photos: PhotoRef[]} and this
// action validates each key's prefix and writes photos rows with a
// server-computed geofence status. Legacy {count, pendingUpload} answers (old
// on-device drafts) are still accepted and simply produce no Photo rows.

export type SubmitResult = { ok: true } | { ok: false; error: string };

// R2 keys are server-minted (lib/r2.ts responsePhotoKey) — anything else is a
// forged reference. UUID filename under the instance+question prefix only.
function isValidPhotoKey(key: string, instanceId: string, questionId: string): boolean {
  return new RegExp(
    `^instances/${instanceId}/${questionId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
  ).test(key);
}

/** Extract uploaded PhotoRefs from a PHOTO answer; [] for legacy/empty shapes. */
function photoRefsOf(value: AnswerValue): PhotoRef[] {
  if (typeof value !== "object" || value === null || !("photos" in value)) return [];
  if (!Array.isArray(value.photos)) return [];
  return value.photos;
}

const checkoutFlagsSchema = z.object({
  notifyCorporate: z.boolean(),
  returnDeposit: z.boolean(),
  itemsToReplace: z.boolean(),
  itemsToReplaceList: z.string().max(2000),
  placeOOO: z.boolean(),
});

export async function submitChecklist(
  instanceId: string,
  answers: AnswerMap,
  flags?: CheckoutFlags,
): Promise<SubmitResult> {
  const user = await requireUser();

  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: { include: { questions: { orderBy: { orderIndex: "asc" } } } },
      property: { select: { shortCode: true, geofence: true } },
      room: { select: { roomNumber: true } },
    },
  });
  if (!instance) return { ok: false, error: "Checklist not found." };

  // Only the assignee (or a manager/admin of the property) may submit.
  const isAssignee = instance.assignedUserId === user.id;
  const canManage =
    isManagerOrAbove(user.role) &&
    (user.role === "CORPORATE" || user.role === "ADMIN" ||
      (await db.userProperty.findUnique({
        where: { userId_propertyId: { userId: user.id, propertyId: instance.propertyId } },
        select: { userId: true },
      })) !== null);
  if (!isAssignee && !canManage) return { ok: false, error: "Not authorized for this checklist." };

  if (instance.status === InstanceStatus.SUBMITTED || instance.status === InstanceStatus.REVIEWED) {
    return { ok: false, error: "This checklist has already been submitted." };
  }

  // S1: a verified-and-locked instance is immutable (defense in depth — a
  // locked instance is never in a re-submittable status, but guard anyway).
  if (isLocked(instance)) {
    return { ok: false, error: "This checklist has been verified and locked and can no longer be changed." };
  }

  // Server-side validation mirrors the client (defense in depth).
  const questions: QuestionLike[] = instance.template.questions.map((q) => ({
    id: q.id,
    type: q.type,
    required: q.required,
    options: (q.options as string[] | null) ?? null,
    photoMin: q.photoMin,
    photoMax: q.photoMax,
    conditional: q.conditional as QuestionLike["conditional"],
  }));
  const errors = validateAll(questions, answers);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Some answers are missing or invalid. Review the highlighted questions." };
  }

  const answerableIds = new Set(questions.map((q) => q.id));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const now = new Date();

  // S1 checkout flags: persist the 5 instance columns only when THIS template
  // collects them (server-authoritative — a client can't force flags onto a
  // template that doesn't declare them). itemsToReplaceList clears when the box
  // is unchecked (normalizeCheckoutFlags).
  let flagData: Prisma.ChecklistInstanceUpdateInput | null = null;
  if (instance.template.collectsCheckoutFlags && flags !== undefined) {
    const parsedFlags = checkoutFlagsSchema.safeParse(flags);
    if (!parsedFlags.success) {
      return { ok: false, error: "Invalid checkout flags." };
    }
    const nf = normalizeCheckoutFlags(parsedFlags.data);
    flagData = {
      notifyCorporate: nf.notifyCorporate,
      returnDeposit: nf.returnDeposit,
      itemsToReplace: nf.itemsToReplace,
      itemsToReplaceList: nf.itemsToReplaceList || null,
      placeOOO: nf.placeOOO,
    };
  }

  // Photo rows from uploaded PhotoRefs on visible PHOTO questions (ADR-015).
  // Key prefixes are strictly validated so a client can only reference objects
  // presigned for THIS instance+question. Geofence status is computed here, not
  // trusted from the client. (Object existence in R2 is not re-checked — a
  // forged-but-well-formed key only breaks the submitter's own photo.)
  type PhotoRow = {
    questionId: string;
    r2Key: string;
    fileSizeBytes: number;
    gpsLat: number | null;
    gpsLng: number | null;
    geofenceStatus: GeofenceStatus;
    capturedAt: Date | null;
  };
  const photoRows: PhotoRow[] = [];
  for (const q of instance.template.questions) {
    if (q.type !== QuestionType.PHOTO) continue;
    const ql = questionById.get(q.id);
    if (!ql || !isVisible(ql, answers)) continue;
    for (const ref of photoRefsOf(answers[q.id])) {
      if (
        typeof ref !== "object" ||
        ref === null ||
        typeof ref.key !== "string" ||
        !isValidPhotoKey(ref.key, instanceId, q.id) ||
        typeof ref.sizeBytes !== "number"
      ) {
        return { ok: false, error: "Invalid photo reference. Re-add the photos and try again." };
      }
      const lat = typeof ref.lat === "number" ? ref.lat : null;
      const lng = typeof ref.lng === "number" ? ref.lng : null;
      // capturedAt is optional/nullable for backward-compat with legacy clients
      // that do not send it (pre-ADR-021). Treat absence or 0 as null.
      const capturedAtMs =
        typeof ref.capturedAt === "number" && ref.capturedAt > 0 ? ref.capturedAt : null;
      photoRows.push({
        questionId: q.id,
        r2Key: ref.key,
        fileSizeBytes: Math.round(ref.sizeBytes),
        gpsLat: lat,
        gpsLng: lng,
        geofenceStatus: geofenceStatusFor(
          lat !== null && lng !== null ? { lat, lng } : null,
          instance.property.geofence,
        ),
        capturedAt: capturedAtMs ? new Date(capturedAtMs) : null,
      });
    }
  }

  // Auto-Issue (Phase 4): visible PASSFAIL=FAIL answers on fail_flags_issue
  // questions open an Issue. SLA hours read outside the transaction.
  const failedFlagged = instance.template.questions.filter((q) => {
    if (q.type !== QuestionType.PASSFAIL || !q.failFlagsIssue) return false;
    if (answers[q.id] !== "FAIL") return false;
    const ql = questionById.get(q.id);
    return ql !== undefined && isVisible(ql, answers);
  });
  const slaHours = failedFlagged.length > 0 ? await slaHoursByPriority() : {};

  await db.$transaction(async (tx) => {
    // Replace any prior draft responses, then write the submitted set. The
    // delete cascades to photos rows from a prior submit (redo flow); the old
    // R2 objects stay put (keep-forever, ADR-013 — orphan cleanup is a P2 cron).
    await tx.response.deleteMany({ where: { instanceId } });
    await tx.response.createMany({
      data: Object.entries(answers)
        .filter(([qid, v]) => answerableIds.has(qid) && v !== undefined)
        .map(([questionId, value]) => ({
          instanceId,
          questionId,
          answer: (value ?? null) as Prisma.InputJsonValue,
        })),
    });

    // Photo rows hang off the just-created responses (ADR-015).
    if (photoRows.length > 0) {
      const photoQids = [...new Set(photoRows.map((r) => r.questionId))];
      const created = await tx.response.findMany({
        where: { instanceId, questionId: { in: photoQids } },
        select: { id: true, questionId: true },
      });
      const responseIdByQuestion = new Map(created.map((r) => [r.questionId, r.id]));
      await tx.photo.createMany({
        data: photoRows.map((r) => ({
          responseId: responseIdByQuestion.get(r.questionId)!,
          r2Key: r.r2Key,
          fileSizeBytes: r.fileSizeBytes,
          gpsLat: r.gpsLat,
          gpsLng: r.gpsLng,
          geofenceStatus: r.geofenceStatus,
          capturedAt: r.capturedAt,
        })),
      });
    }
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.SUBMITTED,
        submittedAt: now,
        openedAt: instance.openedAt ?? now,
        ...(flagData ?? {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: instanceId,
        action: "submit",
      },
    });

    // One Issue per failed flagged question (skipped if one is already open
    // for the same instance+question from a prior submit).
    const rd = roomDisplay(instance.room, instance.roomLabel);
    const rm = rd ? (instance.room ? ` — Rm ${rd}` : ` — ${rd}`) : "";
    for (const q of failedFlagged) {
      await createIssue(
        tx,
        {
          propertyId: instance.propertyId,
          roomId: instance.roomId,
          sourceInstanceId: instanceId,
          sourceQuestionId: q.id,
          title: `${instance.template.name} — ${instance.property.shortCode}${rm}: ${q.prompt}`,
          description: `Auto-created from a failed "${q.prompt}" answer.`,
        },
        slaHours,
      );
    }
  });

  return { ok: true };
}
