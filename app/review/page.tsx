import Link from "next/link";
import { InstanceStatus, QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { accessiblePropertyIds, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { CloseOutRequests, type CloseOutRequestRow } from "./CloseOutRequests";
import { formatDateInET, formatDateOnly, formatInET } from "@/lib/datetime";
import { timeToCompleteMinutes } from "@/lib/review";
import { roomDisplay } from "@/lib/room-label";
import { questionsForInstances, questionSetKey } from "@/lib/template-version.server";
import { ReviewQueueClient, type QueueRow } from "./ReviewQueueClient";

// Manager review queue (ADR-011): table view, one row per submission.
// English-only manager surface (ADR-013). Property-scoped via RBAC + the
// header property-picker cookie when set.

const FILTERS = {
  pending: [InstanceStatus.SUBMITTED],
  flagged: [InstanceStatus.FLAGGED],
  reviewed: [InstanceStatus.REVIEWED],
  all: [InstanceStatus.SUBMITTED, InstanceStatus.FLAGGED, InstanceStatus.REVIEWED],
} as const;

type FilterKey = keyof typeof FILTERS;

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireManager();
  const { filter: rawFilter } = await searchParams;
  const filter: FilterKey =
    rawFilter && rawFilter in FILTERS ? (rawFilter as FilterKey) : "pending";

  const propertyIds = await accessiblePropertyIds(user);
  const currentPropertyId = await getCurrentPropertyId(propertyIds);
  const scopeIds = resolveScopedPropertyIds(propertyIds, currentPropertyId);

  const instances = await db.checklistInstance.findMany({
    where: { propertyId: { in: scopeIds }, status: { in: [...FILTERS[filter]] } },
    orderBy: [{ submittedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      status: true,
      submittedAt: true,
      openedAt: true,
      scheduledFor: true,
      templateId: true,
      templateVersion: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      roomLabel: true,
      assignedUser: { select: { name: true } },
      responses: {
        select: {
          questionId: true,
          answer: true,
          // First stored photo per response drives the row thumbnail (ADR-011/015).
          photos: { orderBy: { createdAt: "asc" }, take: 1, select: { r2Key: true } },
        },
      },
    },
  });

  // ADR-036: each row's thumbnail slots come from the question set ITS
  // instance was created against, so a template edit does not retroactively
  // add or drop a slot on an already-reviewed row. Batched to one query.
  const questionsBySet = await questionsForInstances(instances);

  // PHOTOS AS A COUNT, NOT THUMBNAILS (Kyle, 2026-09-11 — "leave the photos out
  // from the row ... the image will be seen when opening the to review").
  //
  // ADR-011 specified "inline photo thumbnails, one per required photo
  // question", and that held while templates had two or three. The Arrival
  // Checklist has ELEVEN, so the strip grew past the table and pushed the
  // Actions column off the right edge — Closed and Flag rendered on top of the
  // thumbnails. The row's job is to say whether this submission needs opening;
  // the photos themselves are on the detail page, one click away.
  //
  // Kept as captured/required because that IS a queue-level signal: a required
  // photo question with nothing against it is a gap worth seeing before you
  // open the row. Also drops one presigned R2 URL per photo question per row —
  // 33 signatures on the three-row page in the screenshot.
  const rows: QueueRow[] = await Promise.all(
    instances.map(async (i) => ({
      id: i.id,
      status: i.status,
      template: i.title ?? i.template.name,
      shortCode: i.property.shortCode,
      user: i.assignedUser?.name ?? "—",
      // submittedAt is an instant (ET); scheduledFor is date-only (UTC).
      date: i.submittedAt
        ? formatDateInET(i.submittedAt)
        : formatDateOnly(i.scheduledFor),
      unit: roomDisplay(i.room, i.roomLabel),
      minutes: timeToCompleteMinutes(i.openedAt, i.submittedAt),
      photos: (() => {
        const slots = (questionsBySet.get(questionSetKey(i)) ?? []).filter(
          (q) => q.type === QuestionType.PHOTO && q.required,
        );
        let captured = 0;
        for (const q of slots) {
          const resp = i.responses.find((r) => r.questionId === q.id);
          // `answer.count` rather than photos.length: legacy pre-R2 submissions
          // recorded a count without bytes, and they still count as answered.
          if (((resp?.answer as { count?: number } | null)?.count ?? 0) > 0) captured += 1;
        }
        return { required: slots.length, captured };
      })(),
    })),
  );

  // Pending close-out requests. Scoped through the SAME scopeIds as the queue —
  // a panel that disagreed with the table beneath it about which properties are
  // in view reads as broken data, not a broken query.
  const closeOutRows = await db.checklistInstance.findMany({
    where: {
      propertyId: { in: scopeIds },
      invalidationRequestedAt: { not: null },
      status: { notIn: [InstanceStatus.INVALIDATED] },
    },
    orderBy: { invalidationRequestedAt: "asc" },
    take: 50,
    select: {
      id: true,
      title: true,
      roomLabel: true,
      scheduledFor: true,
      invalidationRequestedAt: true,
      invalidationReason: true,
      invalidationReasonCode: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      invalidationRequestedBy: { select: { name: true } },
    },
  });

  const closeOutRequests: CloseOutRequestRow[] = closeOutRows.map((i) => {
    const rd = roomDisplay(i.room, i.roomLabel);
    return {
      instanceId: i.id,
      label:
        i.title ??
        [i.template.name, i.property.shortCode, rd ? `Rm ${rd}` : null]
          .filter(Boolean)
          .join(" — "),
      shortCode: i.property.shortCode,
      requestedBy: i.invalidationRequestedBy?.name ?? "Unknown",
      requestedAt: i.invalidationRequestedAt ? formatInET(i.invalidationRequestedAt) : "—",
      reasonCode: i.invalidationReasonCode,
      note: i.invalidationReason,
    };
  });

  const counts = await db.checklistInstance.groupBy({
    by: ["status"],
    where: {
      propertyId: { in: scopeIds },
      status: { in: [...FILTERS.all] },
    },
    _count: true,
  });
  const countOf = (s: InstanceStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Review queue</h1>
          <p className="text-sm text-slate-500">
            Submissions awaiting review{currentPropertyId ? "" : " across your properties"}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/issues" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            Issues →
          </Link>
          <Link href="/" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            Home
          </Link>
        </nav>
      </header>

      <CloseOutRequests rows={closeOutRequests} />

      <nav className="flex gap-1 border-b border-slate-200 text-sm">
        {(
          [
            ["pending", `Pending (${countOf(InstanceStatus.SUBMITTED)})`],
            ["flagged", `Flagged (${countOf(InstanceStatus.FLAGGED)})`],
            ["reviewed", `Reviewed (${countOf(InstanceStatus.REVIEWED)})`],
            ["all", "All"],
          ] as const
        ).map(([key, text]) => (
          <Link
            key={key}
            href={`/review?filter=${key}`}
            className={`-mb-px border-b-2 px-3 py-2 font-semibold ${
              filter === key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {text}
          </Link>
        ))}
      </nav>

      <ReviewQueueClient rows={rows} filter={filter} />
    </div>
  );
}
