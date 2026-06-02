"use server";

import { InstanceStatus, Prisma, QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAbove } from "@/lib/rbac";
import { isVisible, validateAll, type AnswerMap, type QuestionLike } from "@/lib/checklist-logic";
import { createIssue, slaHoursByPriority } from "@/lib/issues.server";

// Submit pipeline (Phase 3 + Phase 4 auto-Issue): validate → persist responses
// → mark SUBMITTED → open an Issue for each visible PASSFAIL=FAIL answer whose
// question has fail_flags_issue (deduped on redo → resubmit). Photo BYTES are
// not uploaded here — the R2 path is deferred, so PHOTO answers carry
// { count, pendingUpload: true } and no Photo rows are written yet.

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitChecklist(
  instanceId: string,
  answers: AnswerMap,
): Promise<SubmitResult> {
  const user = await requireUser();

  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    include: {
      template: { include: { questions: { orderBy: { orderIndex: "asc" } } } },
      property: { select: { shortCode: true } },
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
  const now = new Date();

  // Auto-Issue (Phase 4): visible PASSFAIL=FAIL answers on fail_flags_issue
  // questions open an Issue. SLA hours read outside the transaction.
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const failedFlagged = instance.template.questions.filter((q) => {
    if (q.type !== QuestionType.PASSFAIL || !q.failFlagsIssue) return false;
    if (answers[q.id] !== "FAIL") return false;
    const ql = questionById.get(q.id);
    return ql !== undefined && isVisible(ql, answers);
  });
  const slaHours = failedFlagged.length > 0 ? await slaHoursByPriority() : {};

  await db.$transaction(async (tx) => {
    // Replace any prior draft responses, then write the submitted set.
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
    await tx.checklistInstance.update({
      where: { id: instanceId },
      data: {
        status: InstanceStatus.SUBMITTED,
        submittedAt: now,
        openedAt: instance.openedAt ?? now,
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
    const rm = instance.room ? ` — Rm ${instance.room.roomNumber}` : "";
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
