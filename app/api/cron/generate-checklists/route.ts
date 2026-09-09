import { NextResponse } from "next/server";
import { generateForDate } from "@/lib/recurrence.server";
import { isEtHour } from "@/lib/cron-guard";

// 5:00 AM ET daily checklist generation (ADR-009). Wired via vercel.json cron.
//
// Vercel Cron triggers in UTC and cannot express a timezone, so ONE entry
// drifts an hour twice a year. As of ADR-037 there are TWO entries an hour
// apart (0 9 and 0 10 UTC) and `isEtHour(5)` admits exactly one, so generation
// lands at 5 AM ET year-round instead of slipping to 4 AM every winter.
//
// The guard runs BEFORE any database work, so the rejected half of the pair
// costs nothing and does not wake Neon. A manual POST bypasses it on purpose —
// "force-create today" must work at any hour. generateForDate is idempotent
// either way.
//
// Auth: Vercel injects `Authorization: Bearer ${CRON_SECRET}` when the
// CRON_SECRET env is set. The route is fail-closed in production: if the secret
// is unset there, every request is rejected (no open endpoint on a live site).
// When unset outside production (local dev) the route stays open for manual
// testing. The cron simply won't run on prod until CRON_SECRET is configured.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(req: Request, enforceHour: boolean) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (enforceHour && !isEtHour(GENERATION_ET_HOUR)) {
    // The other half of the UTC pair. Not an error.
    return NextResponse.json({ ok: true, skipped: "off-hour" });
  }
  const result = await generateForDate();
  return NextResponse.json({ ok: true, ...result });
}

/** ADR-009: generation runs at 5 AM ET, before any staff start. */
const GENERATION_ET_HOUR = 5;

export async function GET(req: Request) {
  return run(req, true);
}

// Allow manual POST trigger (e.g. force-create today) with the same auth, and
// deliberately WITHOUT the hour guard — a forced run is wanted now, not at 5 AM.
export async function POST(req: Request) {
  return run(req, false);
}
