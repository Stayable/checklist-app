"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { CalendarView, DayCell } from "@/lib/contractor-schedule";
import { Modal } from "@/components/ui/modal";
import { CalendarGrid, JobChip, type ScheduleJob } from "./CalendarGrid";
import { BacklogRail } from "./BacklogRail";
import { loadJobPreview, type JobPreview } from "./job-preview";

// Owns the calendar's two dialogs (Kyle, 2026-08-11: open a popup instead of
// navigating away, and collapse the crowded day cells).
//
// TWO LEVELS, ONE DIALOG AT A TIME rather than stacked modals:
//   day list  — every job on that date, opened from a day header or "+N more"
//   job       — one job's detail and history
// Opening a job FROM the day list keeps a back arrow to it; opening a job
// straight from a chip has no back arrow, because there is nothing behind it.

type DialogState =
  | { kind: "none" }
  | { kind: "day"; ymd: string }
  | { kind: "job"; jobId: string; backToDay: string | null };

export function ScheduleClient({
  view,
  cells,
  dated,
  backlog,
  todayYmd,
}: {
  view: CalendarView;
  cells: DayCell[];
  dated: ScheduleJob[];
  backlog: ScheduleJob[];
  todayYmd: string;
}) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [preview, setPreview] = useState<JobPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const openDay = useCallback((ymd: string) => setDialog({ kind: "day", ymd }), []);
  const close = useCallback(() => setDialog({ kind: "none" }), []);

  const openJob = useCallback(
    (jobId: string) =>
      setDialog((current) => ({
        kind: "job",
        jobId,
        backToDay: current.kind === "day" ? current.ymd : null,
      })),
    [],
  );

  // Fetched on open rather than shipped with every cell — see job-preview.ts.
  useEffect(() => {
    if (dialog.kind !== "job") {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let active = true;
    setPreview(null);
    setPreviewError(null);
    loadJobPreview(dialog.jobId)
      .then((result) => {
        if (!active) return;
        if (result) setPreview(result);
        // null covers both "gone" and "not in your scope" — the popup must not
        // distinguish them, or it would confirm an id exists outside your scope.
        else setPreviewError("This job is no longer available.");
      })
      .catch(() => {
        if (active) setPreviewError("Could not load this job.");
      });
    return () => {
      active = false;
    };
  }, [dialog]);

  const dayJobs =
    dialog.kind === "day" ? dated.filter((job) => job.ymd === dialog.ymd) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <CalendarGrid
            view={view}
            cells={cells}
            jobs={dated}
            todayYmd={todayYmd}
            onOpenJob={openJob}
            onOpenDay={openDay}
          />
        </div>
        <aside>
          <BacklogRail jobs={backlog} todayYmd={todayYmd} onOpenJob={openJob} />
        </aside>
      </div>

      {dialog.kind === "day" && (
        <Modal
          title={formatDayTitle(dialog.ymd, cells)}
          subtitle={`${dayJobs.length} job${dayJobs.length === 1 ? "" : "s"} scheduled`}
          onClose={close}
          footer={
            <Link
              href={`/maintenance/jobs/new?scheduledFor=${dialog.ymd}`}
              className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Add a job for this day
            </Link>
          }
        >
          {dayJobs.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing scheduled for this day.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {dayJobs.map((job) => (
                <JobChip key={job.id} job={job} todayYmd={todayYmd} onOpen={openJob} />
              ))}
            </div>
          )}
        </Modal>
      )}

      {dialog.kind === "job" && (
        <Modal
          title={preview?.title ?? "Job"}
          subtitle={preview ? `${preview.statusLabel} · ${preview.scheduledLabel}` : undefined}
          onClose={close}
          onBack={dialog.backToDay ? () => openDay(dialog.backToDay!) : undefined}
          footer={
            <>
              <Link
                href={`/maintenance/jobs/${dialog.jobId}`}
                className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Open full job
              </Link>
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Close
              </button>
            </>
          }
        >
          {previewError ? (
            <p className="text-sm text-red-700">{previewError}</p>
          ) : !preview ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="plain">{preview.statusLabel}</Badge>
                {preview.urgent && <Badge tone="red">Urgent</Badge>}
                {preview.terminal && <Badge tone="plain">Closed — fields locked</Badge>}
              </div>

              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-slate-500">Property</dt>
                <dd className="text-slate-900">{preview.propertyLabel}</dd>
                <dt className="text-slate-500">Where</dt>
                <dd className="text-slate-900">{preview.roomLabel ?? "—"}</dd>
                <dt className="text-slate-500">Trade</dt>
                <dd className="text-slate-900">{preview.tradeLabel}</dd>
                <dt className="text-slate-500">Contractor</dt>
                <dd className="text-slate-900">{preview.contractorName ?? "Unassigned"}</dd>
                <dt className="text-slate-500">Scheduled</dt>
                <dd className="text-slate-900">{preview.scheduledLabel}</dd>
                <dt className="text-slate-500">Created</dt>
                <dd className="text-slate-900">{preview.createdLabel}</dd>
                {preview.completedLabel && (
                  <>
                    <dt className="text-slate-500">Completed</dt>
                    <dd className="text-slate-900">{preview.completedLabel}</dd>
                  </>
                )}
              </dl>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  What needs doing
                </h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                  {preview.description}
                </p>
              </section>

              {preview.closeNote && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Closing note
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                    {preview.closeNote}
                  </p>
                </section>
              )}

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  History
                </h3>
                {preview.notes.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-400">Nothing recorded yet.</p>
                ) : (
                  <ol className="mt-1 flex flex-col gap-2.5">
                    {preview.notes.map((note) => (
                      <li
                        key={note.id}
                        className={`border-l-2 pl-3 ${
                          note.isSystem ? "border-slate-300" : "border-blue-300"
                        }`}
                      >
                        <p
                          className={`whitespace-pre-wrap text-sm ${
                            note.isSystem ? "italic text-slate-600" : "text-slate-900"
                          }`}
                        >
                          {note.body}
                        </p>
                        <p className="text-xs text-slate-500">
                          {note.author}
                          {note.isSystem ? " · automatic" : ""} · {note.createdAtLabel}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Read-only on purpose: status, assignment, reschedule and adding
                  a note all live on the full job page, so the rules that guard
                  them (terminal immutability, server-side contractor
                  eligibility) have exactly one surface to hold. */}
              <p className="text-xs text-slate-500">
                This is a read-only preview. Use “Open full job” to change status, assign a
                contractor, reschedule, or add a note.
              </p>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "plain" | "red" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        tone === "red" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"
      }`}
    >
      {children}
    </span>
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "2026-08-11" -> "Tuesday, August 11, 2026". No timezone conversion and no
// toLocale* call (ADR-013 routes those through lib/datetime): a ymd is ALREADY
// an ET calendar date, so turning it into words is pure string work — parsing
// it as UTC midnight only recovers the weekday.
function formatDayTitle(ymd: string, cells: DayCell[]): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
  const label = `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
  return cells.find((c) => c.ymd === ymd)?.isToday ? `${label} · Today` : label;
}
