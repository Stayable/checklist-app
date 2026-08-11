import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import { etDayStartUtc, formatDateInET, formatInET } from "@/lib/datetime";
import { ymdOf } from "@/lib/contractor-schedule";
import {
  isTerminalJobStatus,
  jobStatusLabel,
  resolveNoteAuthor,
  tradeLabel,
} from "@/lib/contractors";
import { PageHeader } from "@/components/shell/PageHeader";
import { JobControls } from "./JobControls";
import { JobThread } from "./JobThread";

// Contractor job detail. Mirrors app/network/tickets/[id]/page.tsx: server
// component for the record, a client island for mutations, and an
// append-only thread underneath.

// A date-only column rendered as an ET calendar date. etDayStartUtc hands the
// ET formatter the instant that ET day begins; passing the raw UTC-midnight
// value would print the previous day.
function formatScheduled(value: Date): string {
  return formatDateInET(etDayStartUtc(ymdOf(value)));
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireManager();

  const job = await db.contractorJob.findUnique({
    where: { id },
    select: {
      id: true,
      propertyId: true,
      roomLabel: true,
      trade: true,
      description: true,
      urgent: true,
      status: true,
      contractorId: true,
      scheduledFor: true,
      completedAt: true,
      closeNote: true,
      createdAt: true,
      property: { select: { shortCode: true, name: true } },
      contractor: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      notes: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          source: true,
          authorLabel: true,
          body: true,
          createdAt: true,
          authorUser: { select: { name: true } },
        },
      },
    },
  });

  // A job outside the actor's property scope is treated as absent rather than
  // forbidden, so the page never confirms that an id exists.
  if (!job || !(await canAccessProperty(user, job.propertyId))) notFound();

  const terminal = isTerminalJobStatus(job.status);

  // Picker options. The same three rules are re-checked inside
  // assignContractor — this list is a convenience, not the authority.
  const eligible = terminal
    ? []
    : await db.contractor.findMany({
        where: {
          active: true,
          trades: { has: job.trade },
          properties: { some: { propertyId: job.propertyId } },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, company: true },
      });

  const notes = job.notes.map((n) => ({
    id: n.id,
    isSystem: n.source === "SYSTEM",
    author: resolveNoteAuthor({
      source: n.source,
      authorLabel: n.authorLabel,
      author: n.authorUser,
    }),
    body: n.body,
    createdAtLabel: formatInET(n.createdAt),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/maintenance/schedule" className="text-sm text-slate-500 hover:underline">
          ← Schedule
        </Link>
      </div>

      <PageHeader
        title={`${tradeLabel(job.trade)} — ${job.property.shortCode}${
          job.roomLabel ? ` — ${job.roomLabel}` : ""
        }`}
        subtitle={`${jobStatusLabel(job.status)}${job.urgent ? " · Urgent" : ""} · ${
          job.scheduledFor
            ? `Scheduled ${formatScheduled(job.scheduledFor)}`
            : "Unscheduled backlog"
        }`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Details
            </h2>
            <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Property</dt>
              <dd className="text-slate-900">
                {job.property.shortCode} — {job.property.name}
              </dd>
              <dt className="text-slate-500">Where</dt>
              <dd className="text-slate-900">{job.roomLabel ?? "—"}</dd>
              <dt className="text-slate-500">Trade</dt>
              <dd className="text-slate-900">{tradeLabel(job.trade)}</dd>
              <dt className="text-slate-500">Urgent</dt>
              <dd className="text-slate-900">{job.urgent ? "Yes" : "No"}</dd>
              <dt className="text-slate-500">Status</dt>
              <dd className="text-slate-900">{jobStatusLabel(job.status)}</dd>
              <dt className="text-slate-500">Contractor</dt>
              <dd className="text-slate-900">{job.contractor?.name ?? "Unassigned"}</dd>
              <dt className="text-slate-500">Scheduled date</dt>
              <dd className="text-slate-900">
                {job.scheduledFor ? formatScheduled(job.scheduledFor) : "Unscheduled backlog"}
              </dd>
              <dt className="text-slate-500">Created</dt>
              <dd className="text-slate-900">
                {formatInET(job.createdAt)} by {job.createdBy.name}
              </dd>
              {job.completedAt && (
                <>
                  <dt className="text-slate-500">Completed</dt>
                  <dd className="text-slate-900">{formatInET(job.completedAt)}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              What needs doing
            </h2>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{job.description}</p>
          </div>

          {job.closeNote && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Closing note
              </h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{job.closeNote}</p>
            </div>
          )}

          <JobThread jobId={job.id} notes={notes} />
        </div>

        <aside>
          <JobControls
            jobId={job.id}
            status={job.status}
            terminal={terminal}
            contractorId={job.contractorId}
            contractorName={job.contractor?.name ?? null}
            scheduledFor={job.scheduledFor ? ymdOf(job.scheduledFor) : ""}
            eligible={eligible}
          />
        </aside>
      </div>
    </div>
  );
}
