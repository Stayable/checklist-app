// app/dashboard/page.tsx
// Manager alert dashboard (ADR-017 / Plan 5 Task 3). Five count tiles scoped
// to the active property filter (or the user's full accessible set).

import Link from "next/link";
import { InstanceStatus, IssueStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { etDateOnly } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";

// Statuses that count as completed for the day
const DONE: InstanceStatus[] = [InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED];

// Statuses that are still in-flight (not done, not invalidated/expired)
const INCOMPLETE: InstanceStatus[] = [
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
  InstanceStatus.FLAGGED,
];

// Issue statuses that are not yet resolved
const OPEN_ISSUE: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.ASSIGNED,
  IssueStatus.IN_PROGRESS,
];

function AlertTile({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 rounded-lg p-4 ring-1 shadow-sm transition-opacity hover:opacity-90 ${tone}`}
    >
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);
  const today = etDateOnly();
  const now = new Date();

  const [
    todayTotal,
    todayDone,
    overdue,
    unassigned,
    openIssues,
    checklistsWithIssues,
  ] = await Promise.all([
      // All scheduled instances for today (done + in-flight)
      db.checklistInstance.count({
        where: {
          propertyId: { in: scopeIds },
          scheduledFor: today,
          status: { in: [...DONE, ...INCOMPLETE] },
        },
      }),
      // Completed instances for today
      db.checklistInstance.count({
        where: {
          propertyId: { in: scopeIds },
          scheduledFor: today,
          status: { in: DONE },
        },
      }),
      // In-flight instances whose dueAt has passed
      db.checklistInstance.count({
        where: {
          propertyId: { in: scopeIds },
          status: { in: INCOMPLETE },
          dueAt: { lt: now },
        },
      }),
      // In-flight instances with no assignee
      db.checklistInstance.count({
        where: {
          propertyId: { in: scopeIds },
          status: { in: INCOMPLETE },
          assignedUserId: null,
        },
      }),
      // Open issues
      db.issue.count({
        where: {
          propertyId: { in: scopeIds },
          status: { in: OPEN_ISSUE },
        },
      }),
      // Checklists (instances) that have at least one open sourced issue —
      // distinct instances, not the raw issue count.
      db.checklistInstance.count({
        where: {
          propertyId: { in: scopeIds },
          sourcedIssues: { some: { status: { in: OPEN_ISSUE } } },
        },
      }),
    ]);

  const pct =
    todayTotal === 0 ? 0 : Math.round((todayDone / todayTotal) * 100);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        subtitle="Today's status and open work for your properties"
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <AlertTile
          href="/completed"
          label={`Complete today (${todayDone}/${todayTotal})`}
          value={`${pct}%`}
          tone="bg-emerald-50 text-emerald-800 ring-emerald-200"
        />
        <AlertTile
          href="/review"
          label="Incomplete today"
          value={todayTotal - todayDone}
          tone="bg-amber-50 text-amber-800 ring-amber-200"
        />
        <AlertTile
          href="/review"
          label="Overdue"
          value={overdue}
          tone="bg-red-50 text-red-800 ring-red-200"
        />
        <AlertTile
          href="/review"
          label="Unassigned"
          value={unassigned}
          tone="bg-slate-50 text-slate-700 ring-slate-200"
        />
        <AlertTile
          href="/issues"
          label="Open issues"
          value={openIssues}
          tone="bg-blue-50 text-blue-800 ring-blue-200"
        />
        <AlertTile
          href="/reports/issues?status=OPEN"
          label="Checklists with issues"
          value={checklistsWithIssues}
          tone="bg-rose-50 text-rose-800 ring-rose-200"
        />
      </div>
      <p className="text-xs text-slate-400">
        Counts respect the active property filter. ET-anchored.
      </p>
    </div>
  );
}
