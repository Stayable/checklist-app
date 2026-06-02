import Link from "next/link";
import { InstanceStatus, QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { accessiblePropertyIds, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { formatDateInET } from "@/lib/datetime";
import { timeToCompleteMinutes } from "@/lib/review";
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
  const scopeIds = currentPropertyId ? [currentPropertyId] : propertyIds;

  const instances = await db.checklistInstance.findMany({
    where: { propertyId: { in: scopeIds }, status: { in: [...FILTERS[filter]] } },
    orderBy: [{ submittedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      submittedAt: true,
      openedAt: true,
      scheduledFor: true,
      template: {
        select: {
          name: true,
          questions: {
            where: { type: QuestionType.PHOTO, required: true },
            orderBy: { orderIndex: "asc" },
            select: { id: true, prompt: true },
          },
        },
      },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
      responses: { select: { questionId: true, answer: true } },
    },
  });

  const rows: QueueRow[] = instances.map((i) => ({
    id: i.id,
    status: i.status,
    template: i.template.name,
    shortCode: i.property.shortCode,
    user: i.assignedUser?.name ?? "—",
    date: i.submittedAt
      ? formatDateInET(i.submittedAt)
      : formatDateInET(i.scheduledFor),
    unit: i.room?.roomNumber ?? null,
    minutes: timeToCompleteMinutes(i.openedAt, i.submittedAt),
    // One thumbnail slot per required PHOTO question (ADR-011). Photo bytes are
    // R2-gated, so render captured counts as pending-upload placeholders.
    photoSlots: i.template.questions.map((q) => {
      const resp = i.responses.find((r) => r.questionId === q.id);
      const answer = resp?.answer as { count?: number } | null;
      return { prompt: q.prompt, count: answer?.count ?? 0 };
    }),
  }));

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
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
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
    </main>
  );
}
