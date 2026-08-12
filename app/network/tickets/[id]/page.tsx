import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketStatus, TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireNetworkAccess } from "@/lib/rbac";
import { networkScopeFor } from "@/lib/network/scope.server";
import { isInScope } from "@/lib/network/scope";
import { formatInET } from "@/lib/datetime";
import { AgeBadge } from "@/components/network/AgeBadge";
import { ticketAgeBucket } from "@/lib/network/ticket-age";
import { escalationLevel, isOvernight } from "@/lib/network/escalation";
import { EscalationBadges } from "@/components/network/EscalationBadges";
import type { AffectedDevice } from "@/lib/network/mass-outage";
import {
  teamsDeliveryNote,
  teamsDeliveryTone,
  teamsEventLabel,
  teamsTargetLabel,
} from "@/lib/network/teams-delivery-labels";
import { TicketActions } from "./TicketActions";

// NETWORK ticket detail (spec §6.3). Mirrors app/review/[id]/page.tsx's
// detail + client-actions-island + audit-timeline pattern.
//
// Section access is guarded by app/network/layout.tsx; the PROPERTY check below
// is separate and belongs here. A scoped manager who is allowed into /network
// must still not be able to open another property's ticket by pasting its id,
// and a 404 (not a redirect) is the right answer -- it does not confirm the
// ticket exists.

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireNetworkAccess();
  const scope = await networkScopeFor(user);
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, shortCode: true, teamsChannelId: true } },
      device: { select: { id: true, name: true } },
      parentTicket: { select: { id: true, ticketNumber: true } },
      childTickets: {
        select: { id: true, ticketNumber: true, status: true },
        orderBy: { ticketNumber: "asc" },
      },
      notes: { orderBy: { createdAt: "asc" } },
    },
  });
  // Out of scope reads as "no such ticket" on purpose — a 403 would confirm
  // that a ticket with this id exists at a property this user cannot see.
  if (!ticket || !isInScope(scope, ticket.propertyId)) notFound();

  // Event timeline (spec §6.3): the ticket's own device's events for a
  // STANDARD ticket; the whole affected-devices cluster's events for a
  // MASS_OUTAGE ticket. NetworkEvent.ticketId is only ever populated on the
  // single triggering PROBLEM event (see ticketing.server.ts), so the
  // timeline here is deliberately built by deviceId, not the ticket relation.
  const affected = (ticket.affectedDevices as unknown as AffectedDevice[] | null) ?? [];
  const eventDeviceIds =
    ticket.ticketType === TicketType.MASS_OUTAGE
      ? affected.map((d) => d.deviceId)
      : ticket.deviceId
        ? [ticket.deviceId]
        : [];

  const events =
    eventDeviceIds.length === 0
      ? []
      : await db.networkEvent.findMany({
          where: { deviceId: { in: eventDeviceIds } },
          orderBy: { occurredAt: "desc" },
          take: 100,
          include: { device: { select: { name: true } } },
        });

  const now = new Date();
  const isOpen = ticket.status === TicketStatus.OPEN || ticket.status === TicketStatus.IN_PROGRESS;
  const bucket = isOpen ? ticketAgeBucket(ticket.openedAt, now) : null;
  // Task 10 (display-only, spec §9): escalation threshold is a documented
  // placeholder (like the SLA defaults) and drives no notifications; the
  // overnight tag is informational only.
  const escalated =
    escalationLevel({ openedAt: ticket.openedAt, now, status: ticket.status }) === "ESCALATED";
  const overnight = isOvernight(ticket.openedAt);
  // What actually happened in Teams for this ticket, read from the delivery
  // log rather than inferred from config.
  //
  // This replaced a "Teams: not configured" badge derived from
  // isPropertyTeamsConfigured(), which tests Graph creds + Property.
  // teamsChannelId — both from the original Graph design (ADR-026) that
  // ADR-027 replaced with per-channel webhooks. No property has ever had
  // teamsChannelId set, so that badge read "not configured" on every ticket in
  // production while these rows show the posts genuinely SENT. It was false,
  // not just noisy.
  const teamsDeliveries = await db.notificationLog.findMany({
    where: { channel: "TEAMS", entityType: "ticket", entityId: ticket.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, event: true, status: true, target: true, error: true, createdAt: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/network/tickets" className="text-sm text-slate-500 hover:underline">
          ← Tickets
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{ticket.ticketNumber}</h1>
        <p className="text-sm text-slate-500">
          {ticket.property.shortCode} · {ticket.ticketType} · {ticket.status.replace(/_/g, " ")}
          {bucket && (
            <>
              {" · "}
              <AgeBadge bucket={bucket} />
            </>
          )}
          {(escalated || overnight) && (
            <>
              {" · "}
              <EscalationBadges escalated={escalated} overnight={overnight} />
            </>
          )}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Details
            </h2>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-slate-500">Device</dt>
              <dd className="text-slate-900">
                {ticket.device ? (
                  <Link
                    href={`/network/devices/${ticket.device.id}`}
                    className="font-semibold hover:underline"
                  >
                    {ticket.device.name}
                  </Link>
                ) : (
                  "— (mass outage)"
                )}
              </dd>
              <dt className="text-slate-500">Assigned to</dt>
              <dd className="text-slate-900">
                {ticket.assignedTo ?? "Unassigned"}
                {ticket.assignedTo && (
                  <span className="ml-1.5 text-xs text-slate-400">(label only, not notified)</span>
                )}
              </dd>
              <dt className="text-slate-500">Opened</dt>
              <dd className="text-slate-900">{formatInET(ticket.openedAt)}</dd>
              <dt className="text-slate-500">Resolved</dt>
              <dd className="text-slate-900">
                {ticket.resolvedAt ? formatInET(ticket.resolvedAt) : "—"}
              </dd>
              <dt className="text-slate-500">Down duration</dt>
              <dd className="text-slate-900">
                {ticket.downDurationMin !== null ? `${ticket.downDurationMin} min` : "—"}
              </dd>
              <dt className="text-slate-500">Alert</dt>
              <dd className="text-slate-900">{ticket.alertMessage ?? "—"}</dd>
              {ticket.parentTicket && (
                <>
                  <dt className="text-slate-500">Parent ticket</dt>
                  <dd>
                    <Link
                      href={`/network/tickets/${ticket.parentTicket.id}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {ticket.parentTicket.ticketNumber}
                    </Link>
                  </dd>
                </>
              )}
              {ticket.childTickets.length > 0 && (
                <>
                  <dt className="text-slate-500">Child tickets</dt>
                  <dd className="flex flex-col gap-1">
                    {ticket.childTickets.map((c) => (
                      <Link
                        key={c.id}
                        href={`/network/tickets/${c.id}`}
                        className="text-slate-900 hover:underline"
                      >
                        {c.ticketNumber} ({c.status.replace(/_/g, " ")})
                      </Link>
                    ))}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              Teams
            </h2>
            {teamsDeliveries.length === 0 ? (
              <p className="text-sm text-slate-500">
                No Teams post recorded for this ticket.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {teamsDeliveries.map((row) => {
                  const tone = teamsDeliveryTone(row.status);
                  const note = teamsDeliveryNote(row.error);
                  return (
                    <li key={row.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold text-slate-900">
                        {teamsEventLabel(row.event)}
                      </span>
                      <span className="text-slate-500">→ {teamsTargetLabel(row.target)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tone === "sent"
                            ? "bg-emerald-50 text-emerald-700"
                            : tone === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : tone === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.status === "SENT"
                          ? "Posted"
                          : row.status === "PENDING"
                            ? "Queued"
                            : row.status === "FAILED"
                              ? "Failed"
                              : "Not posted"}
                      </span>
                      <span className="text-xs text-slate-500">{formatInET(row.createdAt)}</span>
                      {note && <span className="w-full text-xs text-slate-500">{note}</span>}
                    </li>
                  );
                })}
              </ol>
            )}
            {/* The webhook returns no message id, so there is no deep link to
                offer — saying so beats a "View in Teams" affordance that can
                never appear. Tracked as the open threading question. */}
            <p className="mt-2 text-xs text-slate-400">
              Posts are delivered by webhook, which returns no message link — open the channel in
              Teams to read the thread.
            </p>
          </div>

          {ticket.resolutionNotes && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                Resolution notes
              </h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">
                {ticket.resolutionNotes}
              </p>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Event timeline
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400">No events recorded.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="font-semibold text-slate-900">
                      {e.device.name} — {e.eventType}
                    </p>
                    <p className="text-xs text-slate-500">
                      {e.source} · {formatInET(e.occurredAt)}
                      {e.alertMessage ? ` · ${e.alertMessage}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Notes
            </h2>
            {ticket.notes.length === 0 ? (
              <p className="text-sm text-slate-400">No notes yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {ticket.notes.map((n) => (
                  <li key={n.id} className="border-l-2 border-slate-200 pl-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-900">{n.content}</p>
                    <p className="text-xs text-slate-500">
                      {n.author ?? "Unknown"} ·{" "}
                      {n.source === "TEAMS_REPLY" ? "Teams reply" : "Manual"} ·{" "}
                      {formatInET(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Right rail — edit actions */}
        <aside>
          <TicketActions
            ticketId={ticket.id}
            status={ticket.status}
            assignedTo={ticket.assignedTo}
            resolutionNotes={ticket.resolutionNotes}
          />
        </aside>
      </div>
    </div>
  );
}
