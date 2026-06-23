import { NextResponse } from "next/server";
import { generateForDate } from "@/lib/recurrence.server";

// 5:00 AM ET daily checklist generation (ADR-009). Wired via vercel.json cron.
//
// Vercel Cron triggers in UTC and cannot express a timezone, so the schedule
// (0 9 * * *) lands at 5 AM EDT / 4 AM EST. The 1-hour winter shift is
// acceptable — generation runs well before staff start, and generateForDate is
// idempotent (safe to re-run / manually trigger without duplicating).
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

async function run(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await generateForDate();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return run(req);
}

// Allow manual POST trigger (e.g. force-create today) with the same auth.
export async function POST(req: Request) {
  return run(req);
}
