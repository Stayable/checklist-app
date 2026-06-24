import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GeofenceStatus, InstanceStatus, QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { formatDateInET, formatInET } from "@/lib/datetime";
import { formatMinutes, timeToCompleteMinutes } from "@/lib/review";
import { presignDownload } from "@/lib/r2";
import { ReviewActions } from "./ReviewActions";

// Single-submission review (ADR-011): three-column layout.
//   left   — status + manager note + Approve / Flag / Re-do
//   center — responses + photos + signatures, time-to-complete in the header
//   right  — activity timeline (audit_log) with actor + timestamp
// English-only manager surface (ADR-013). Photos render from R2 via 1-hour
// presigned GETs with a per-photo geofence badge (ADR-015).

type PhotoView = { url: string; geofenceStatus: GeofenceStatus };

const GEOFENCE_BADGE: Record<GeofenceStatus, { label: string; cls: string }> = {
  [GeofenceStatus.VERIFIED]: { label: "On property", cls: "bg-emerald-50 text-emerald-700" },
  [GeofenceStatus.OFF_PROPERTY]: { label: "Off property", cls: "bg-red-50 text-red-700" },
  [GeofenceStatus.NO_GPS]: { label: "No GPS", cls: "bg-slate-100 text-slate-500" },
  // Informational, not an anomaly — no polygon configured yet (ADR-015).
  [GeofenceStatus.UNVERIFIED]: { label: "No geofence set", cls: "bg-amber-50 text-amber-700" },
};

function AnswerView({
  type,
  answer,
  photos,
}: {
  type: QuestionType;
  answer: unknown;
  photos?: PhotoView[];
}) {
  if (answer === null || answer === undefined) {
    return <span className="text-slate-400">No answer</span>;
  }
  switch (type) {
    case QuestionType.PASSFAIL:
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            answer === "FAIL" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {String(answer)}
        </span>
      );
    case QuestionType.YESNO:
      return <span className="font-medium">{answer ? "Yes" : "No"}</span>;
    case QuestionType.MULTI:
      return <span>{Array.isArray(answer) ? answer.join(", ") : String(answer)}</span>;
    case QuestionType.PHOTO: {
      const count = (answer as { count?: number })?.count ?? 0;
      if (!photos || photos.length === 0) {
        // Legacy pre-ADR-015 answer: count recorded but bytes never uploaded.
        return (
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">{count} photo{count === 1 ? "" : "s"} captured</span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              no upload (legacy)
            </span>
          </span>
        );
      }
      return (
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <figure key={i} className="flex flex-col gap-1">
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not an optimizable asset */}
                <img
                  src={p.url}
                  alt={`Photo ${i + 1}`}
                  className="h-32 w-32 rounded-lg border border-slate-200 object-cover"
                />
              </a>
              <figcaption
                className={`self-start rounded-full px-2 py-0.5 text-xs font-semibold ${GEOFENCE_BADGE[p.geofenceStatus].cls}`}
              >
                {GEOFENCE_BADGE[p.geofenceStatus].label}
              </figcaption>
            </figure>
          ))}
        </div>
      );
    }
    case QuestionType.SIGNATURE:
      return typeof answer === "string" && answer.startsWith("data:image") ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL signature, not an optimizable asset
        <img src={answer} alt="Signature" className="h-20 rounded border border-slate-200 bg-white" />
      ) : (
        <span className="text-slate-400">Signature unavailable</span>
      );
    default:
      return <span className="whitespace-pre-wrap">{String(answer)}</span>;
  }
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireManager();
  const { id } = await params;

  const instance = await db.checklistInstance.findUnique({
    where: { id },
    include: {
      template: {
        include: { questions: { orderBy: { orderIndex: "asc" } } },
      },
      property: { select: { shortCode: true, name: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      responses: { include: { photos: { orderBy: { createdAt: "asc" } } } },
      sourcedIssues: { select: { id: true, title: true, status: true } },
    },
  });
  if (!instance) notFound();
  if (!(await canAccessProperty(user, instance.propertyId))) redirect("/review");

  const answers = new Map(instance.responses.map((r) => [r.questionId, r.answer]));

  // Presigned GET per stored photo (1h TTL), keyed by question (ADR-015).
  const photosByQuestion = new Map<string, PhotoView[]>();
  for (const r of instance.responses) {
    if (r.photos.length === 0) continue;
    photosByQuestion.set(
      r.questionId,
      await Promise.all(
        r.photos.map(async (p) => ({
          url: await presignDownload(p.r2Key),
          geofenceStatus: p.geofenceStatus,
        })),
      ),
    );
  }
  const minutes = timeToCompleteMinutes(instance.openedAt, instance.submittedAt);

  const timeline = await db.auditLog.findMany({
    where: { entityType: "checklist_instance", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
  });

  const reviewable =
    instance.status === InstanceStatus.SUBMITTED || instance.status === InstanceStatus.FLAGGED;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between">
        <div>
          <Link href="/review" className="text-sm text-slate-500 hover:underline">
            ← Review queue
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">
            {instance.title ?? (
              <>
                {instance.template.name} — {instance.property.shortCode}
                {instance.room ? ` — Rm ${instance.room.roomNumber}` : ""}
              </>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            {instance.systemId ?? instance.id} · {instance.assignedUser?.name ?? "Unassigned"} ·{" "}
            {instance.submittedAt
              ? `Submitted ${formatInET(instance.submittedAt)}`
              : `Scheduled ${formatDateInET(instance.scheduledFor)}`}{" "}
            · Time to complete: {formatMinutes(minutes)}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_280px]">
        {/* Left rail — status + manager note + actions */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Status</h2>
            <p className="text-lg font-bold text-slate-900">{instance.status}</p>
            {instance.reviewedBy && instance.reviewedAt && (
              <p className="mt-1 text-xs text-slate-500">
                by {instance.reviewedBy.name} · {formatInET(instance.reviewedAt)}
              </p>
            )}
          </div>
          {instance.managerNote && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Manager note
              </h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{instance.managerNote}</p>
            </div>
          )}
          {reviewable && <ReviewActions instanceId={instance.id} status={instance.status} />}
          {instance.sourcedIssues.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Linked issues
              </h2>
              <ul className="flex flex-col gap-1 text-sm">
                {instance.sourcedIssues.map((iss) => (
                  <li key={iss.id}>
                    <Link href={`/issues/${iss.id}`} className="text-slate-700 hover:underline">
                      [{iss.status}] {iss.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Center — responses */}
        <section className="flex flex-col gap-3">
          {instance.template.questions.map((q) =>
            q.type === QuestionType.SECTION_DIVIDER ? (
              <h3
                key={q.id}
                className="mt-2 text-sm font-bold uppercase tracking-wide text-slate-500"
              >
                {q.prompt}
              </h3>
            ) : (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-1 text-sm font-semibold text-slate-900">{q.prompt}</p>
                <div className="text-sm text-slate-700">
                  <AnswerView
                    type={q.type}
                    answer={answers.get(q.id)}
                    photos={photosByQuestion.get(q.id)}
                  />
                </div>
              </div>
            ),
          )}
          {instance.responses.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              No responses recorded yet.
            </div>
          )}
        </section>

        {/* Right rail — activity timeline */}
        <aside>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Activity
            </h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-slate-400">No activity yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {timeline.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.action.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.actor.name} · {formatInET(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
