import Link from "next/link";
import { JobStatus, Trade } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { tradeLabel } from "@/lib/contractors";
import { JOB_STATUS_ORDER, OPEN_JOB_STATUSES, jobStatusLabel, sortJobs } from "@/lib/contractor-jobs";
import { DispatchFilters } from "./DispatchFilters";

// Contractor-job queue (T2). Manager-or-above, property-scoped via the header
// picker. Sorted urgent-first then newest — a dispatcher is asking "what needs
// me now", not "what is oldest".

type SearchParams = Promise<{ status?: string; trade?: string; urgent?: string }>;

const STATUS_TONE: Record<JobStatus, string> = {
  [JobStatus.OPEN]: "bg-amber-50 text-amber-800 ring-amber-200",
  [JobStatus.DISPATCHED]: "bg-blue-50 text-blue-800 ring-blue-200",
  [JobStatus.IN_PROGRESS]: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  [JobStatus.COMPLETED]: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  [JobStatus.CANCELLED]: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireManager();
  const params = await searchParams;
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopedIds = resolveScopedPropertyIds(accessible, activeId);

  const statusFilter =
    params.status && (JOB_STATUS_ORDER as string[]).includes(params.status)
      ? (params.status as JobStatus)
      : null;
  const tradeFilter =
    params.trade && (Object.values(Trade) as string[]).includes(params.trade)
      ? (params.trade as Trade)
      : null;
  const urgentOnly = params.urgent === "1";

  const jobs = await db.contractorJob.findMany({
    where: {
      propertyId: { in: scopedIds },
      // Default view is live work only — a queue that also lists everything ever
      // completed stops being a queue.
      status: statusFilter ? statusFilter : { in: OPEN_JOB_STATUSES },
      ...(tradeFilter ? { trade: tradeFilter } : {}),
      ...(urgentOnly ? { urgent: true } : {}),
    },
    select: {
      id: true,
      roomLabel: true,
      trade: true,
      problem: true,
      urgent: true,
      status: true,
      createdAt: true,
      property: { select: { shortCode: true } },
      contractor: { select: { name: true, company: true } },
      _count: { select: { photos: true } },
    },
    take: 200,
  });

  const rows = sortJobs(jobs);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dispatch"
        subtitle="Contractor jobs — urgent first"
        actions={
          <Link
            href="/dispatch/new"
            className="rounded-lg bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            New job
          </Link>
        }
      />

      <DispatchFilters />

      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-600 ring-1 ring-slate-200">
          No contractor jobs match this view.{" "}
          <Link href="/dispatch/new" className="font-semibold text-blue-700 hover:underline">
            Raise one →
          </Link>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Prop</th>
                <th className="px-3 py-2">Trade</th>
                <th className="px-3 py-2">Where</th>
                <th className="px-3 py-2">Problem</th>
                <th className="px-3 py-2">Contractor</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((j) => (
                <tr key={j.id} className={j.urgent ? "bg-red-50/40" : undefined}>
                  <td className="px-3 py-2 font-semibold">{j.property.shortCode}</td>
                  <td className="px-3 py-2">{tradeLabel(j.trade)}</td>
                  <td className="px-3 py-2 text-slate-600">{j.roomLabel ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/dispatch/${j.id}`} className="font-medium text-blue-700 hover:underline">
                      {j.problem.length > 70 ? `${j.problem.slice(0, 70)}…` : j.problem}
                    </Link>
                    {j.urgent && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-800">
                        URGENT
                      </span>
                    )}
                    {j._count.photos > 0 && (
                      <span className="ml-2 text-xs text-slate-400">{j._count.photos} photo(s)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {j.contractor ? j.contractor.name : <span className="text-slate-400">Unassigned</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${STATUS_TONE[j.status]}`}
                    >
                      {jobStatusLabel(j.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {formatInET(j.createdAt, "MMM d, h:mm a")} ET
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length === 200 && (
        <p className="text-xs text-slate-400">
          Showing the first 200 jobs. Narrow the filters to see more.
        </p>
      )}
    </div>
  );
}
