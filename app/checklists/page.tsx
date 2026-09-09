import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { InstanceStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYMD, formatDateOnly, ymdOfDateOnly } from "@/lib/datetime";
import { formatMinutes, timeToCompleteMinutes } from "@/lib/review";
import { roomDisplay } from "@/lib/room-label";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChecklistFilters } from "./ChecklistFilters";

export const metadata: Metadata = {
  title: "Checklists — StayCheck",
};

// The checklist index — a dispatch board, not a spreadsheet.
//
// Grouped by scheduled DAY because that is how the work is actually handed
// out; lib/batch-create.ts says the same thing about why it expands date-major
// ("everything for Sept 1, then everything for Sept 2"). A flat table with a
// date column made the reader reassemble that grouping in their head, and on a
// phone — where the on-site managers are — it scrolled sideways.
//
// Ordered ASCENDING, unlike /completed. Completed is history, so newest first.
// This is outstanding work, so the top of the page is the thing that is most
// late, then today, then what is coming.

/** Everything still outstanding — the default view. */
const OPEN_STATUSES = [
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
  InstanceStatus.FLAGGED,
] as const;

/**
 * Status as a colour on a left rail, plus a word.
 *
 * Only two things are allowed to use red: FLAGGED, and a day in the past that
 * still has open work. Everything else stays quiet, so that when something IS
 * red it means something. Colour alone never carries the status — the word is
 * always there too.
 */
const STATUS_RAIL: Record<InstanceStatus, string> = {
  [InstanceStatus.SCHEDULED]: "bg-slate-300",
  [InstanceStatus.ASSIGNED]: "bg-brand",
  [InstanceStatus.IN_PROGRESS]: "bg-gold",
  [InstanceStatus.SUBMITTED]: "bg-sky",
  [InstanceStatus.REVIEWED]: "bg-emerald-500",
  [InstanceStatus.FLAGGED]: "bg-red-500",
  [InstanceStatus.INVALIDATED]: "bg-slate-200",
  [InstanceStatus.EXPIRED]: "bg-slate-200",
};

const STATUS_TEXT: Record<InstanceStatus, string> = {
  [InstanceStatus.SCHEDULED]: "text-slate-500",
  [InstanceStatus.ASSIGNED]: "text-brand",
  [InstanceStatus.IN_PROGRESS]: "text-amber-600",
  [InstanceStatus.SUBMITTED]: "text-sky-700",
  [InstanceStatus.REVIEWED]: "text-emerald-700",
  [InstanceStatus.FLAGGED]: "text-red-600",
  [InstanceStatus.INVALIDATED]: "text-slate-400",
  [InstanceStatus.EXPIRED]: "text-slate-400",
};

const STATUS_WORD: Record<InstanceStatus, string> = {
  [InstanceStatus.SCHEDULED]: "Scheduled",
  [InstanceStatus.ASSIGNED]: "To do",
  [InstanceStatus.IN_PROGRESS]: "Started",
  [InstanceStatus.SUBMITTED]: "Submitted",
  [InstanceStatus.REVIEWED]: "Reviewed",
  [InstanceStatus.FLAGGED]: "Flagged",
  [InstanceStatus.INVALIDATED]: "Cancelled",
  [InstanceStatus.EXPIRED]: "Expired",
};

const OPEN_SET = new Set<InstanceStatus>(OPEN_STATUSES);

