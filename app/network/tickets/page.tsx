import Link from "next/link";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgeBadge } from "@/components/network/AgeBadge";
import { EscalationBadges } from "@/components/network/EscalationBadges";
import { ticketAgeBucket } from "@/lib/network/ticket-age";
import { deviceTypeLabel } from "@/lib/network/device-type";
import { escalationLevel, isOvernight } from "@/lib/network/escalation";
import {
  parseTicketFilters,
  ticketOrderBy,
  ticketWhereFilters,
  type TicketSortKey,
} from "@/lib/network/ticket-filters";
import { TicketFilters } from "./TicketFilters";

// NETWORK ticket list. Filterable by status/type/property/date range via
// query params; default open-only (mirrors app/issues/page.tsx's status-tab
// pattern). Sortable columns, also URL-driven. Access is guarded once by
// app/network/layout.tsx.

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

// Carried Task-6 Minor #4: the generated all-status tab set used to include
// a standalone "OPEN" tab (OPEN status only) alongside the combined "Open"
// tab below (OPEN + IN_PROGRESS) — two tabs that looked nearly identical
// but filtered differently. Dropping OPEN from the generated set keeps the
// combined "Open" as the one open-ticket view and the remaining statuses
// (IN_PROGRESS/RESOLVED/CLOSED) distinct from it.
const OTHER_STATUS_TABS = Object.values(TicketStatus).filter((s) => s !== TicketStatus.OPEN);

type SearchParams = {
  status?: string;
  type?: string;
  property?: string;
  deviceType?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

export default async function NetworkTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const filters = parseTicketFilters({
    status: sp.status,
    ticketType: sp.type,
    propertyId: sp.property,
    deviceType: sp.deviceType,
    from: sp.from,
    to: sp.to,
  });
  const { sortKey, sortDir, orderBy } = ticketOrderBy(sp.sort, sp.dir);

  const now = new Date();
  const [tickets, properties] = await Promise.all([
    db.ticket.findMany({
      where: {
        status: filters.status ?? { in: OPEN_STATUSES },
        ...ticketWhereFilters(filters),
      },
      orderBy,
      take: 200,
      include: {
        property: { select: { shortCode: true } },
        device: { select: { name: true, type: true } },
      },
    }),
    db.property.findMany({
      where: { active: true },
      select: { id: true, shortCode: true },
      orderBy: { shortCode: "asc" },
    }),
  ]);

  // Rebuild the query string with one or more keys overridden, preserving
  // every other active filter/sort param — status tabs, the filter selects,
  // and the sortable column headers all share this so clicking any one of
  // them never clobbers the others.
  const hrefWith = (overrides: Partial<SearchParams>) => {
    const merged: SearchParams = { ...sp, ...overrides };
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) next.set(k, v);
    }
    return next.toString() ? `/network/tickets?${next.toString()}` : "/network/tickets";
  };

  const linkFor = (status?: string) => hrefWith({ status });

  const sortHref = (key: TicketSortKey) =>
    hrefWith({
      sort: key,
      // Same column clicked again -> toggle direction. A different column ->
      // clear dir so it falls back to the default (desc) for its first click.
      dir: sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : undefined,
    });

  // Renders one sortable <th>: a link that sets `sort` (+ toggles `dir` if
  // already active) plus an arrow showing the active direction. Device/Age/
  // Flags are derived/display-only columns and stay plain <th>s below.
  const sortTh = (key: TicketSortKey, label: string) => (
    <th key={key} className="px-4 py-3">
      <Link href={sortHref(key)} className="flex items-center gap-1 hover:text-slate-900">
        {label}
        {sortKey === key && <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>}
      </Link>
    </th>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        subtitle={`${filters.status ? filters.status.replace(/_/g, " ") : "Open"} tickets`}
        actions={
          <Link
            href="/network"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Dashboard →
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={linkFor(undefined)}
          className={`rounded-full px-3 py-1 font-semibold ${!filters.status ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          Open
        </Link>
        {OTHER_STATUS_TABS.map((s) => (
          <Link
            key={s}
            href={linkFor(s)}
            className={`rounded-full px-3 py-1 font-semibold ${filters.status === s ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      <TicketFilters properties={properties} />

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          No matching tickets.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {sortTh("ticketNumber", "Ticket #")}
                {sortTh("property", "Property")}
                {sortTh("ticketType", "Type")}
                {sortTh("status", "Status")}
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Device type</th>
                {sortTh("openedAt", "Opened")}
                {sortTh("resolvedAt", "Resolved")}
                <th className="px-4 py-3">Age</th>
                <th className="px-4 py-3">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const isOpen = OPEN_STATUSES.includes(t.status);
                const bucket = isOpen ? ticketAgeBucket(t.openedAt, now) : null;
                const escalated =
                  escalationLevel({ openedAt: t.openedAt, now, status: t.status }) === "ESCALATED";
                const overnight = isOvernight(t.openedAt);
                return (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/network/tickets/${t.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.property.shortCode}</td>
                    <td className="px-4 py-3 text-slate-700">{t.ticketType}</td>
                    <td className="px-4 py-3 text-slate-700">{t.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-slate-700">{t.device?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {deviceTypeLabel(t.device?.type)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatInET(t.openedAt)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.resolvedAt ? formatInET(t.resolvedAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {bucket ? (
                        <AgeBadge bucket={bucket} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <EscalationBadges escalated={escalated} overnight={overnight} />
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
