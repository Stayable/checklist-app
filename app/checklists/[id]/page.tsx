import { notFound, redirect } from "next/navigation";
import { InstanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAbove } from "@/lib/rbac";
import { formatDateInET } from "@/lib/datetime";
import type { AnswerMap, AnswerValue } from "@/lib/checklist-logic";
import { FillClient, type FillQuestion } from "./FillClient";

// Checklist filling page (Phase 3). Loads the instance + ordered questions,
// gates access to the assignee or a property manager/admin, and hands a
// serializable payload to the client filler.
export default async function FillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const instance = await db.checklistInstance.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, questions: { orderBy: { orderIndex: "asc" } } } },
      property: { select: { id: true, shortCode: true } },
      room: { select: { roomNumber: true } },
      responses: { select: { questionId: true, answer: true } },
    },
  });
  if (!instance) notFound();

  // Access: assignee, or manager/admin who can reach the property.
  const isAssignee = instance.assignedUserId === user.id;
  let canManage = false;
  if (!isAssignee && isManagerOrAbove(user.role)) {
    canManage =
      user.role === "CORPORATE" ||
      user.role === "ADMIN" ||
      (await db.userProperty.findUnique({
        where: { userId_propertyId: { userId: user.id, propertyId: instance.property.id } },
        select: { userId: true },
      })) !== null;
  }
  if (!isAssignee && !canManage) redirect("/");

  const questions: FillQuestion[] = instance.template.questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    options: (q.options as string[] | null) ?? null,
    photoMin: q.photoMin,
    photoMax: q.photoMax,
    conditional: q.conditional as FillQuestion["conditional"],
  }));

  const initialAnswers: AnswerMap = {};
  for (const r of instance.responses) {
    initialAnswers[r.questionId] = r.answer as AnswerValue;
  }

  // ADR-009 human label: {Template} — {Short Code} — {Scope} — {Date}.
  const scope = instance.room ? `Rm ${instance.room.roomNumber}` : null;
  const label = [
    instance.template.name,
    instance.property.shortCode,
    scope,
    formatDateInET(instance.scheduledFor),
  ]
    .filter(Boolean)
    .join(" — ");

  const submitted =
    instance.status === InstanceStatus.SUBMITTED || instance.status === InstanceStatus.REVIEWED;

  return (
    <FillClient
      instanceId={instance.id}
      label={label}
      questions={questions}
      initialAnswers={initialAnswers}
      submitted={submitted}
    />
  );
}
