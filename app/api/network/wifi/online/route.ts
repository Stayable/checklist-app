import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessNetwork } from "@/lib/rbac";
import { fetchPortfolioSummaries } from "@/lib/network/spotipo.server";

// GET /api/network/wifi/online — "online now" per-site slice (spec §11.7's
// endpoint split). Minimal: same degraded data as /summary today, filtered
// to just the online-now field, kept separate to mirror the spec contract
// for a future poller. See app/api/network/wifi/summary/route.ts for the
// auth-style rationale.

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
  return NextResponse.json({
    sites: sites.map((s) => ({
      propertyId: s.propertyId,
      shortCode: s.shortCode,
      configured: s.configured,
      onlineNow: s.onlineNow,
    })),
  });
}
