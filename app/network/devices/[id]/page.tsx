import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatInET } from "@/lib/datetime";
import { isRecurringDevice } from "@/lib/network/ticket-age";
import { deviceTypeLabel } from "@/lib/network/device-type";
import { consoleLabel } from "@/lib/network/unifi-hosts";

// NETWORK device history (spec §6.4): per-device event log + all tickets +
// "Recurring" badge (>= 3 tickets in the trailing 30 days). Access is
// guarded once by app/network/layout.tsx.

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const device = await db.device.findUnique({
    where: { id },
    include: { property: { select: { id: true, shortCode: true } } },
  });
  if (!device) notFound();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [events, tickets, ticketCountLast30d] = await Promise.all([
    db.networkEvent.findMany({
      where: { deviceId: id },
      orderBy: { occurredAt: "desc" },
      take: 200,
    }),
    db.ticket.findMany({
      where: { deviceId: id },
      orderBy: { openedAt: "desc" },
    }),
    db.ticket.count({
      where: { deviceId: id, openedAt: { gte: thirtyDaysAgo } },
    }),
  ]);

  const recurring = isRecurringDevice(ticketCountLast30d);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link
          href={`/network/properties/${device.property.id}`}
          className="text-sm text-slate-500 hover:underline"
        >
          ← {device.property.shortCode}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
          {device.name}
          {recurring && (
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
              Recurring
            </span>
          )}
        </h1>
        <p className="text-sm text-slate-500">
          {deviceTypeLabel(device.type)} · {device.source} · {device.currentStatus}
          {device.consoleHostId ? ` · on ${consoleLabel(device.consoleHostId)}` : ""}
          {device.lastSeenAt ? ` · last seen ${formatInET(device.lastSeenAt)}` : ""}
        </p>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          Tickets{" "}
          <span className="font-normal text-slate-400">
            ({ticketCountLast30d} in the last 30 days)
          </span>
        </h2>
        {tickets.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No tickets for this device.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket #</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Opened</th>
                  <th className="px-4 py-3">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/network/tickets/${t.id}`}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {t.ticketNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{t.status.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-slate-700">{formatInET(t.openedAt)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {t.resolvedAt ? formatInET(t.resolvedAt) : "—"}
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
          Event log
        </h2>
        {events.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">No events recorded.</p>
        ) : (
          <ol className="flex flex-col gap-2 p-4 text-sm">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                <p className="font-semibold text-slate-900">{e.eventType}</p>
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
