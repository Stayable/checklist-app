import { NextResponse } from "next/server";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { etDayStartUtc, etYYYYMMDD, formatInET } from "@/lib/datetime";
import { loadNetworkOverview } from "@/lib/network/overview.server";
import { buildDailyDigest, digestTitle } from "@/lib/network/digest";
import { resolveRange } from "@/lib/network/wifi-range";
import { GENERAL_TARGET, isAnyTeamsWebhookConfigured } from "@/lib/network/teams-routing";

// 9 AM ET daily network digest → the General Teams channel (Kyle 2026-08-01).
//
// WHY THIS RUNS HOURLY AND GATES ON THE ET HOUR, instead of one daily UTC cron:
// Vercel cron schedules are UTC only, and America/New_York shifts by an hour
// twice a year. `0 13 * * *` is 9 AM in EDT and 8 AM in EST; `0 14 * * *` is the
// reverse. Kyle asked for 9 AM ET, so neither fixed schedule is right for half
// the year. Running every hour and posting only when the ET hour is 9 is exact
// year-round, costs 23 no-op invocations a day, and keeps the "all datetimes are
// ET" discipline of ADR-013 instead of quietly excepting this one job.
//
// Idempotency: at most one digest per ET day, enforced by looking for a digest
// NotificationLog row created since the ET day start. Without that, a retry, a
// redeploy mid-hour, or overlapping invocations inside the 9 AM hour would each
// post again.
//
// Auth mirrors the other cron routes: fail-closed in production when
// CRON_SECRET is unset, dev-open otherwise.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIGEST_EVENT = "network_daily_digest";
const SEND_HOUR_ET = 9;

/** Window the digest's resolved/avg figures cover. */
const DIGEST_RANGE = "30d";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const url = new URL(req.url);
  // Preview the exact text without sending or recording anything. Deliberately
  // the ONLY override offered: a "force send" flag would be a way to duplicate
  // the day's digest, and previewing is what a human actually needs.
  const dryRun = url.searchParams.get("dry") === "1";

  const hourET = Number.parseInt(formatInET(now, "H"), 10);
  if (!dryRun && hourET !== SEND_HOUR_ET) {
    return NextResponse.json({ ok: true, skipped: "not_send_hour", hourET });
  }

  const dayStart = etDayStartUtc(etYYYYMMDD(now));
  if (!dryRun) {
    const alreadySent = await db.notificationLog.count({
      where: { event: DIGEST_EVENT, createdAt: { gte: dayStart } },
    });
    if (alreadySent > 0) {
      return NextResponse.json({ ok: true, skipped: "already_sent_today" });
    }
  }

  const range = resolveRange(DIGEST_RANGE, now);
  const overview = await loadNetworkOverview({ now, rangeFrom: range.from });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const title = digestTitle(now);
  const body = buildDailyDigest({
    overview,
    now,
    rangeLabel: range.label,
    dashboardUrl: `${base}/network`,
  });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, hourET, title, body });
  }

  const queued = isAnyTeamsWebhookConfigured();
  await db.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: queued ? NotificationStatus.PENDING : NotificationStatus.SKIPPED,
      error: queued ? null : "teams_not_configured",
      event: DIGEST_EVENT,
      title,
      body,
      target: GENERAL_TARGET,
      entityType: "network_digest",
      // No single entity — the digest is about the portfolio. The ET date makes
      // the row identifiable and is what the once-a-day guard reads back.
      entityId: etYYYYMMDD(now),
    },
  });

  // Delivered by the 1-minute network-timers sweep, same as every other Teams
  // row — so the digest lands within a minute of 9:00 AM ET. Not posted here:
  // one queue, one retry story, one audit trail.
  const outcome = { ok: true, queued, hourET, target: GENERAL_TARGET };
  console.log("[network-digest]", JSON.stringify(outcome));
  return NextResponse.json(outcome);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
