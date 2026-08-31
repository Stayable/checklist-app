import Link from "next/link";
import { IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { accessiblePropertyIds, requireManager } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { formatInET } from "@/lib/datetime";
import { isSlaBreached } from "@/lib/review";
import {
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_FILTERS,
  ISSUE_STATUS_FILTER_LABEL,
  issueStatusParam,
  issueWhereFilters,
  parseIssueFilters,
} from "@/lib/issue-filters";

// Issues list (Phase 4). Property-scoped; filterable by status + priority via
// search params. English-only manager surface (ADR-013).
//
// W8 (2026-08-31): the chip row is Open | Unassigned | Resolved + the four
// priorities. The raw `Object.values(IssueStatus)` loop is gone — it rendered a
// second chip also labelled "Open" that meant only IssueStatus.OPEN, next to
// the hardcoded one that meant the OPEN + ASSIGNED + IN_PROGRESS rollup. Two
// chips, one word, different results. Filter parsing and the where-clause now
// live in lib/issue-filters.ts so they are unit-tested (see its test file).

const PRIORITY_BADGE: Record<IssuePriority, string> = {
  URGENT: "bg-red-100 text-red-800",
  HIGH: "bg-orange-50 text-orange-700",
  MEDIUM: "bg-amber-50 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const user = await requireManager();
  const filters = parseIssueFilters(await searchParams);
  const statusParam = issueStatusParam(filters.status);

  const propertyIds = await accessiblePropertyIds(user);
  const currentPropertyId = await getCurrentPropertyId(propertyIds);
  const scopeIds = resolveScopedPropertyIds(propertyIds, currentPropertyId);

  const issues = await db.issue.findMany({
    // Scope is emitted inside issueWhereFilters, once. Do not spread another
    // propertyId over this — the later key would win and replace the scope.
    where: issueWhereFilters(filters, scopeIds),
    orderBy: [{ slaTargetAt: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      slaTargetAt: true,
      resolvedAt: true,
      createdAt: true,
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { name: true } },
    },
  });

  const now = new Date();
  const linkFor = (status?: string, priority?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const qs = params.toString();
    return qs ? `/issues?${qs}` : "/issues";
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Issues</h1>
          <p className="text-sm text-slate-500">
            {ISSUE_STATUS_FILTER_LABEL[filters.status]} issues, soonest SLA first
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/review" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            Review queue →
          </Link>
          <Link href="/" className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50">
            Home
          </Link>
        </nav>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        {ISSUE_STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={linkFor(issueStatusParam(s), filters.priority ?? undefined)}
            className={`rounded-full px-3 py-1 font-semibold ${filters.status === s ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {ISSUE_STATUS_FILTER_LABEL[s]}
          </Link>
        ))}
        <span className="mx-2 text-slate-300">|</span>
        {Object.values(IssuePriority).map((p) => (
          <Link
            key={p}
            href={linkFor(statusParam, filters.priority === p ? undefined : p)}
            className={`rounded-full px-3 py-1 font-semibold ${filters.priority === p ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {ISSUE_PRIORITY_LABEL[p]}
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          No matching issues.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Room</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assignee</th>
                <th className="px-4 py-3">SLA target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => {
                const breached = isSlaBreached(issue.slaTargetAt, issue.resolvedAt, now);
                return (
                  <tr key={issue.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/issues/${issue.id}`} className="font-semibold text-slate-900 hover:underline">
                        {issue.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{issue.property.shortCode}</td>
                    <td className="px-4 py-3 text-slate-700">{issue.room?.roomNumber ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_BADGE[issue.priority]}`}>
                        {issue.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{issue.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-slate-700">{issue.assignedUser?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {issue.slaTargetAt ? (
                        <span className={breached ? "font-bold text-red-600" : "text-slate-700"}>
                          {formatInET(issue.slaTargetAt)}
                          {breached ? " · BREACH" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
