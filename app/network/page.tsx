import Link from "next/link";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireNetworkAccess } from "@/lib/rbac";
import { formatInET } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/PageHeader";
import { AgeBadge } from "@/components/network/AgeBadge";
import { EscalationBadges } from "@/components/network/EscalationBadges";
import { ticketAgeBucket } from "@/lib/network/ticket-age";
import { escalationLevel, isOvernight } from "@/lib/network/escalation";
import { isAnyTeamsWebhookConfigured } from "@/lib/network/teams-routing";
import { loadNetworkOverview } from "@/lib/network/overview.server";
import { networkScopeFor } from "@/lib/network/scope.server";
import { scopeWhere } from "@/lib/network/scope";
import { resolveRange } from "@/lib/network/wifi-range";
import { DashboardRangeFilter } from "./DashboardRangeFilter";

// NETWORK portfolio dashboard (spec §6.1). Access is guarded once by
// app/network/layout.tsx. Portfolio-wide — no property scoping (see
// lib/rbac.ts canAccessNetwork).
//
// The cards and the per-property table come from lib/network/overview.server.ts,
// shared with the 9 AM ET Teams digest so the two can never disagree about how
// many tickets are open.

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

export default async function NetworkDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  // Guarded by the section layout too; repeated here because this page now
  // resolves a per-user property scope and must not depend on a parent for the
  // identity it scopes by.
  const user = await requireNetworkAccess();

  const now = new Date();
  // Date range (Kyle 2026-08-01). Applies to RESOLVED work only — open tickets
  // and device status are present-tense facts, and filtering "what is broken
  // right now" by a historical window would be meaningless.
  const range = resolveRange((await searchParams).range, now);

  const scope = await networkScopeFor(user);

  const [overview, recentlyClosed] = await Promise.all([
    loadNetworkOverview({ now, rangeFrom: range.from, scope }),
    // Recently closed work (Kate's request 2026-07-28). RESOLVED and CLOSED
    // together: the distinction is internal bookkeeping, and a dashboard reader
    // asking "what got fixed" means both. Ordered by when it actually finished,
    // falling back to updatedAt for rows closed without a resolvedAt stamp.
    // Stays here rather than in the shared loader — the digest doesn't post it.
    db.ticket.findMany({
      where: { ...scopeWhere(scope), status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] } },
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

  const {
    cards: {
      openTickets: openTicketCount,
      escalated: escalatedCount,
      devicesOffline,
      devicesUnknown,
      devicesTotal,
      propertiesWithIssues,
      resolvedInRange: resolvedCountInRange,
      avgResolutionMin,
    },
    properties: propertyRows,
    openTicketList: openTickets,
  } = overview;

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

      {!isAnyTeamsWebhookConfigured() && (
        <p className="text-xs text-slate-400">
          Teams notifications: not configured — ticket events are logged, not posted.
        </p>
      )}

      <DashboardRangeFilter />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <SummaryCard
          label="Open tickets"
          value={openTicketCount}
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
          label={`Resolved · ${range.label}`}
          value={resolvedCountInRange}
          tone="bg-emerald-50 text-emerald-800 ring-emerald-200"
        />
        <SummaryCard
          label={`Avg resolution time · ${range.label}`}
          value={avgResolutionMin === null ? "—" : `${avgResolutionMin} min`}
          tone="bg-slate-50 text-slate-700 ring-slate-200"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Status by property
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Devices</th>
                <th className="px-4 py-3">Online</th>
                <th className="px-4 py-3">Offline</th>
                <th className="px-4 py-3">Unverifiable</th>
                <th className="px-4 py-3">Open tickets</th>
                <th className="px-4 py-3">Resolved · {range.label}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {propertyRows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/network/properties/${p.id}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {p.shortCode}
                    </Link>{" "}
                    <span className="text-slate-400">{p.name}</span>
                  </td>
                  {/* A property with zero devices is a COVERAGE GAP, not a
                      healthy one. Say so rather than printing a bare 0 that
                      reads like "nothing wrong here". */}
                  <td className="px-4 py-3 text-slate-700">
                    {p.total === 0 ? (
                      <span className="text-amber-700">not monitored</span>
                    ) : (
                      p.total
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.total === 0 ? "—" : p.online}</td>
                  <td
                    className={`px-4 py-3 ${p.offline > 0 ? "font-semibold text-amber-800" : "text-slate-400"}`}
                  >
                    {p.total === 0 ? "—" : p.offline}
                  </td>
                  <td
                    className={`px-4 py-3 ${p.unknown > 0 ? "font-semibold text-violet-800" : "text-slate-400"}`}
                  >
                    {p.total === 0 ? "—" : p.unknown}
                  </td>
                  <td
                    className={`px-4 py-3 ${p.open > 0 ? "font-semibold text-red-800" : "text-slate-400"}`}
                  >
                    {p.open}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                      <td className="px-4 py-3 text-slate-700">{t.propertyShortCode}</td>
                      <td className="px-4 py-3 text-slate-700">{t.ticketType}</td>
                      <td className="px-4 py-3 text-slate-700">{t.deviceName ?? "—"}</td>
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
