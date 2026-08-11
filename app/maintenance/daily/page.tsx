import Link from "next/link";
import { ContractorJobStatus } from "@prisma/client";
import { accessibleProperties, isPortfolioRole, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etDayStartUtc, formatDateInET, formatInET, nextYMD } from "@/lib/datetime";
import { addDaysYMD, parseDateParam, toCompact, todayYMD } from "@/lib/contractor-schedule";
import {
  OPEN_JOB_STATUSES,
  TERMINAL_JOB_STATUSES,
  jobStatusLabel,
  resolveNoteAuthor,
  tradeLabel,
} from "@/lib/contractors";
import { PageHeader } from "@/components/shell/PageHeader";
import { MaintenanceNav } from "../MaintenanceNav";
import { DailyNoteComposer } from "./DailyNoteComposer";

// Daily contractor rollup + the day's written log.
//
// ⚠ TWO COLUMN KINDS, QUERIED DIFFERENTLY, and crossing them silently shifts
// rows into the neighbouring ET day:
//   • scheduledFor / forDate are @db.Date  -> compare to a UTC-midnight Date.
//   • completedAt / createdAt are timestamps -> bound with etDayStartUtc(ymd)
//     .. etDayStartUtc(nextYMD(ymd)), which honours the 4–5 hour ET offset.

const NOTE_PREVIEW_MAX = 80;

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > NOTE_PREVIEW_MAX ? `${flat.slice(0, NOTE_PREVIEW_MAX - 1)}…` : flat;
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "alert" | "warn";
}) {
  const accent =
    tone === "alert" && value > 0
      ? "text-red-700"
      : tone === "warn" && value > 0
        ? "text-amber-700"
        : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireManager();
  const properties = await accessibleProperties(user);
  const accessible = properties.map((p) => p.id);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const params = await searchParams;
  const ymd = parseDateParam(params.date);
  const today = todayYMD();

  const dayDate = new Date(`${ymd}T00:00:00.000Z`); // @db.Date comparisons
  const dayStart = etDayStartUtc(ymd); // timestamptz lower bound
  const dayEnd = etDayStartUtc(nextYMD(ymd)); // exclusive upper bound
  const inScope = { propertyId: { in: scopedIds } };
  const notTerminal = { status: { notIn: TERMINAL_JOB_STATUSES } };

  const [
    scheduledToday,
    unscheduledBacklog,
    urgentOpen,
    overdue,
    completedToday,
    activity,
    entries,
  ] = await Promise.all([
    db.contractorJob.count({ where: { ...inScope, scheduledFor: dayDate, ...notTerminal } }),
    db.contractorJob.count({
      where: { ...inScope, scheduledFor: null, status: { in: OPEN_JOB_STATUSES } },
    }),
    db.contractorJob.count({
      where: { ...inScope, urgent: true, status: { in: OPEN_JOB_STATUSES } },
    }),
    db.contractorJob.count({
      where: { ...inScope, scheduledFor: { lt: dayDate }, ...notTerminal },
    }),
    db.contractorJob.count({
      where: {
        ...inScope,
        status: ContractorJobStatus.DONE,
        completedAt: { gte: dayStart, lt: dayEnd },
      },
    }),
    // The day's activity: scheduled for this day, OR completed during it —
    // a job completed today belongs on today's board even if it was scheduled
    // for last week.
    db.contractorJob.findMany({
      where: {
        ...inScope,
        OR: [
          { scheduledFor: dayDate },
          {
            status: ContractorJobStatus.DONE,
            completedAt: { gte: dayStart, lt: dayEnd },
          },
        ],
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
      take: 300,
      select: {
        id: true,
        roomLabel: true,
        trade: true,
        status: true,
        urgent: true,
        property: { select: { shortCode: true } },
        contractor: { select: { name: true } },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    }),
    // A null-property entry is portfolio-wide and shows on every view.
    db.contractorDailyNote.findMany({
      where: {
        forDate: dayDate,
        OR: [{ propertyId: { in: scopedIds } }, { propertyId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        body: true,
        source: true,
        authorLabel: true,
        createdAt: true,
        authorUser: { select: { name: true } },
        property: { select: { shortCode: true } },
      },
    }),
  ]);

  const dayLabel = formatDateInET(dayStart, "EEEE, MMM d, yyyy");
  const dayHref = (target: string) => `/maintenance/daily?date=${toCompact(target)}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily"
        subtitle={`Contractor activity for ${dayLabel}${ymd === today ? " (today)" : ""}`}
      />
      <MaintenanceNav />

      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={dayHref(addDaysYMD(ymd, -1))}
          aria-label="Previous day"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          ←
        </Link>
        <Link
          href={dayHref(today)}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          Today
        </Link>
        <Link
          href={dayHref(addDaysYMD(ymd, 1))}
          aria-label="Next day"
          className="rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
        >
          →
        </Link>
        <Link
          href={`/maintenance/schedule?date=${toCompact(ymd)}&view=day`}
          className="ml-2 text-sm font-medium text-navy hover:underline"
        >
          Open in calendar
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Scheduled today" value={scheduledToday} />
        <Tile label="Unscheduled backlog" value={unscheduledBacklog} tone="warn" />
        <Tile label="Urgent open" value={urgentOpen} tone="alert" />
        <Tile label="Overdue" value={overdue} tone="alert" />
        <Tile label="Completed today" value={completedToday} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No contractor activity recorded for {dayLabel}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Property</th>
                  <th className="px-4 py-2 font-medium">Room</th>
                  <th className="px-4 py-2 font-medium">Trade</th>
                  <th className="px-4 py-2 font-medium">Contractor</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Latest note</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((job) => (
                  <tr
                    key={job.id}
                    className={`border-t border-slate-100 ${job.urgent ? "bg-red-50" : ""}`}
                  >
                    <td className="px-4 py-2 font-semibold text-slate-900">
                      {job.property.shortCode}
                      {job.urgent && (
                        <span className="ml-1.5 text-xs font-bold text-red-700">URGENT</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{job.roomLabel ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-700">{tradeLabel(job.trade)}</td>
                    <td className="px-4 py-2 text-slate-700">
                      {job.contractor?.name ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/maintenance/jobs/${job.id}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {jobStatusLabel(job.status)}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {job.notes[0] ? truncate(job.notes[0].body) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
            Written log
          </h2>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">No written entries for this day yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {entries.map((entry) => (
                <li key={entry.id} className="border-l-2 border-slate-200 pl-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-900">{entry.body}</p>
                  <p className="text-xs text-slate-500">
                    {resolveNoteAuthor({
                      source: entry.source,
                      authorLabel: entry.authorLabel,
                      author: entry.authorUser,
                    })}{" "}
                    · {entry.property?.shortCode ?? "All properties"} ·{" "}
                    {formatInET(entry.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside>
          <DailyNoteComposer
            forDate={ymd}
            properties={properties}
            defaultPropertyId={activeId}
            canPostPortfolioWide={isPortfolioRole(user.role)}
          />
        </aside>
      </div>
    </div>
  );
}
