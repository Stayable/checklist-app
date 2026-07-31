import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { WifiStatCard } from "@/components/network/WifiStatCard";
import { formatInET } from "@/lib/datetime";
import { fetchPortfolioSummaries } from "@/lib/network/spotipo.server";
import { fetchLiveClientsByProperty } from "@/lib/network/wifi-live.server";
import { fetchPropertyRevenue, type PropertyRevenue } from "@/lib/network/wifi-revenue.server";
import { WifiRangeFilter } from "./WifiRangeFilter";
import { resolveRange } from "@/lib/network/wifi-range";

// Guest WiFi portfolio view (spec §11.5). Read-only — no ticketing here.
// Access is guarded once by app/network/layout.tsx.
//
// THREE SOURCES, because no single vendor has all of it (each established by
// probing the live APIs on 2026-07-29, not by reading docs):
//   · registered guests → Spotipo  — metadata.total_count, the ONLY thing its
//                                    API exposes; every other path 404s
//   · online right now  → UniFi    — site statistics (wifiClient + guestClient).
//                                    Spotipo has no online field at all, which is
//                                    why this used to render blank
//   · revenue           → Stripe   — one account per property, so the key IS the
//                                    attribution, and it is genuinely date-filterable
//
// The date range applies to REVENUE ONLY. Spotipo ignores date params (verified:
// identical total_count for any range), so guest figures are lifetime counts and
// the page says so rather than implying a filter that does not exist.

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ range?: string }>;

function money(r: PropertyRevenue | null): string {
  return r === null ? "—" : `$${r.net.toFixed(2)}`;
}

export default async function WifiPortfolioPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const range = resolveRange(params.range);

  const properties = await db.property.findMany({
    where: { active: true },
    select: { id: true, propertyId: true, shortCode: true, spotipoSiteId: true, spotipoApiKey: true },
    orderBy: { shortCode: "asc" },
  });

  const [sites, liveClients, revenueEntries] = await Promise.all([
    fetchPortfolioSummaries(properties),
    fetchLiveClientsByProperty(),
    Promise.all(
      properties.map(async (p) => [p.shortCode, await fetchPropertyRevenue(p.shortCode, range.from)] as const),
    ),
  ]);

  const revenueByCode = new Map(revenueEntries);
  const refById = new Map(properties.map((p) => [p.id, p.propertyId]));

  const rows = sites.map((s) => {
    const ref = refById.get(s.propertyId);
    const live = ref ? liveClients.get(ref) : undefined;
    const rev = revenueByCode.get(s.shortCode);
    return {
      ...s,
      // "Online" = portal guests + WiFi clients the console reports right now.
      onlineNow: live ? live.guestClients + live.wifiClients : null,
      wiredClients: live?.wiredClients ?? null,
      revenue: rev?.ok ? rev.revenue : null,
      revenueReason: rev?.ok ? null : (rev?.reason ?? "not_configured"),
    };
  });

  const totals = rows.reduce(
    (a, r) => ({
      guests: a.guests + (r.totalGuests ?? 0),
      online: a.online + (r.onlineNow ?? 0),
      net: a.net + (r.revenue?.net ?? 0),
      gross: a.gross + (r.revenue?.gross ?? 0),
      revenueSites: a.revenueSites + (r.revenue ? 1 : 0),
    }),
    { guests: 0, online: 0, net: 0, gross: 0, revenueSites: 0 },
  );

  const failed = rows.filter((r) => r.error !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Guest WiFi"
        subtitle="Registered guests (Spotipo) · live clients (UniFi) · revenue (Stripe)"
      />

      <WifiRangeFilter />

      {failed.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <span className="font-semibold">
            {failed.length} propert{failed.length === 1 ? "y" : "ies"} could not be refreshed:
          </span>{" "}
          {failed
            .map(
              (f) =>
                `${f.shortCode} (${f.error === "rate_limited" ? "rate-limited" : f.error}${
                  f.staleSince ? `, showing figures from ${formatInET(f.staleSince)}` : ""
                })`,
            )
            .join(", ")}
          .{" "}
          {failed.every((f) => f.staleSince)
            ? "Those rows show the last good reading, not live numbers."
            : "Rows showing “—” failed outright — that is not a zero."}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <WifiStatCard label="Registered guests (all time)" value={String(totals.guests)} />
        <WifiStatCard label="Online now" value={String(totals.online)} />
        <WifiStatCard
          label={`Net revenue · ${range.label}`}
          value={totals.revenueSites === 0 ? "—" : `$${totals.net.toFixed(2)}`}
        />
        <WifiStatCard
          label={`Gross revenue · ${range.label}`}
          value={totals.revenueSites === 0 ? "—" : `$${totals.gross.toFixed(2)}`}
        />
      </div>

      {totals.revenueSites < rows.length && (
        <p className="text-xs text-slate-500">
          Revenue covers {totals.revenueSites} of {rows.length} properties — each needs its own{" "}
          <code className="rounded bg-slate-100 px-1">STRIPE_SECRET_KEY_&lt;CODE&gt;</code>. The
          totals above sum only the configured properties; they are not a portfolio estimate.
        </p>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          By property
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Guests (all time)</th>
                <th className="px-4 py-3">Online now</th>
                <th className="px-4 py-3">Wired</th>
                <th className="px-4 py-3">Net · {range.label}</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Txns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.propertyId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/network/wifi/${s.propertyId}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {s.shortCode}
                    </Link>
                    {s.error !== null && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                        {s.error}
                      </span>
                    )}
                    {!s.configured && (
                      <span className="ml-2 text-xs text-slate-400">not configured</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.totalGuests ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{s.onlineNow ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{s.wiredClients ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{money(s.revenue)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.revenue === null ? "—" : `$${s.revenue.gross.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.revenue === null ? (
                      <span className="text-xs text-slate-400">
                        {s.revenueReason === "not_configured" ? "no Stripe key" : s.revenueReason}
                      </span>
                    ) : (
                      s.revenue.transactions
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Guest totals are lifetime counts — Spotipo&apos;s API ignores date filters, so the period
        above applies to revenue only. “Online now” is what the UniFi consoles report this minute
        (portal guests + WiFi clients), cached for up to a minute so a page refresh does not
        re-poll every site. Revenue window: {formatInET(range.from, "MMM d, yyyy")} → now ET.
      </p>
    </div>
  );
}
