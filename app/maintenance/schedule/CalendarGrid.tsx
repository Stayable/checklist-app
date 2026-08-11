"use client";

import Link from "next/link";
import { ContractorJobStatus, Trade } from "@prisma/client";
import type { CalendarView, DayCell } from "@/lib/contractor-schedule";
import { isOverdue, isTerminalJobStatus, jobStatusLabel, tradeLabel } from "@/lib/contractors";

// The calendar body. A DATE-ONLY feature (Kyle, 2026-08-11), so day and week
// are LISTS, not hour grids — there is no time of day to place anything at,
// and an hour grid would invent one. Nothing here renders a clock value.
//
// Cells are TRUNCATED (Kyle, 2026-08-11: "it looks too many"). With 13 jobs a
// day, a month cell rendering every chip is unreadable and pushes the grid to
// several screens. Each cell shows the first few and a "+N more" that opens the
// day in a dialog, so the grid stays scannable and nothing is hidden without
// saying how much.

export type ScheduleJob = {
  id: string;
  ymd: string;
  propertyShortCode: string;
  roomLabel: string | null;
  trade: Trade;
  status: ContractorJobStatus;
  urgent: boolean;
  contractorName: string | null;
  scheduledFor: Date | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// How many chips a cell shows before collapsing into "+N more". Month cells are
// the tightest, so they show fewest; day view is one full-width list and never
// truncates — there is nothing to collapse it in favour of.
const CHIP_LIMIT: Record<CalendarView, number> = {
  month: 2,
  week: 3,
  workweek: 4,
  day: Number.POSITIVE_INFINITY,
};

// Bucketed ONCE, not filtered per cell: a month view has 42 cells, so
// per-cell filtering walks the whole job list 42 times.
function bucketByDay(jobs: ScheduleJob[]): Map<string, ScheduleJob[]> {
  const map = new Map<string, ScheduleJob[]>();
  for (const job of jobs) {
    const existing = map.get(job.ymd);
    if (existing) existing.push(job);
    else map.set(job.ymd, [job]);
  }
  // Within a day: urgent first, then by property short code so a
  // multi-property day groups readably.
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      return a.propertyShortCode.localeCompare(b.propertyShortCode);
    });
  }
  return map;
}

function dayNumber(ymd: string): string {
  return String(Number(ymd.slice(8, 10)));
}

