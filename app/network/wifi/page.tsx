import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { WifiStatCard } from "@/components/network/WifiStatCard";
import { aggregateWifiPortfolio } from "@/lib/network/spotipo";
import { fetchPortfolioSummaries } from "@/lib/network/spotipo.server";

// Guest WiFi (Spotipo) portfolio view (spec §11.5). SCAFFOLD + DEGRADE (Task
// 9, Kyle 2026-07-25) — no Spotipo siteids/API keys exist yet, so every
// property renders "not configured" until Property.spotipoSiteId/
// spotipoApiKey are populated (see lib/network/spotipo.server.ts's fetch
// seam). Read-only — no ticketing/alerting here (§11). Access is guarded
// once by app/network/layout.tsx.

export default async function WifiPortfolioPage() {
  const properties = await db.property.findMany({
    where: { active: true },
    select: { id: true, shortCode: true, spotipoSiteId: true, spotipoApiKey: true },
    orderBy: { shortCode: "asc" },
  });

  const sites = await fetchPortfolioSummaries(properties);
  const portfolio = aggregateWifiPortfolio(sites);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Guest WiFi"
        subtitle="Portfolio-wide Spotipo guest network summary (read-only)"
      />

      {portfolio.configuredCount === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">Guest WiFi (Spotipo) not configured</p>
          <p className="mx-auto mt-1 max-w-md">
            No property has a Spotipo site ID + API key set yet. Once siteids and keys are
            supplied, set them on each property to enable guest WiFi metrics here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <WifiStatCard label="Total guests" value={String(portfolio.totalGuests)} />
        <WifiStatCard label="Online now" value={String(portfolio.onlineNow)} />
        <WifiStatCard
          label="Avg dwell"
          value={portfolio.avgDwellMin === null ? "—" : `${Math.round(portfolio.avgDwellMin)} min`}
        />
        <WifiStatCard label="Revenue" value="Unconfirmed" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-bold text-slate-900">
          By property
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Property</th>
                <th className="px-4 py-3">Configured</th>
                <th className="px-4 py-3">Guests</th>
                <th className="px-4 py-3">Online</th>
                <th className="px-4 py-3">Avg dwell</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sites.map((s) => (
                <tr key={s.propertyId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/network/wifi/${s.propertyId}`}
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {s.shortCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.configured ? "Yes" : "Not configured"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{s.totalGuests ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">{s.onlineNow ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {s.avgDwellMin === null ? "—" : `${Math.round(s.avgDwellMin)} min`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
