import { notFound, redirect } from "next/navigation";
import { InstanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, isManagerOrAbove } from "@/lib/rbac";
import { formatDateOnly, formatInET } from "@/lib/datetime";
import type { AnswerMap, AnswerValue } from "@/lib/checklist-logic";
import type { CheckoutFlags } from "@/lib/checkout-flags";
import { roomDisplay } from "@/lib/room-label";
import { INVALIDATABLE_STATUSES, isInvalidationPending } from "@/lib/invalidation";
import { questionsForInstance } from "@/lib/template-version.server";
import { FillClient, type FillQuestion, type ReviewOutcome } from "./FillClient";

// Checklist filling page (Phase 3). Loads the instance + ordered questions,
// gates access to the assignee or a property manager/admin, and hands a
// serializable payload to the client filler.
export default async function FillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const instance = await db.checklistInstance.findUnique({
    where: { id },
    include: {
      template: {
        select: {
          name: true,
          collectsCheckoutFlags: true,
        },
      },
      property: { select: { id: true, shortCode: true } },
      room: { select: { roomNumber: true } },
      // The reviewer, for the outcome block below. Named `reviewedBy` in the
      // schema and shown as "reviewer" on screen: CORPORATE, ADMIN and the
      // night-audit AGENT accounts all review, so "manager" would be wrong for
      // most of them. The column stays `managerNote`.
      reviewedBy: { select: { name: true } },
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

  // ADR-036: the version this instance was created against, not the current one.
  const templateQuestions = await questionsForInstance(instance);

  const questions: FillQuestion[] = templateQuestions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    hint: q.hint,
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

  // ADR-009 human label: prefer stored title (set on manual-create); fall back
  // to the ADR-009 computed pattern {Template} — {Short Code} — {Scope} — {Date}.
  const rd = roomDisplay(instance.room, instance.roomLabel);
  const scope = rd ? (instance.room ? `Rm ${rd}` : rd) : null;
  const generatedLabel = [
    instance.template.name,
    instance.property.shortCode,
    scope,
    formatDateOnly(instance.scheduledFor),
  ]
    .filter(Boolean)
    .join(" — ");
  const label = instance.title ?? generatedLabel;

  const submitted =
    instance.status === InstanceStatus.SUBMITTED || instance.status === InstanceStatus.REVIEWED;

  // What the reviewer decided, for the person who filled it in. Two states
  // carry a verdict: REVIEWED (closed) and FLAGGED (sent back). SUBMITTED has
  // no verdict yet, so it renders nothing rather than an empty shell.
  //
  // The timestamp is formatted HERE, on the server, so the client component
  // never touches a date library or a timezone (ADR-013 — everything renders
  // in ET, through lib/datetime.ts).
  const reviewOutcome: ReviewOutcome | null =
    instance.status === InstanceStatus.REVIEWED || instance.status === InstanceStatus.FLAGGED
      ? {
          kind: instance.status === InstanceStatus.FLAGGED ? "flagged" : "closed",
          completionCheck: instance.completionCheck,
          note: instance.managerNote,
          reviewerName: instance.reviewedBy?.name ?? null,
          reviewedAt: instance.reviewedAt ? formatInET(instance.reviewedAt) : null,
        }
      : null;

  // There is something to export iff the checklist was submitted at least once.
  // Status is the wrong test: a FLAGGED instance is editable again but its
  // previous answers and photos are still on the row, and its PDF is exactly
  // what the reviewer was looking at.
  const canExport = instance.submittedAt !== null;

  // Close-out is offered only while the work is still open. Hiding it on a
  // submitted checklist is not cosmetic: the action refuses those statuses, so
  // showing the control would be an invitation to an error message.
  const canCloseOut =
    !submitted &&
    instance.lockedAt == null &&
    INVALIDATABLE_STATUSES.includes(instance.status);

  const initialFlags: CheckoutFlags = {
    notifyCorporate: instance.notifyCorporate,
    returnDeposit: instance.returnDeposit,
    itemsToReplace: instance.itemsToReplace,
    itemsToReplaceList: instance.itemsToReplaceList ?? "",
    placeOOO: instance.placeOOO,
  };

  return (
    <FillClient
      instanceId={instance.id}
      label={label}
      questions={questions}
      initialAnswers={initialAnswers}
      submitted={submitted}
      collectsCheckoutFlags={instance.template.collectsCheckoutFlags}
      initialFlags={initialFlags}
      canCloseOut={canCloseOut}
      closeOutPending={isInvalidationPending(instance)}
      reviewOutcome={reviewOutcome}
      canExport={canExport}
    />
  );
}
