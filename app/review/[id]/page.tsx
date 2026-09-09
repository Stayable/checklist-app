import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QuestionType } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, isAdmin, requireManager } from "@/lib/rbac";
import { isLocked } from "@/lib/review-lock";
import { formatDateOnly, formatInET } from "@/lib/datetime";
import { formatMinutes, timeToCompleteMinutes } from "@/lib/review";
import { presignDownload } from "@/lib/r2";
import { ReviewActions } from "./ReviewActions";
import { CompletionCheckControl } from "./CompletionCheckControl";
import { CheckoutFlagsReview } from "./CheckoutFlagsReview";
import { deriveCompletionCheck } from "@/lib/completion-check";
import { roomDisplay } from "@/lib/room-label";
import { PhotoFigure } from "@/components/review/PhotoFigure";
import type { PhotoFigureProps } from "@/components/review/PhotoFigure";
import { questionsForInstance } from "@/lib/template-version.server";

// Single-submission review (ADR-011): three-column layout.
//   left   — status + manager note + the Pass/Fail completion check, which
//            GATES the two outcomes below it: Closed / Flag (Kyle 2026-09-10;
//            Re-do removed, ADR-037). "Closed" is a label — the status stays
//            REVIEWED and the server action stays `approveSubmission`.
//   center — responses + photos + signatures + the submitter's per-question
//            notes (Response.notes), time-to-complete in the header
//   right  — activity timeline (audit_log) with actor + timestamp
// English-only manager surface (ADR-013). Photos render from R2 via 1-hour
// presigned GETs with a per-photo geofence badge + capture time + coords (ADR-015).

type PhotoView = Omit<PhotoFigureProps, "url"> & { url: string };

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
      if (count === 0 && (!photos || photos.length === 0)) {
        // No photos and none claimed. Distinct from the legacy case below —
        // a submitter can now record a note on a photo question WITHOUT taking
        // one ("door blocked"), which writes a {count: 0} answer; badging that
        // "no upload (legacy)" would accuse the app of losing a photo that
        // never existed.
        return <span className="text-slate-400">No photos</span>;
      }
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
            <PhotoFigure key={i} {...p} />
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
      template: true,
      property: { select: { shortCode: true, name: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
      reviewedBy: { select: { name: true } },
      verifiedBy: { select: { name: true } },
      responses: {
        include: {
          photos: {
            orderBy: { createdAt: "asc" },
            select: { r2Key: true, geofenceStatus: true, capturedAt: true, gpsLat: true, gpsLng: true },
          },
        },
      },
      sourcedIssues: { select: { id: true, title: true, status: true } },
    },
  });
  if (!instance) notFound();
  if (!(await canAccessProperty(user, instance.propertyId))) redirect("/review");

  const answers = new Map(instance.responses.map((r) => [r.questionId, r.answer]));

  // Response.notes — free text the SUBMITTER left for whoever reviews this.
  // Only photo questions collect one today, but the map is built over every
  // response so an older or future note is never silently hidden here.
  const submitterNotes = new Map<string, string>(
    instance.responses.flatMap((r) => (r.notes ? ([[r.questionId, r.notes]] as const) : [])),
  );

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
          capturedAt: p.capturedAt ? formatInET(p.capturedAt) : null,
          gpsLat: p.gpsLat?.toString() ?? null,
          gpsLng: p.gpsLng?.toString() ?? null,
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

  // ADR-036: review the questions this checklist was FILLED against, not the
  // template's current set. A later edit must not rewrite the prompts a
  // manager is signing off on.
  const templateQuestions = await questionsForInstance(instance);

  const locked = isLocked(instance);
  const completionHint = deriveCompletionCheck(
    instance.responses.map((r) => ({ questionId: r.questionId, answer: r.answer })),
    templateQuestions.map((q) => ({ id: q.id, type: q.type })),
  );

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
                {(() => {
                  const rd = roomDisplay(instance.room, instance.roomLabel);
                  return rd ? (instance.room ? ` — Rm ${rd}` : ` — ${rd}`) : "";
                })()}
              </>
            )}
          </h1>
          <p className="text-sm text-slate-500">
            {instance.systemId ?? instance.id} · {instance.assignedUser?.name ?? "Unassigned"} ·{" "}
            {instance.submittedAt
              ? `Submitted ${formatInET(instance.submittedAt)}`
              : `Scheduled ${formatDateOnly(instance.scheduledFor)}`}{" "}
            · Time to complete: {formatMinutes(minutes)}
          </p>
        </div>
        <a
          href={`/api/checklists/${id}/pdf`}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export PDF
        </a>
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
            {instance.verifiedByPm && instance.verifiedAt && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                ✓ Verified{instance.verifiedBy ? ` by ${instance.verifiedBy.name}` : ""} ·{" "}
                {formatInET(instance.verifiedAt)}
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
          <CompletionCheckControl
            instanceId={instance.id}
            current={instance.completionCheck}
            hint={completionHint}
            disabled={locked}
          />
          {instance.template.collectsCheckoutFlags && (
            <CheckoutFlagsReview
              instanceId={instance.id}
              locked={locked}
              initial={{
                notifyCorporate: instance.notifyCorporate,
                returnDeposit: instance.returnDeposit,
                itemsToReplace: instance.itemsToReplace,
                itemsToReplaceList: instance.itemsToReplaceList ?? "",
                placeOOO: instance.placeOOO,
              }}
            />
          )}
          <ReviewActions
            instanceId={instance.id}
            status={instance.status}
            locked={locked}
            isAdmin={isAdmin(user.role)}
            // Drives the gate: Closed / Flag stay disabled until this is set.
            // Read from the row, not from `completionHint` — the hint is a
            // suggestion and auto-applying it would answer the question the
            // manager is supposed to answer.
            completionCheck={instance.completionCheck}
          />
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
          {templateQuestions.map((q) =>
            q.type === QuestionType.SECTION_DIVIDER ? (
              <h3
                key={q.id}
                className="mt-2 text-sm font-bold uppercase tracking-wide text-slate-500"
              >
                {q.prompt}
              </h3>
            ) : (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="mb-1 text-sm font-semibold text-slate-900">
                  {q.prompt}
                  {q.hint && (
                    <span className="ml-2 text-xs font-normal text-slate-500">{q.hint}</span>
                  )}
                </p>
                <div className="text-sm text-slate-700">
                  <AnswerView
                    type={q.type}
                    answer={answers.get(q.id)}
                    photos={photosByQuestion.get(q.id)}
                  />
                </div>
                {/* The submitter speaking to the reviewer — deliberately not
                    styled like the answer above it. An answer is the checklist's
                    record; this is a person adding context to it, so it gets an
                    attributed, tinted block a reviewer can't mistake for data. */}
                {submitterNotes.has(q.id) && (
                  <div className="mt-3 rounded-lg border-l-4 border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                      Note from {instance.assignedUser?.name ?? "submitter"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                      {submitterNotes.get(q.id)}
                    </p>
                  </div>
                )}
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
