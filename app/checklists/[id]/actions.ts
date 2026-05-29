"use server";

import { InstanceStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAbove } from "@/lib/rbac";
import { validateAll, type AnswerMap, type QuestionLike } from "@/lib/checklist-logic";

// Submit pipeline (Phase 3): validate → persist responses → mark SUBMITTED.
// Photo BYTES are not uploaded here — the R2 path is deferred, so PHOTO answers
// carry { count, pendingUpload: true } and no Photo rows are written yet. The
// auto-Issue-from-failed-PASSFAIL step is Phase 4, intentionally not done here.

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
  });

  return { ok: true };
}