function weekdayOf(ymd: string): string {
  return WEEKDAY_LABELS[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
}

function jobTone(job: ScheduleJob, todayYmd: string): string {
  const overdue = isOverdue(job.scheduledFor, isTerminalJobStatus(job.status), todayYmd);
  if (job.urgent) return "border-red-200 bg-red-50 hover:bg-red-100";
  if (overdue) return "border-amber-200 bg-amber-50 hover:bg-amber-100";
  return "border-slate-200 bg-white hover:bg-slate-50";
}

/** A job as a chip. A button, not a link: it opens the job dialog in place
 *  rather than navigating away from the calendar. */
export function JobChip({
  job,
  todayYmd,
  onOpen,
  compact = false,
}: {
  job: ScheduleJob;
  todayYmd: string;
  onOpen: (jobId: string) => void;
  compact?: boolean;
}) {
  const overdue = isOverdue(job.scheduledFor, isTerminalJobStatus(job.status), todayYmd);

  return (
    <button
      type="button"
      onClick={() => onOpen(job.id)}
      className={`block w-full rounded-md border px-2 py-1.5 text-left text-xs ${jobTone(job, todayYmd)}`}
    >
      <span className="flex flex-wrap items-center gap-x-1.5 font-semibold text-slate-900">
        {job.urgent && <span className="text-red-700">URGENT</span>}
        <span>{job.propertyShortCode}</span>
        {job.roomLabel && <span className="font-normal text-slate-600">{job.roomLabel}</span>}
      </span>
      <span className="mt-0.5 block truncate text-slate-600">
        {tradeLabel(job.trade)}
        {compact ? "" : ` · ${job.contractorName ?? "Unassigned"}`}
      </span>
      {!compact && (
        <span className="mt-0.5 block text-slate-500">
          {jobStatusLabel(job.status)}
          {overdue ? " · Overdue" : ""}
        </span>
      )}
    </button>
  );
}

/** The chips for one cell, capped, with a "+N more" that opens the day. */
function CellJobs({
  cell,
  jobs,
  limit,
  todayYmd,
  onOpenJob,
  onOpenDay,
  compact,
}: {
  cell: DayCell;
  jobs: ScheduleJob[];
  limit: number;
  todayYmd: string;
  onOpenJob: (jobId: string) => void;
  onOpenDay: (ymd: string) => void;
  compact: boolean;
}) {
  const shown = jobs.slice(0, limit);
  const hidden = jobs.length - shown.length;

  return (
    <div className="flex flex-col gap-1">
      {shown.map((job) => (
        <JobChip
          key={job.id}
          job={job}
          todayYmd={todayYmd}
          onOpen={onOpenJob}
          compact={compact}
        />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => onOpenDay(cell.ymd)}
          className="rounded-md px-2 py-1 text-left text-xs font-semibold text-navy hover:bg-slate-100"
        >
          +{hidden} more…
        </button>
      )}
    </div>
  );
}

export function CalendarGrid({
  view,
  cells,
  jobs,
  todayYmd,
  onOpenJob,
  onOpenDay,
}: {
  view: CalendarView;
  cells: DayCell[];
  jobs: ScheduleJob[];
  todayYmd: string;
  onOpenJob: (jobId: string) => void;
  onOpenDay: (ymd: string) => void;
}) {
  const buckets = bucketByDay(jobs);
  const limit = CHIP_LIMIT[view];

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">No contractor jobs scheduled for this period.</p>
        <Link
          href={`/maintenance/jobs/new?scheduledFor=${cells[0].ymd}`}
          className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          Schedule a job
        </Link>
      </div>
    );
  }

  if (view === "month") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-1 pb-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400"
            >
              {label}
            </div>
          ))}
          {cells.map((cell) => {
            const dayJobs = buckets.get(cell.ymd) ?? [];
            return (
              <div
                key={cell.ymd}
                className={`min-h-24 rounded-md border p-1 ${
                  cell.isToday
                    ? "border-navy bg-blue-50/40"
                    : cell.inCurrentMonth
                      ? "border-slate-200"
                      : "border-slate-100 bg-slate-50"
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <button
                    type="button"
                    onClick={() => onOpenDay(cell.ymd)}
                    className={`rounded px-1 text-xs font-semibold hover:bg-slate-100 ${
                      cell.inCurrentMonth ? "text-slate-700" : "text-slate-400"
                    }`}
                  >
                    {dayNumber(cell.ymd)}
                    {dayJobs.length > 0 && (
                      <span className="ml-1 font-normal text-slate-400">({dayJobs.length})</span>
                    )}
                  </button>
                  {cell.isToday && (
                    <span className="text-[10px] font-bold uppercase text-navy">Today</span>
                  )}
                </div>
                <div className="mt-1">
                  <CellJobs
                    cell={cell}
                    jobs={dayJobs}
                    limit={limit}
                    todayYmd={todayYmd}
                    onOpenJob={onOpenJob}
                    onOpenDay={onOpenDay}
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "day") {
    const cell = cells[0];
    const dayJobs = buckets.get(cell.ymd) ?? [];
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {weekdayOf(cell.ymd)}
          {cell.isToday ? " · Today" : ""} · {dayJobs.length} job{dayJobs.length === 1 ? "" : "s"}
        </h2>
        {dayJobs.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing scheduled</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {dayJobs.map((job) => (
              <JobChip key={job.id} job={job} todayYmd={todayYmd} onOpen={onOpenJob} />
            ))}
          </div>
        )}
        <Link
          href={`/maintenance/jobs/new?scheduledFor=${cell.ymd}`}
          className="mt-2 inline-block text-xs font-medium text-slate-400 hover:text-navy"
        >
          + Add
        </Link>
      </div>
    );
  }

  // week (7) and workweek (5): columns of lists.
  return (
    <div className={`grid gap-2 ${view === "week" ? "sm:grid-cols-7" : "sm:grid-cols-5"}`}>
      {cells.map((cell) => {
        const dayJobs = buckets.get(cell.ymd) ?? [];
        return (
          <div
            key={cell.ymd}
            className={`rounded-xl border p-2 ${
              cell.isToday ? "border-navy bg-blue-50/40" : "border-slate-200 bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => onOpenDay(cell.ymd)}
              className="mb-2 block w-full rounded px-1 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:bg-slate-100"
            >
              {weekdayOf(cell.ymd)} {dayNumber(cell.ymd)}
              {cell.isToday ? " · Today" : ""}
              {dayJobs.length > 0 && (
                <span className="ml-1 font-medium normal-case text-slate-400">
                  ({dayJobs.length})
                </span>
              )}
            </button>
            {dayJobs.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing scheduled</p>
            ) : (
              <CellJobs
                cell={cell}
                jobs={dayJobs}
                limit={limit}
                todayYmd={todayYmd}
                onOpenJob={onOpenJob}
                onOpenDay={onOpenDay}
                compact={false}
              />
            )}
            <Link
              href={`/maintenance/jobs/new?scheduledFor=${cell.ymd}`}
              className="mt-1.5 inline-block text-xs font-medium text-slate-400 hover:text-navy"
            >
              + Add
            </Link>
          </div>
        );
      })}
    </div>
  );
}
