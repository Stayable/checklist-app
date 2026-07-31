import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { deviceTypeLabel } from "@/lib/network/device-type";

// NETWORK per-property page (spec §6.2): devices, open tickets, 30-day event
// history. Access is guarded once by app/network/layout.tsx. `[id]` is the
// Property primary-key uuid (not the human propertyId).

const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

export default async function NetworkPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const property = await db.property.findUnique({
    where: { id },
    select: { id: true, shortCode: true, name: true },
  });
  if (!property) notFound();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [devices, openTickets, events] = await Promise.all([
    db.device.findMany({
      where: { propertyId: id },
      orderBy: { name: "asc" },
    }),
    db.ticket.findMany({
      where: { propertyId: id, status: { in: OPEN_STATUSES } },
      orderBy: { openedAt: "asc" },
      include: { device: { select: { name: true } } },
    }),
    db.networkEvent.findMany({
      where: { propertyId: id, occurredAt: { gte: thirtyDaysAgo } },
      orderBy: { occurredAt: "desc" },
      take: 200,
      include: { device: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/network" className="text-sm text-slate-500 hover:underline">
          ← Network dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          {property.name} ({property.shortCode})
        </h1>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Devices
        </h2>
        {devices.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No devices registered.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/network/devices/${d.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{deviceTypeLabel(d.type)}</td>
                    <td className="px-4 py-3 text-slate-700">{d.source}</td>
                    <td className="px-4 py-3 text-slate-700">{d.currentStatus}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {d.lastSeenAt ? formatInET(d.lastSeenAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Open tickets
        </h2>
        {openTickets.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No open tickets.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openTickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/network/tickets/${t.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.ticketType}</td>
                    <td className="px-4 py-3 text-slate-700">{t.device?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInET(t.openedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Event history (30 days)
        </h2>
        {events.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No events in the last 30 days.</p>
        ) : (
          <ol className="flex flex-col gap-2 p-4 text-sm">
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
    </div>
  );
}
