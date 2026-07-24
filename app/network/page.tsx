import Link from "next/link";
import { DeviceStatus, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { ticketAgeBucket, type AgeBucket } from "@/lib/network/ticket-age";

// NETWORK portfolio dashboard (spec §6.1). Access is guarded once by
// app/network/layout.tsx. Portfolio-wide — no property scoping (see
// lib/rbac.ts canAccessNetwork).

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

const AGE_DOT: Record<AgeBucket, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
};

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg p-4 ring-1 shadow-sm ${tone}`}>
      <span className="text-3xl font-bold">{value}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export default async function NetworkDashboardPage() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [openTickets, devicesOffline, resolvedLast30d] = await Promise.all([
    db.ticket.findMany({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: { openedAt: "asc" },
      include: {
        property: { select: { shortCode: true } },
        device: { select: { name: true } },
      },
    }),
    db.device.count({ where: { currentStatus: DeviceStatus.OFFLINE } }),
    db.ticket.findMany({
      where: {
        status: TicketStatus.RESOLVED,
        resolvedAt: { gte: thirtyDaysAgo },
        downDurationMin: { not: null },
      },
      select: { downDurationMin: true },
    }),
  ]);

  const propertiesWithIssues = new Set(openTickets.map((t) => t.propertyId)).size;
  const avgResolutionMin =
    resolvedLast30d.length === 0
      ? null
      : Math.round(
          resolvedLast30d.reduce((sum, t) => sum + (t.downDurationMin ?? 0), 0) /
            resolvedLast30d.length,
        );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Network"
        subtitle="Portfolio-wide device monitoring & IT ticketing"
        actions={
          <Link
            href="/network/tickets"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            All tickets →
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Open tickets"
          value={openTickets.length}
          tone="bg-red-50 text-red-800 ring-red-200"
        />
        <SummaryCard
          label="Devices currently offline"
          value={devicesOffline}
          tone="bg-amber-50 text-amber-800 ring-amber-200"
        />
        <SummaryCard
          label="Properties with issues"
          value={propertiesWithIssues}
          tone="bg-orange-50 text-orange-800 ring-orange-200"
        />
        <SummaryCard
          label="Avg resolution time (30d)"
          value={avgResolutionMin === null ? "—" : `${avgResolutionMin} min`}
          tone="bg-slate-50 text-slate-700 ring-slate-200"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Open tickets
        </h2>
        {openTickets.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No open tickets.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket #</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Age</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openTickets.map((t) => {
                  const bucket = ticketAgeBucket(t.openedAt, now);
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
                      <td className="px-4 py-3 text-slate-700">{t.device?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${AGE_DOT[bucket]}`} />
                          {bucket}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatInET(t.openedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
