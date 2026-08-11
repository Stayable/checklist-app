import Link from "next/link";
import { ContractorJobStatus, Trade } from "@prisma/client";
import type { CalendarView, DayCell } from "@/lib/contractor-schedule";
import { isOverdue, isTerminalJobStatus, jobStatusLabel, tradeLabel } from "@/lib/contractors";

// The calendar body. A DATE-ONLY feature (Kyle, 2026-08-11), so day and week
// are LISTS, not hour grids — there is no time of day to place anything at,
// and an hour grid would invent one. Nothing here renders a clock value.

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

function JobChip({ job, todayYmd }: { job: ScheduleJob; todayYmd: string }) {
  const overdue = isOverdue(job.scheduledFor, isTerminalJobStatus(job.status), todayYmd);
  const tone = job.urgent
    ? "border-red-200 bg-red-50 hover:bg-red-100"
    : overdue
      ? "border-amber-200 bg-amber-50 hover:bg-amber-100"
      : "border-slate-200 bg-white hover:bg-slate-50";

  return (
    <Link
      href={`/maintenance/jobs/${job.id}`}
      className={`block rounded-md border px-2 py-1.5 text-xs ${tone}`}
    >
      <span className="flex flex-wrap items-center gap-x-1.5 font-semibold text-slate-900">
        {job.urgent && <span className="text-red-700">URGENT</span>}
        <span>{job.propertyShortCode}</span>
        {job.roomLabel && <span className="font-normal text-slate-600">{job.roomLabel}</span>}
      </span>
      <span className="mt-0.5 block text-slate-600">
        {tradeLabel(job.trade)} · {job.contractorName ?? "Unassigned"}
      </span>
      <span className="mt-0.5 block text-slate-500">
        {jobStatusLabel(job.status)}
        {overdue ? " · Overdue" : ""}
      </span>
    </Link>
  );
}

function DayList({
  cell,
  jobs,
  todayYmd,
}: {
  cell: DayCell;
  jobs: ScheduleJob[];
  todayYmd: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {jobs.length === 0 ? (
        <p className="text-xs text-slate-400">Nothing scheduled</p>
      ) : (
        jobs.map((job) => <JobChip key={job.id} job={job} todayYmd={todayYmd} />)
      )}
      <Link
        href={`/maintenance/jobs/new?scheduledFor=${cell.ymd}`}
        className="text-xs font-medium text-slate-400 hover:text-navy"
      >
        + Add
      </Link>
    </div>
  );
}

export function CalendarGrid({
  view,
  cells,
  jobs,
  todayYmd,
}: {
  view: CalendarView;
  cells: DayCell[];
  jobs: ScheduleJob[];
  todayYmd: string;
}) {
  const buckets = bucketByDay(jobs);

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
          {cells.map((cell) => (
            <div
              key={cell.ymd}
              className={`min-h-24 rounded-md border p-1 ${
                cell.isToday
                  ? "border-navy bg-blue-50/40"
                  : cell.inCurrentMonth
                    ? "border-slate-200"
                    : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-xs font-semibold ${
                    cell.inCurrentMonth ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  {dayNumber(cell.ymd)}
                </span>
                {cell.isToday && (
                  <span className="text-[10px] font-bold uppercase text-navy">Today</span>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {(buckets.get(cell.ymd) ?? []).map((job) => (
                  <JobChip key={job.id} job={job} todayYmd={todayYmd} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "day") {
    const cell = cells[0];
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {weekdayOf(cell.ymd)}
          {cell.isToday ? " · Today" : ""}
        </h2>
        <DayList cell={cell} jobs={buckets.get(cell.ymd) ?? []} todayYmd={todayYmd} />
      </div>
    );
  }

  // week (7) and workweek (5): columns of lists.
  return (
    <div
      className={`grid gap-2 ${view === "week" ? "sm:grid-cols-7" : "sm:grid-cols-5"}`}
    >
      {cells.map((cell) => (
        <div
          key={cell.ymd}
          className={`rounded-xl border p-2 ${
            cell.isToday ? "border-navy bg-blue-50/40" : "border-slate-200 bg-white"
          }`}
        >
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            {weekdayOf(cell.ymd)} {dayNumber(cell.ymd)}
            {cell.isToday ? " · Today" : ""}
          </h2>
          <DayList cell={cell} jobs={buckets.get(cell.ymd) ?? []} todayYmd={todayYmd} />
        </div>
      ))}
    </div>
  );
}
