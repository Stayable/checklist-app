import Link from "next/link";
import { DeviceStatus, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgeBadge } from "@/components/network/AgeBadge";
import { EscalationBadges } from "@/components/network/EscalationBadges";
import { ticketAgeBucket } from "@/lib/network/ticket-age";
import { escalationLevel, isOvernight } from "@/lib/network/escalation";
import { isTeamsGraphConfigured } from "@/lib/network/teams-config";

// NETWORK portfolio dashboard (spec §6.1). Access is guarded once by
// app/network/layout.tsx. Portfolio-wide — no property scoping (see
// lib/rbac.ts canAccessNetwork).

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

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

  const [
    openTickets,
    devicesOffline,
    devicesUnknown,
    devicesTotal,
    resolvedLast30d,
    recentlyClosed,
  ] = await Promise.all([
    db.ticket.findMany({
      where: { status: { in: OPEN_STATUSES } },
      orderBy: { openedAt: "asc" },
      include: {
        property: { select: { shortCode: true } },
        device: { select: { name: true } },
      },
    }),
    db.device.count({ where: { currentStatus: DeviceStatus.OFFLINE } }),
    // N4: devices whose console can't be reached are UNKNOWN, not OFFLINE, so
    // they must be counted and shown separately — an unmonitored fleet must
    // never render as a healthy one.
    db.device.count({ where: { currentStatus: DeviceStatus.UNKNOWN } }),
    db.device.count(),
    db.ticket.findMany({
      where: {
        status: TicketStatus.RESOLVED,
        resolvedAt: { gte: thirtyDaysAgo },
        downDurationMin: { not: null },
      },
      select: { downDurationMin: true },
    }),
    // Recently closed work (Kate's request 2026-07-28). RESOLVED and CLOSED
    // together: the distinction is internal bookkeeping, and a dashboard reader
    // asking "what got fixed" means both. Ordered by when it actually finished,
    // falling back to updatedAt for rows closed without a resolvedAt stamp.
    db.ticket.findMany({
      where: { status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] } },
      orderBy: [{ resolvedAt: "desc" }, { updatedAt: "desc" }],
      take: 25,
      select: {
        id: true,
        ticketNumber: true,
        ticketType: true,
        status: true,
        openedAt: true,
        resolvedAt: true,
        updatedAt: true,
        downDurationMin: true,
        assignedTo: true,
        property: { select: { shortCode: true } },
        device: { select: { name: true } },
      },
    }),
  ]);

  const propertiesWithIssues = new Set(openTickets.map((t) => t.propertyId)).size;
  // Task 10 (display-only, spec §9): escalation is a placeholder threshold
  // and drives no notifications — see lib/network/escalation.ts.
  const escalatedCount = openTickets.filter(
    (t) => escalationLevel({ openedAt: t.openedAt, now, status: t.status }) === "ESCALATED",
  ).length;
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

      {devicesTotal === 0 && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
          <span className="font-semibold">No devices are being monitored yet.</span> This is an
          empty state, not an all-clear — nothing here reflects the real network until the UniFi
          poll has run against a registered console.
        </p>
      )}

      {devicesUnknown > 0 && (
        <p className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-900 ring-1 ring-violet-200">
          <span className="font-semibold">
            {devicesUnknown} device{devicesUnknown === 1 ? "" : "s"} in an unknown state.
          </span>{" "}
          Their console is unreachable, so their status could not be verified — they are not
          confirmed up. See the open monitoring-blind ticket for the affected property.
        </p>
      )}

      {!isTeamsGraphConfigured() && (
        <p className="text-xs text-slate-400">
          Teams notifications: not configured — ticket events are logged, not posted.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          label="Open tickets"
          value={openTickets.length}
          tone="bg-red-50 text-red-800 ring-red-200"
        />
        <SummaryCard
          label="Escalated"
          value={escalatedCount}
          tone="bg-rose-50 text-rose-800 ring-rose-200"
        />
        <SummaryCard
          label="Devices currently offline"
          value={devicesOffline}
          tone="bg-amber-50 text-amber-800 ring-amber-200"
        />
        <SummaryCard
          label="Unverifiable (console unreachable)"
          value={devicesUnknown}
          tone="bg-violet-50 text-violet-800 ring-violet-200"
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
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openTickets.map((t) => {
                  const bucket = ticketAgeBucket(t.openedAt, now);
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
                      <td className="px-4 py-3 text-slate-700">{t.device?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <AgeBadge bucket={bucket} />
                      </td>
                      <td className="px-4 py-3">
                        <EscalationBadges escalated={escalated} overnight={overnight} />
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

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Recently resolved &amp; closed
          <span className="ml-2 font-normal text-slate-400">last 25</span>
        </h2>
        {recentlyClosed.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">
            Nothing resolved yet — no ticket has been closed on this system.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket #</th>
                  <th className="px-4 py-3">Property</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Down for</th>
                  <th className="px-4 py-3">Handled by</th>
                  <th className="px-4 py-3">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentlyClosed.map((t) => (
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
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ring-1 ${
                          t.status === TicketStatus.RESOLVED
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {t.status === TicketStatus.RESOLVED ? "Resolved" : "Closed"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.downDurationMin == null ? "—" : `${t.downDurationMin} min`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.assignedTo ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatInET(t.resolvedAt ?? t.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
