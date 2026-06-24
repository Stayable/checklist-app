import { IssueStatus } from "@prisma/client";
import {
  requireManager,
  accessiblePropertyIds,
  accessibleProperties,
} from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etYYYYMMDD, formatDateInET } from "@/lib/datetime";
import { summarizeCompleteness, type StatusCount } from "@/lib/reports";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsNav } from "../ReportsNav";
import { ReportFilters } from "../ReportFilters";

/** Parse a "yyyy-MM-dd" URL param as a UTC-midnight Date for @db.Date comparisons. */
const parseDateParam = (s?: string): Date | null =>
  s ? new Date(`${s}T00:00:00.000Z`) : null;

/** Issue statuses that count as "open" for the with-issues column. */
const OPEN_ISSUE: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.ASSIGNED,
  IssueStatus.IN_PROGRESS,
];

export default async function CompletenessReport({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const properties = await accessibleProperties(user);
  const codeById = new Map(properties.map((p) => [p.id, p.shortCode]));

  const from = parseDateParam(sp.from);
  const to = parseDateParam(sp.to);
  const dateWhere =
    from || to
      ? {
          scheduledFor: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  // Group by (property, day, status) — drives scheduled/complete/incomplete counts.
  const grouped = await db.checklistInstance.groupBy({
    by: ["propertyId", "scheduledFor", "status"],
    where: { propertyId: { in: scopeIds }, ...dateWhere },
    _count: { _all: true },
  });
  const counts: StatusCount[] = grouped.map((g) => ({
    propertyId: g.propertyId,
    scheduledFor: g.scheduledFor,
    status: g.status,
    count: g._count._all,
  }));

  // With-issues per (property, day): count instances that have at least one open
  // sourced issue. The relation on ChecklistInstance is `sourcedIssues` (@relation
  // "IssueSourceInstance"). Deduplication: we count distinct instances, not issues.
  const issueInstances = await db.checklistInstance.findMany({
    where: {
      propertyId: { in: scopeIds },
      ...dateWhere,
      sourcedIssues: { some: { status: { in: OPEN_ISSUE } } },
    },
    select: { propertyId: true, scheduledFor: true },
  });
  const withIssuesByKey: Record<string, number> = {};
  for (const i of issueInstances) {
    const key = `${i.propertyId}|${etYYYYMMDD(i.scheduledFor)}`;
    withIssuesByKey[key] = (withIssuesByKey[key] ?? 0) + 1;
  }

  const rows = summarizeCompleteness(counts, withIssuesByKey, etYYYYMMDD);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        subtitle="Daily completeness across your properties"
      />
      <ReportsNav />
      <ReportFilters pdfHref="/api/reports/completeness/pdf" />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Property</th>
              <th className="px-4 py-2">Scheduled</th>
              <th className="px-4 py-2">Complete</th>
              <th className="px-4 py-2">Incomplete</th>
              <th className="px-4 py-2">With issues</th>
              <th className="px-4 py-2">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.propertyId}|${r.date}`}
                className="border-t border-slate-100"
              >
                <td className="px-4 py-2 text-slate-500">
                  {formatDateInET(
                    new Date(
                      `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}T00:00:00.000Z`,
                    ),
                  )}
                </td>
                <td className="px-4 py-2 font-medium">
                  {codeById.get(r.propertyId) ?? r.propertyId}
                </td>
                <td className="px-4 py-2">{r.scheduled}</td>
                <td className="px-4 py-2 text-emerald-700">{r.completed}</td>
                <td className="px-4 py-2 text-amber-700">{r.incomplete}</td>
                <td className="px-4 py-2 text-red-700">{r.withIssues}</td>
                <td className="px-4 py-2 font-semibold">{r.pct}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No checklists in this scope/range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
