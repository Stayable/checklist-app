import Link from "next/link";
import { jobStatusLabel, tradeLabel } from "@/lib/contractors";
import type { ScheduleJob } from "./CalendarGrid";

// Persistent side rail (Kyle's decision): the unscheduled backlog is visible
// in EVERY view, because an unscheduled job is invisible on a calendar by
// definition — that is exactly why it needs its own permanent surface. It
// shows the whole backlog regardless of which date range is on screen.

export function BacklogRail({ jobs }: { jobs: ScheduleJob[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Unscheduled</h2>
        <span className="text-xs font-semibold text-slate-500">{jobs.length}</span>
      </div>

      {jobs.length === 0 ? (
        <p className="text-xs text-slate-500">No unscheduled jobs. Everything open has a date.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/maintenance/jobs/${job.id}`}
              className={`block rounded-md border px-2 py-1.5 text-xs ${
                job.urgent
                  ? "border-red-200 bg-red-50 hover:bg-red-100"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <span className="flex flex-wrap items-center gap-x-1.5 font-semibold text-slate-900">
                {job.urgent && <span className="text-red-700">URGENT</span>}
                <span>{job.propertyShortCode}</span>
                {job.roomLabel && (
                  <span className="font-normal text-slate-600">{job.roomLabel}</span>
                )}
              </span>
              <span className="mt-0.5 block text-slate-600">
                {tradeLabel(job.trade)} · {job.contractorName ?? "Unassigned"}
              </span>
              <span className="mt-0.5 block text-slate-500">{jobStatusLabel(job.status)}</span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href="/maintenance/jobs/new"
        className="mt-3 block text-xs font-medium text-slate-400 hover:text-navy"
      >
        + Add to backlog
      </Link>
    </div>
  );
}
