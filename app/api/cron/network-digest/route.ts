import { NextResponse } from "next/server";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { etDayStartUtc, etYYYYMMDD, formatInET } from "@/lib/datetime";
import { loadNetworkOverview } from "@/lib/network/overview.server";
import { buildDailyDigest, buildDailyDigestCard, digestTitle } from "@/lib/network/digest";
import { resolveRange } from "@/lib/network/wifi-range";
import { postTeamsCard } from "@/lib/network/teams-webhook";
import { GENERAL_TARGET, resolveTeamsWebhook } from "@/lib/network/teams-routing";
import { fetchPortfolioSummaries } from "@/lib/network/spotipo.server";
import type { GuestLive } from "@/lib/network/digest";

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
// Idempotency: at most one SUCCESSFUL digest per ET day, enforced by looking for
// a non-FAILED digest NotificationLog row created since the ET day start.
// Without that, a retry, a redeploy mid-hour, or overlapping invocations inside
// the 9 AM hour would each post again. A FAILED row deliberately does NOT count,
// so a transient failure at 9:00 is retried on a later hour rather than skipping
// the day silently.
//
// ⚠ THAT RETRY DID NOT EXIST UNTIL 2026-08-17, though this comment claimed it
// did. The gate was `hourET !== SEND_HOUR_ET`, which returns early at 10:00 —
// so the only attempt was ever 09:00 and a failure there lost the day. It cost a
// real digest: on 2026-08-17 the Neon compute allowance ran out at ~06:58 ET, the
// 13:00 UTC invocation died on its first query, and there was no second attempt.
// The gate is now a WINDOW (SEND_HOUR_ET..LAST_RETRY_HOUR_ET) and the once-a-day
// row is what stops a duplicate, which is the behaviour described above.
//
// The window is capped rather than open-ended because this is a morning
// operations report. A "daily status" arriving at 11 PM is worse than none: it
// reads as current when its own numbers are 14 hours stale.
//
// WHY THIS POSTS DIRECTLY instead of queueing a PENDING row for the 1-minute
// sweep like every other Teams notification: the digest's property table has to
// be a structured Adaptive Card ColumnSet, because a TextBlock collapses the
// space padding a text table depends on (verified live 2026-08-01). Card
// structure can't survive a round trip through NotificationLog, whose body is a
// string. The queue exists to keep HTTP calls out of open transactions — and
// this route has no transaction — so posting inline costs nothing here.
//
// Auth mirrors the other cron routes: fail-closed in production when
// CRON_SECRET is unset, dev-open otherwise.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DIGEST_EVENT = "network_daily_digest";
const SEND_HOUR_ET = 9;
/**
 * Last ET hour that will still attempt the day's digest. 9..12 gives four tries
 * an hour apart, which covers a compute cold-start, a Neon blip, or a Teams
 * outage, while keeping the post recognisably a morning report.
 */
const LAST_RETRY_HOUR_ET = 12;

/** Window the digest's resolved/avg figures cover. */
const DIGEST_RANGE = "30d";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Live guests-online per property (Kyle 2026-08-01, "add realtime values").
 *
 * Returns `undefined` on any failure, which drops the guest column and fact from
 * the digest entirely rather than filling it with zeros. A zero would read as
 * "nobody is on the guest WiFi" — an alarming and wrong claim — where an absent
 * column just means we didn't ask. The daily network status must not depend on a
 * guest-WiFi vendor being up.
 *
 * `fetchPortfolioSummaries` already paces itself (serial, 350 ms apart,
 * single-flighted, 10-minute cache) because parallel calls trip Spotipo's rate
 * limit — see its header comment. Eight sites therefore cost ~3 s here.
 */
async function loadGuestsLive(): Promise<Record<string, GuestLive> | undefined> {
  try {
    const properties = await db.property.findMany({
      where: { active: true },
      select: { id: true, shortCode: true, spotipoSiteId: true, spotipoApiKey: true },
      orderBy: { shortCode: "asc" },
    });
    const summaries = await fetchPortfolioSummaries(properties);
    const out: Record<string, GuestLive> = {};
    for (const s of summaries) {
      out[s.propertyId] = {
        onlineNow: s.onlineNow,
        truncated: s.onlineTruncated,
        configured: s.configured,
      };
    }
    return out;
  } catch (err) {
    console.error("network-digest: guest figures unavailable, omitting them", err);
    return undefined;
  }
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
  // A WINDOW, not a single hour. Equality here meant one attempt per day and no
  // retry — see the header note. Duplicate suppression is the once-a-day
  // NotificationLog row below, not this gate: on a normal day the 09:00 run
  // writes a SENT row and every later hour in the window skips on that.
  if (!dryRun && (hourET < SEND_HOUR_ET || hourET > LAST_RETRY_HOUR_ET)) {
    return NextResponse.json({ ok: true, skipped: "outside_send_window", hourET });
  }

  const dayStart = etDayStartUtc(etYYYYMMDD(now));
  if (!dryRun) {
    const alreadySent = await db.notificationLog.count({
      where: {
        event: DIGEST_EVENT,
        createdAt: { gte: dayStart },
        status: { not: NotificationStatus.FAILED },
      },
    });
    if (alreadySent > 0) {
      return NextResponse.json({ ok: true, skipped: "already_sent_today" });
    }
  }

  const range = resolveRange(DIGEST_RANGE, now);
  const overview = await loadNetworkOverview({ now, rangeFrom: range.from });
  const guests = await loadGuestsLive();

  const title = digestTitle(now);
  const digestParams = {
    overview,
    now,
    rangeLabel: range.label,
    dashboardUrl: appUrl("/network"),
    guests,
  };
  // Text version is what gets stored and what a human reads in the log; the card
  // is what Teams renders. Both come from the same overview and the same cell
  // helpers, so they cannot disagree about a number.
  const body = buildDailyDigest(digestParams);
  const card = buildDailyDigestCard(digestParams);

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, hourET, title, body, card });
  }

  const destination = resolveTeamsWebhook(GENERAL_TARGET);
  const result = destination
    ? await postTeamsCard(destination.url, title, card, body)
    : ({ ok: false, error: "teams_target_not_configured:GENERAL" } as const);

  await db.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      error: result.ok ? null : result.error,
      event: DIGEST_EVENT,
      title,
      body,
      target: GENERAL_TARGET,
      entityType: "network_digest",
      // entityId is deliberately OMITTED. It is a `@db.Uuid` column and this
      // used to pass the ET date (`"20260817"`), which Postgres rejected every
      // single day with P2023 "Error creating UUID, invalid length: expected 32,
      // found 8". Because the Teams post happens ABOVE this write, the digest
      // landed and then the route 500'd — so the day looked fine in Teams while
      // no row was ever recorded, and the once-a-day guard therefore always read
      // zero. Its idempotency has never actually worked; only the single-hour
      // gate was preventing duplicates.
      //
      // Nothing needs the date here: the guard matches on `event` + `createdAt >=
      // ET day start`, and `digestTitle` already carries the date for a human.
      // Do not "restore" this field without a non-UUID column to put it in.
    },
  });

  const outcome = {
    ok: true,
    sent: result.ok,
    error: result.ok ? undefined : result.error,
    hourET,
    target: GENERAL_TARGET,
  };
  console.log("[network-digest]", JSON.stringify(outcome));
  return NextResponse.json(outcome);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
