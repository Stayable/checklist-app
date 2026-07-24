import Link from "next/link";
import { InstanceStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { formatDateInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { CompletedFilters } from "./CompletedFilters";

const STATUS_PILL: Partial<Record<InstanceStatus, string>> = {
  [InstanceStatus.SUBMITTED]: "bg-blue-50 text-blue-700",
  [InstanceStatus.REVIEWED]: "bg-emerald-50 text-emerald-700",
};

/**
 * Parse a "yyyy-MM-dd" URL param into a UTC-midnight Date for Prisma @db.Date
 * comparisons. The brief suggests etDateOnly(string) but that helper converts
 * via ET-tz which shifts an already-UTC-midnight ISO string back one day.
 * Parsing directly as UTC-midnight is correct for @db.Date columns.
 */
function parseDateParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export default async function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    assignee?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);

  // ET date range → UTC-midnight Date bounds against scheduledFor (@db.Date).
  // Direct parse avoids the ET-tz round-trip that would shift the date back.
  const fromDate = sp.from ? parseDateParam(sp.from) : null;
  const toDate = sp.to ? parseDateParam(sp.to) : null;

  const PAGE_SIZE = 100;
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  const where = {
    propertyId: { in: scopeIds },
    status: { in: [InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED] },
    ...(sp.assignee ? { assignedUserId: sp.assignee } : {}),
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
    orderBy: [{ submittedAt: "desc" }],
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      status: true,
      submittedAt: true,
      scheduledFor: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      assignedUser: { select: { id: true, name: true } },
    },
  });

  // Assignee filter options: users assigned to the in-scope completed set.
  // Derived from the current (possibly already-filtered) result set.
  const assignees = Array.from(
    new Map(
      instances
        .filter((i) => i.assignedUser)
        .map(
          (i) =>
            [
              i.assignedUser!.id,
              { id: i.assignedUser!.id, name: i.assignedUser!.name },
            ] as const,
        ),
    ).values(),
  );

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (sp.assignee) params.set("assignee", sp.assignee);
    params.set("page", String(p));
    return `/completed?${params.toString()}`;
  };
  const firstRow = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const lastRow = (current - 1) * PAGE_SIZE + instances.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Completed checklists"
        subtitle={`${total} completed${pageCount > 1 ? ` · page ${current} of ${pageCount}` : ""}`}
      />
      <CompletedFilters assignees={assignees} />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Checklist</th>
              <th className="px-4 py-2">Property</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">Submitted</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {instances.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-900">
                  {i.title ?? i.template.name}
                </td>
                <td className="px-4 py-2">{i.property.shortCode}</td>
                <td className="px-4 py-2">{i.room?.roomNumber ?? "—"}</td>
                <td className="px-4 py-2">{i.assignedUser?.name ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {i.submittedAt
                    ? formatDateInET(i.submittedAt)
                    : formatDateInET(i.scheduledFor)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[i.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {i.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/review/${i.id}`}
                    className="font-medium text-navy hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {instances.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No completed checklists in this scope/range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Showing {firstRow}–{lastRow} of {total}
          </span>
          <div className="flex gap-2">
            {current > 1 && (
              <Link
                href={pageHref(current - 1)}
                className="rounded-md px-3 py-1.5 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Previous
              </Link>
            )}
            {current < pageCount && (
              <Link
                href={pageHref(current + 1)}
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
