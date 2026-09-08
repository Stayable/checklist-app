import Link from "next/link";
import type { Metadata } from "next";
import { InstanceStatus } from "@prisma/client";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { getCurrentPropertyId } from "@/lib/current-property";
import { resolveScopedPropertyIds } from "@/lib/property-scope";
import { db } from "@/lib/db";
import { formatDateInET } from "@/lib/datetime";
import { roomDisplay } from "@/lib/room-label";
import { PageHeader } from "@/components/shell/PageHeader";
import { ChecklistFilters } from "./ChecklistFilters";

export const metadata: Metadata = {
  title: "Checklists — StayCheck",
};

// The checklist index.
//
// This route did not exist until 2026-09-08, which was a 404 with a trigger:
// the batch wizard redirects here whenever a run creates more than one
// checklist (`/checklists/${id}` only when exactly one), so creating a batch —
// the whole point of the wizard — always landed on "This page could not be
// found." Nothing else in the app linked here, so it went unnoticed until
// somebody created a real batch.
//
// Deliberately the complement of /completed, which owns SUBMITTED + REVIEWED.
// This is the work that still has to happen, newest scheduled day first, and
// each row opens the FILL page rather than the review page — you arrive here
// straight from creating, so the next useful action is doing one.

/** Everything that is still outstanding — the default view. */
const OPEN_STATUSES = [
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
  InstanceStatus.FLAGGED,
] as const;

const STATUS_PILL: Partial<Record<InstanceStatus, string>> = {
  [InstanceStatus.SCHEDULED]: "bg-slate-100 text-slate-600",
  [InstanceStatus.ASSIGNED]: "bg-sky-50 text-sky-700",
  [InstanceStatus.IN_PROGRESS]: "bg-amber-50 text-amber-700",
  [InstanceStatus.SUBMITTED]: "bg-blue-50 text-blue-700",
  [InstanceStatus.REVIEWED]: "bg-emerald-50 text-emerald-700",
  [InstanceStatus.FLAGGED]: "bg-red-50 text-red-700",
  [InstanceStatus.INVALIDATED]: "bg-slate-100 text-slate-400",
  [InstanceStatus.EXPIRED]: "bg-slate-100 text-slate-400",
};

/**
 * "yyyy-MM-dd" → UTC-midnight Date for a Prisma @db.Date comparison.
 * Parsed directly rather than through etDateOnly, which would convert an
 * already-UTC-midnight string via ET and shift it back a day (same reasoning
 * as /completed).
 */
function parseDateParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export default async function ChecklistsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const activeId = await getCurrentPropertyId(accessible);
  const scopeIds = resolveScopedPropertyIds(accessible, activeId);

  // An unrecognised ?status= falls back to the open set rather than erroring or
  // silently matching nothing — a hand-edited URL should not look like an empty
  // property.
  const statusParam = sp.status ?? "";
  const known = (Object.values(InstanceStatus) as string[]).includes(statusParam);
  const statusFilter = statusParam === "all"
    ? undefined
    : known
      ? { equals: statusParam as InstanceStatus }
      : { in: [...OPEN_STATUSES] };

  const fromDate = sp.from ? parseDateParam(sp.from) : null;
  const toDate = sp.to ? parseDateParam(sp.to) : null;

  const PAGE_SIZE = 100;
  const requestedPage = Math.max(1, Number(sp.page) || 1);

  const where = {
    propertyId: { in: scopeIds },
    ...(statusFilter ? { status: statusFilter } : {}),
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
    // Newest scheduled day first, then a stable tiebreak so pagination cannot
    // repeat or drop a row between pages.
    orderBy: [{ scheduledFor: "desc" }, { createdAt: "desc" }],
    skip: (current - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      title: true,
      status: true,
      scheduledFor: true,
      template: { select: { name: true } },
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      roomLabel: true,
      assignedUser: { select: { name: true } },
    },
  });

  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status: sp.status, from: sp.from, to: sp.to, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `/checklists?${qs}` : "/checklists";
  };
  const firstRow = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const lastRow = (current - 1) * PAGE_SIZE + instances.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Checklists"
        subtitle={`${total} in this scope${pageCount > 1 ? ` · page ${current} of ${pageCount}` : ""}`}
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

      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Checklist</th>
              <th className="px-4 py-2">Property</th>
              <th className="px-4 py-2">Unit</th>
              <th className="px-4 py-2">Assignee</th>
              <th className="px-4 py-2">Scheduled</th>
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
                <td className="px-4 py-2">
                  {roomDisplay(i.room, i.roomLabel) ?? "—"}
                </td>
                <td className="px-4 py-2">{i.assignedUser?.name ?? "Unassigned"}</td>
                <td className="px-4 py-2 text-slate-500">
                  {formatDateInET(i.scheduledFor)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL[i.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {i.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {/* The FILL page, not /review — this list is outstanding work. */}
                  <Link
                    href={`/checklists/${i.id}`}
                    className="font-medium text-navy hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {instances.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Nothing here. Create one, or widen the filter — completed
                  checklists live under Completed.
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