/** "yyyy-MM-dd" → UTC-midnight Date, matching a Prisma `@db.Date` bound. */
function parseDateParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Today / Tomorrow / Yesterday, else the weekday and date. */
function dayHeading(ymd: string, todayYmd: string): string {
  if (ymd === todayYmd) return "Today";
  const d = new Date(`${ymd}T00:00:00.000Z`);
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return formatDateOnly(d, "EEEE d MMMM");
}

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    /** "overdue" — past its dueAt and still open. */
    due?: string;
    /** "unassigned" — nobody holds it yet. */
    assignee?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);

  // An unrecognised ?status= falls back to the open set rather than matching
  // nothing, so a hand-edited URL cannot look like an empty property.
  const statusParam = sp.status ?? "";
  const known = (Object.values(InstanceStatus) as string[]).includes(statusParam);
  const statusFilter =
    statusParam === "all"
      ? undefined
      : known
        ? { equals: statusParam as InstanceStatus }
        : { in: [...OPEN_STATUSES] };

  const fromDate = sp.from ? parseDateParam(sp.from) : null;
  const toDate = sp.to ? parseDateParam(sp.to) : null;

  const PAGE_SIZE = 100;
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  // These two mirror the Dashboard tiles EXACTLY, so a tile lands on the set
  // it counted. Overdue keys off `dueAt`, not `scheduledFor` — a checklist
  // scheduled today with an 11am due time is overdue at noon, and a date range
  // could never express that.
  const overdueOnly = sp.due === "overdue";
  const unassignedOnly = sp.assignee === "unassigned";

  const where = {
    propertyId: { in: scopeIds },
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(overdueOnly ? { dueAt: { lt: new Date() } } : {}),
    ...(unassignedOnly ? { assignedUserId: null } : {}),
    ...(fromDate || toDate
      ? {
          scheduledFor: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  const total = await db.checklistInstance.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(requestedPage, pageCount);

  const instances = await db.checklistInstance.findMany({
    where,
    // createdAt is the tiebreak so pagination cannot repeat or drop a row when
    // many share a scheduled day — which a batch create guarantees.
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      status: true,
      scheduledFor: true,
      // Elapsed fill time, for rows that have been submitted. Same pair the
      // review screens read; the arithmetic stays in lib/review so the board
      // and the review queue can never disagree about what a checklist took.
      openedAt: true,
      submittedAt: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      roomLabel: true,
      assignedUser: { select: { name: true } },
    },
  });

  const todayYmd = etYMD();

  // Group into days, preserving the query's order.
  const days: { ymd: string; rows: typeof instances }[] = [];
  for (const i of instances) {
    const ymd = ymdOfDateOnly(i.scheduledFor);
    const last = days[days.length - 1];
    if (last && last.ymd === ymd) last.rows.push(i);
    else days.push({ ymd, rows: [i] });
  }

  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      status: sp.status,
      from: sp.from,
      to: sp.to,
      due: sp.due,
      assignee: sp.assignee,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/checklists?${qs}` : "/checklists";
  };

  const showingProperty = activeId == null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checklists"
        subtitle={
          total === 0
            ? "Nothing outstanding in this scope"
            : `${total} outstanding${pageCount > 1 ? ` · page ${current} of ${pageCount}` : ""}`
        }
        actions={
          <Link
            href="/checklists/new"
            className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Create a checklist
          </Link>
        }
      />

      <ChecklistFilters />

      {days.length === 0 ? (
        // An empty screen is an invitation to act, not a shrug.
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-base font-semibold text-slate-900">
            No checklists to do here
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Finished ones move to Completed. To put new work on the board,
            create a batch — or set a recurring rule so it appears each morning
            on its own.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Link
              href="/checklists/new"
              className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Create a checklist
            </Link>
            <Link
              href="/rules"
              className="rounded-md px-3 py-2 text-sm font-semibold text-navy ring-1 ring-slate-300 hover:bg-slate-50"
            >
              Set a recurring rule
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {days.map(({ ymd, rows }) => {
            const heading = dayHeading(ymd, todayYmd);
            // A past day only counts as late if something on it is still open.
            const late = ymd < todayYmd && rows.some((r) => OPEN_SET.has(r.status));
            return (
              <section key={ymd}>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <h2
                    className={`text-sm font-bold ${late ? "text-red-600" : "text-slate-900"}`}
                  >
                    {heading}
                    {late && (
                      <span className="ml-2 font-semibold">— overdue</span>
                    )}
                  </h2>
                  <span className="text-xs text-slate-400">
                    {formatDateOnly(new Date(`${ymd}T00:00:00.000Z`), "d MMM yyyy")}
                  </span>
                </div>

                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                  {rows.map((i) => {
                    const subject = roomDisplay(i.room, i.roomLabel);
                    return (
                      <li key={i.id}>
                        <Link
                          href={`/checklists/${i.id}`}
                          className="flex items-stretch gap-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                        >
                          {/* Status as a rail: scannable down the left edge
                              without adding a column. */}
                          <span
                            aria-hidden
                            className={`w-1 shrink-0 ${STATUS_RAIL[i.status]}`}
                          />
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3 pr-3">
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-semibold text-slate-900">
                                  {i.template.name}
                                </span>
                                {subject && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                                    {subject}
                                  </span>
                                )}
                                {/* Only when the scope spans properties —
                                    otherwise every row says the same thing. */}
                                {showingProperty && (
                                  <span className="rounded bg-navy/5 px-1.5 py-0.5 text-xs font-semibold text-navy">
                                    {i.property.shortCode}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-sm text-slate-500">
                                {i.assignedUser?.name ?? "Nobody assigned yet"}
                                {/* Only once there is something to report.
                                    Before submission there is no elapsed time,
                                    and a dash on every open row would be noise
                                    rather than information. A submitted row
                                    that was never opened DOES show the dash —
                                    that is a real gap in the data, not a zero. */}
                                {i.submittedAt && (
                                  <> · Took {formatMinutes(
                                    timeToCompleteMinutes(i.openedAt, i.submittedAt),
                                  )}</>
                                )}
                              </span>
                            </span>
                            <span
                              className={`text-sm font-semibold ${STATUS_TEXT[i.status]}`}
                            >
                              {STATUS_WORD[i.status]}
                            </span>
                            <ChevronRight
                              aria-hidden
                              className="size-4 shrink-0 text-slate-300"
                            />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {(current - 1) * PAGE_SIZE + 1}–{(current - 1) * PAGE_SIZE + instances.length} of{" "}
            {total}
          </span>
          <div className="flex gap-2">
            {current > 1 && (
              <Link
                href={hrefWith({ page: String(current - 1) })}
                className="rounded-md px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {current < pageCount && (
              <Link
                href={hrefWith({ page: String(current + 1) })}
                className="rounded-md px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
