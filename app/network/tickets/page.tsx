import Link from "next/link";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgeBadge } from "@/components/network/AgeBadge";
import { ticketAgeBucket } from "@/lib/network/ticket-age";

// NETWORK ticket list. Filterable by status via a query param; default
// open-only (mirrors app/issues/page.tsx's status-tab pattern). Access is
// guarded once by app/network/layout.tsx.

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

// Carried Task-6 Minor #4: the generated all-status tab set used to include
// a standalone "OPEN" tab (OPEN status only) alongside the combined "Open"
// tab below (OPEN + IN_PROGRESS) — two tabs that looked nearly identical
// but filtered differently. Dropping OPEN from the generated set keeps the
// combined "Open" as the one open-ticket view and the remaining statuses
// (IN_PROGRESS/RESOLVED/CLOSED) distinct from it.
const OTHER_STATUS_TABS = Object.values(TicketStatus).filter((s) => s !== TicketStatus.OPEN);

export default async function NetworkTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const statusFilter =
    rawStatus && rawStatus in TicketStatus ? (rawStatus as TicketStatus) : null;

  const now = new Date();
  const tickets = await db.ticket.findMany({
    where: statusFilter ? { status: statusFilter } : { status: { in: OPEN_STATUSES } },
    orderBy: { openedAt: "desc" },
    take: 200,
    include: {
      property: { select: { shortCode: true } },
      device: { select: { name: true } },
    },
  });

  const linkFor = (status?: string) =>
    status ? `/network/tickets?status=${status}` : "/network/tickets";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tickets"
        subtitle={`${statusFilter ? statusFilter.replace(/_/g, " ") : "Open"} tickets, newest first`}
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
          className={`rounded-full px-3 py-1 font-semibold ${!statusFilter ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
        >
          Open
        </Link>
        {OTHER_STATUS_TABS.map((s) => (
          <Link
            key={s}
            href={linkFor(s)}
            className={`rounded-full px-3 py-1 font-semibold ${statusFilter === s ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {s.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
          No matching tickets.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Ticket #</th>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Age</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((t) => {
                const isOpen = OPEN_STATUSES.includes(t.status);
                const bucket = isOpen ? ticketAgeBucket(t.openedAt, now) : null;
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
                    <td className="px-4 py-3 text-slate-700">{formatInET(t.openedAt)}</td>
                    <td className="px-4 py-3">
                      {bucket ? (
                        <AgeBadge bucket={bucket} />
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
