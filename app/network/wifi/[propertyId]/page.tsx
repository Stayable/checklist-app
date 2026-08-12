import { ACTIVE_WINDOW_MIN } from "@/lib/network/spotipo-active";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireNetworkAccess } from "@/lib/rbac";
import { networkScopeFor } from "@/lib/network/scope.server";
import { isInScope } from "@/lib/network/scope";
import { WifiStatCard } from "@/components/network/WifiStatCard";
import { fetchSiteSummary, isSpotipoConfigured } from "@/lib/network/spotipo.server";

// Guest WiFi (Spotipo) per-property view (spec §11.5). `[propertyId]` is
// Property.id (UUID), matching the rest of the /network section's URL style
// (e.g. app/network/tickets/[id]). Same SCAFFOLD + DEGRADE story as the
// portfolio page — see app/network/wifi/page.tsx and
// lib/network/spotipo.server.ts. Read-only. Access is guarded once by
// app/network/layout.tsx.

export default async function WifiPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const scope = await networkScopeFor(await requireNetworkAccess());
  const { propertyId } = await params;

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { id: true, shortCode: true, name: true, spotipoSiteId: true, spotipoApiKey: true },
  });
  if (!property || !isInScope(scope, property.id)) notFound();

  const summary = await fetchSiteSummary(property);
  const configured = isSpotipoConfigured(property);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/network/wifi" className="text-sm text-slate-500 hover:underline">
          ← Guest WiFi
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          {property.name} ({property.shortCode})
        </h1>
      </header>

      {!configured ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          <p className="font-semibold text-slate-700">Guest WiFi (Spotipo) not configured</p>
          <p className="mx-auto mt-1 max-w-md">
            This property has no Spotipo site ID / API key set yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <WifiStatCard
            label="Total guests"
            value={summary.totalGuests === null ? "—" : String(summary.totalGuests)}
          />
          <WifiStatCard
            label={`Active now (${ACTIVE_WINDOW_MIN} min)`}
            value={
              summary.onlineNow === null
                ? "—"
                : `${summary.onlineNow}${summary.onlineTruncated ? "+" : ""}`
            }
          />
          <WifiStatCard
            label="Avg dwell"
            value={summary.avgDwellMin === null ? "—" : `${Math.round(summary.avgDwellMin)} min`}
          />
          <WifiStatCard label="Revenue" value="Unconfirmed" />
        </div>
      )}
    </div>
  );
}
