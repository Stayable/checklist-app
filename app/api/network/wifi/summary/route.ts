import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessNetwork } from "@/lib/rbac";
import { aggregateWifiPortfolio } from "@/lib/network/spotipo";
import { fetchPortfolioSummaries } from "@/lib/network/spotipo.server";

// GET /api/network/wifi/summary — portfolio-wide Guest WiFi (Spotipo)
// aggregate + per-site breakdown (spec §11.5/§11.7). SCAFFOLD + DEGRADE
// (Task 9): the pages call the server functions directly (they're server
// components), so this route exists for the §11 contract + any future
// client-side polling. Keys never leave the server — this route returns
// aggregated numbers only, never Property.spotipoApiKey.
//
// Auth mirrors app/api/photos/presign/route.ts's explicit status-code style
// rather than lib/rbac.ts requireNetworkAccess() (which redirects — fine for
// a page/layout, wrong for a JSON API that needs a real 401/403).

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessNetwork(session.user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const properties = await db.property.findMany({
    where: { active: true },
    select: { id: true, shortCode: true, spotipoSiteId: true, spotipoApiKey: true },
    orderBy: { shortCode: "asc" },
  });

  const sites = await fetchPortfolioSummaries(properties);
  return NextResponse.json({ portfolio: aggregateWifiPortfolio(sites), sites });
}
