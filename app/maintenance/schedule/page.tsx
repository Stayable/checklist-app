import { accessibleProperties, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import {
  buildCells,
  formatViewTitle,
  parseDateParam,
  parseView,
  rangeBounds,
  todayYMD,
  ymdOf,
} from "@/lib/contractor-schedule";
import { OPEN_JOB_STATUSES } from "@/lib/contractors";
import { PageHeader } from "@/components/shell/PageHeader";
import { MaintenanceNav } from "../MaintenanceNav";
import { CalendarGrid, type ScheduleJob } from "./CalendarGrid";
import { BacklogRail } from "./BacklogRail";
import { ScheduleToolbar } from "./ScheduleToolbar";

// Contractor schedule. Date-only by design (Kyle, 2026-08-11): day and week
// are lists rather than hour grids, and no calendar library is involved.

const JOB_SELECT = {
  id: true,
  roomLabel: true,
  trade: true,
  status: true,
  urgent: true,
  scheduledFor: true,
  property: { select: { shortCode: true } },
  contractor: { select: { name: true } },
} as const;

type JobRow = {
  id: string;
  roomLabel: string | null;
  trade: ScheduleJob["trade"];
  status: ScheduleJob["status"];
  urgent: boolean;
  scheduledFor: Date | null;
  property: { shortCode: string };
  contractor: { name: string } | null;
};

function toScheduleJob(row: JobRow): ScheduleJob {
  return {
    id: row.id,
    // "" for a backlog row: the rail never buckets by day, and an empty key
    // can't collide with a real date.
    ymd: row.scheduledFor ? ymdOf(row.scheduledFor) : "",
    propertyShortCode: row.property.shortCode,
    roomLabel: row.roomLabel,
    trade: row.trade,
    status: row.status,
    urgent: row.urgent,
    contractorName: row.contractor?.name ?? null,
    scheduledFor: row.scheduledFor,
  };
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const user = await requireManager();
  const properties = await accessibleProperties(user);
  const accessible = properties.map((p) => p.id);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const params = await searchParams;
  const view = parseView(params.view);
  const anchorYMD = parseDateParam(params.date);
  const today = todayYMD();
  const cells = buildCells(view, anchorYMD, today);
  const { startDate, endDateInclusive } = rangeBounds(cells);

  // Two queries, deliberately not one: the dated range and the backlog answer
  // different questions, and the rail must show the WHOLE backlog no matter
  // which range is on screen. scheduledFor is @db.Date, so UTC-midnight bounds
  // compare exactly — lte the last day clips nothing.
  const [dated, backlog] = await Promise.all([
    db.contractorJob.findMany({
      where: {
        propertyId: { in: scopedIds },
        scheduledFor: { gte: startDate, lte: endDateInclusive },
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
      take: 500,
      select: JOB_SELECT,
    }),
    db.contractorJob.findMany({
      where: {
        propertyId: { in: scopedIds },
        scheduledFor: null,
        status: { in: OPEN_JOB_STATUSES },
      },
      orderBy: [{ urgent: "desc" }, { createdAt: "asc" }],
      take: 200,
      select: JOB_SELECT,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedule"
        subtitle="Contractor work by date. Dates only — no times of day."
      />
      <MaintenanceNav />

      <ScheduleToolbar
        view={view}
        anchorYMD={anchorYMD}
        todayYmd={today}
        title={formatViewTitle(view, cells)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0">
          <CalendarGrid
            view={view}
            cells={cells}
            jobs={dated.map(toScheduleJob)}
            todayYmd={today}
          />
        </div>
        <aside>
          <BacklogRail jobs={backlog.map(toScheduleJob)} />
        </aside>
      </div>
    </div>
  );
}
