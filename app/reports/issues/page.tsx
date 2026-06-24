import { IssueStatus, IssuePriority } from "@prisma/client";
import {
  requireManager,
  accessiblePropertyIds,
  accessibleProperties,
} from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { formatDateInET } from "@/lib/datetime";
import { isSlaBreached } from "@/lib/review";
import { PageHeader } from "@/components/shell/PageHeader";
import { ReportsNav } from "../ReportsNav";
import { ReportFilters } from "../ReportFilters";
import { ParamSelect } from "../ParamSelect";

// MANAGER+ report — issues found, property-scoped, with date/status/priority filters.
// English-only surface (ADR-013).

const parseDateParam = (s?: string): Date | null =>
  s ? new Date(`${s}T00:00:00.000Z`) : null;

const PRIORITY_BADGE: Record<IssuePriority, string> = {
  URGENT: "bg-red-100 text-red-800",
  HIGH: "bg-orange-50 text-orange-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

const STATUS_OPTIONS = Object.values(IssueStatus).map((s) => ({
  value: s,
  label: s.replace(/_/g, " "),
}));

const PRIORITY_OPTIONS = Object.values(IssuePriority).map((p) => ({
  value: p,
  label: p,
}));

export default async function IssuesReport({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    status?: string;
    priority?: string;
  }>;
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
  const statusFilter =
    sp.status && sp.status in IssueStatus ? (sp.status as IssueStatus) : null;
  const priorityFilter =
    sp.priority && sp.priority in IssuePriority
      ? (sp.priority as IssuePriority)
      : null;

  const issues = await db.issue.findMany({
    where: {
      propertyId: { in: scopeIds },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(priorityFilter ? { priority: priorityFilter } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      slaTargetAt: true,
      resolvedAt: true,
      createdAt: true,
      propertyId: true,
      room: { select: { roomNumber: true } },
      sourceInstance: {
        select: {
          id: true,
          title: true,
          template: { select: { name: true } },
        },
      },
    },
  });

  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reports" subtitle="Issues found, grouped by checklist" />
      <ReportsNav />
      <ReportFilters pdfHref="/api/reports/issues/pdf">
        <ParamSelect
          label="Status"
          paramKey="status"
          options={STATUS_OPTIONS}
        />
        <ParamSelect
          label="Priority"
          paramKey="priority"
          options={PRIORITY_OPTIONS}
        />
      </ReportFilters>
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Issue</th>
              <th className="px-4 py-3">From checklist</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {issues.map((issue) => {
              const breached = isSlaBreached(
                issue.slaTargetAt,
                issue.resolvedAt,
                now,
              );
              const checklistLabel = issue.sourceInstance
                ? (issue.sourceInstance.title ??
                  issue.sourceInstance.template.name)
                : "—";
              return (
                <tr
                  key={issue.id}
                  className={`hover:bg-slate-50 ${breached ? "bg-red-50/40" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {issue.title}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{checklistLabel}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {codeById.get(issue.propertyId) ?? issue.propertyId}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {issue.room?.roomNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_BADGE[issue.priority]}`}
                    >
                      {issue.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {issue.status.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateInET(issue.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {breached ? (
                      <span className="font-semibold text-red-700">
                        Breached
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {issues.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No issues in this scope / range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
