"use client";

import Link from "next/link";
import { JobChip, type ScheduleJob } from "./CalendarGrid";

// Persistent side rail (Kyle's decision): the unscheduled backlog is visible
// in EVERY view, because an unscheduled job is invisible on a calendar by
// definition — that is exactly why it needs its own permanent surface. It
// shows the whole backlog regardless of which date range is on screen.
//
// Rows open the same job dialog as a calendar chip, so one click behaves the
// same way everywhere on this page.

export function BacklogRail({
  jobs,
  todayYmd,
  onOpenJob,
}: {
  jobs: ScheduleJob[];
  todayYmd: string;
  onOpenJob: (jobId: string) => void;
}) {
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
            <JobChip key={job.id} job={job} todayYmd={todayYmd} onOpen={onOpenJob} />
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
