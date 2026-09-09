import { NextResponse } from "next/server";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { isEtHour } from "@/lib/cron-guard";
import { postTeamsCard } from "@/lib/network/teams-webhook";
import { resolveChecklistWebhook } from "@/lib/checklist-teams";
import {
  checklistNotificationsEnabled,
  DISABLED_RESPONSE,
} from "@/lib/checklist-notifications-enabled";
import {
  buildChecklistDigest,
  checklistDigestDays,
  dateOnlyUtc,
  type ChecklistStatusCount,
} from "@/lib/checklist-digest";

// 9:00 AM ET daily CHECKLIST digest → the main checklist Teams chat
// (Kyle 2026-09-09). Wired via the two `/api/cron/checklist-digest` entries
// already in vercel.json.
//
// WHY TWO CRON ENTRIES AND AN HOUR GUARD (ADR-037). Vercel cron schedules are
// fixed UTC and cannot express a timezone, so ONE entry drifts an hour against
// Eastern twice a year: `0 13 * * *` is 9 AM in EDT and 8 AM in EST. Two entries
// an hour apart (13:00 and 14:00 UTC) plus `isEtHour(9)` land exactly one on
// 9 AM ET in either regime; the other is rejected.
//
// ⚠ THE GUARD RUNS BEFORE ANY DATABASE WORK, and that ordering is the point, not
// an accident. Neon bills awake time rather than queries, and this project is
// actively cost-tuning that compute — so the rejected half of the pair must cost
// nothing and must not wake the database. Do not move a query above it, and do
// not "helpfully" load properties first to make the code read better.
//
// Deliberately NO retry window, unlike the network digest. That one retries
// hourly to noon because its numbers are live ("devices up right now"), so a
// late post is still true. This digest grades a CLOSED day and reports today's
// load; if the 9 AM attempt fails, tomorrow's covers the same properties and a
// stale morning report is worse than a missing one. The failure is recorded in
// notification_log either way.
//
// Auth is copied from /api/cron/generate-checklists: Vercel injects
// `Authorization: Bearer ${CRON_SECRET}`; the route is fail-closed in production
// when the secret is unset (no open endpoint on a live site) and dev-open
// otherwise for manual testing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Kyle's spec: 9 AM ET. Checklists are due at 6 PM, so this grades yesterday. */
const DIGEST_ET_HOUR = 9;

const DIGEST_EVENT = "checklist_daily_digest";

/**
 * The digest always goes to the REAL channel. There is no channel parameter and
 * no fallback: `scripts/send-checklist-digest-test.ts` is the only path to the
 * test channel, and a query flag here would be a way to make the production
 * cron post somewhere else.
 */
const DIGEST_CHANNEL = "main" as const;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Per-property, per-status instance counts for one ET calendar day.
 *
 * `scheduledFor` is `@db.Date`, so the filter is an exact UTC-midnight match on
 * the calendar day — not a timestamp range. A `gte/lt` over ET instants would
 * miss every row (see `dateOnlyUtc`).
 *
 * Note there is no `status: { in: [...] }` here on purpose. An allow-list would
 * silently DROP a newly added `InstanceStatus`, and the digest's totals would
 * quietly stop summing to the number of instances. Everything is fetched and
 * `bucketOf` in lib/checklist-digest.ts classifies it under an exhaustive switch,
 * so a new enum member is a compile error rather than a missing number.
 */
async function countsFor(ymd: string): Promise<ChecklistStatusCount[]> {
  const grouped = await db.checklistInstance.groupBy({
    by: ["propertyId", "status"],
    where: { scheduledFor: dateOnlyUtc(ymd) },
    _count: { _all: true },
  });
  return grouped.map((g) => ({
    propertyId: g.propertyId,
    status: g.status,
    count: g._count._all,
  }));
}

// The digest deliberately fetches COUNTS ONLY.
//
// A previous revision also pulled every missed and flagged instance for the day
// (ceiling 2,000 rows, template name + room joined) to name them in per-property
// blocks. Kyle saw that in Teams and asked for the counts table alone, so the
// query went with the listing rather than being left running for a rendering
// nothing does. On a Neon instance being cost-tuned, a ~1,200-row join that
// nothing displays is not free. `git log -p` on lib/checklist-digest.ts has the
// old query if the naming is ever wanted back.

async function handle(req: Request, enforceHour: boolean) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (enforceHour && !isEtHour(DIGEST_ET_HOUR)) {
    // The other half of the UTC pair. Not an error, and not a database hit.
    return NextResponse.json({ ok: true, skipped: "off-hour" });
  }

  const now = new Date();
  const url = new URL(req.url);
  // Preview the exact post without sending or recording anything. The only
  // override offered — a "force send" flag would just be a way to double-post.
  const dryRun = url.searchParams.get("dry") === "1";

  // Built but NOT activated (Kyle, 2026-09-09 — still in the testing phase).
  // The cron entries are also removed from vercel.json; this is the second
  // layer, so a manual trigger or a restored schedule cannot put a card in
  // front of the Property Managers by accident.
  //
  // `?dry=1` is deliberately EXEMPT: it renders and returns without sending or
  // writing anything, and it is how the thing gets exercised while switched
  // off. Gating it too would leave no way to see the output at all.
  if (!dryRun && !checklistNotificationsEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE);
  }


  const { todayYMD, yesterdayYMD } = checklistDigestDays(now);
  const [properties, yesterday, today] = await Promise.all([
    db.property.findMany({
      where: { active: true },
      select: { id: true, shortCode: true },
      orderBy: { shortCode: "asc" },
    }),
    countsFor(yesterdayYMD),
    countsFor(todayYMD),
  ]);

  const { title, text, card } = buildChecklistDigest({
    properties,
    yesterday,
    today,
    now,
    links: {
      // Day-filtered, not property-filtered: `/checklists` scopes to a property
      // through the reader's own header picker and takes no property param, so
      // a `?property=` here would be silently ignored.
      day: appUrl(`/checklists?status=all&from=${yesterdayYMD}&to=${yesterdayYMD}`),
      reviewQueue: appUrl("/review"),
    },
  });

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, todayYMD, yesterdayYMD, title, text, card });
  }

  const destination = resolveChecklistWebhook(DIGEST_CHANNEL);
  const result = destination
    ? await postTeamsCard(destination.url, title, card, text)
    : ({ ok: false, error: "checklist_teams_not_configured:main" } as const);

  // Posted BEFORE this write, deliberately, so a logging failure can never
  // suppress the digest. The row is the record, not the gate — there is no
  // once-a-day guard here because the hour guard already admits exactly one of
  // the two cron entries and nothing retries.
  await db.notificationLog.create({
    data: {
      userId: null,
      channel: NotificationChannel.TEAMS,
      status: result.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      error: result.ok ? null : result.error,
      event: DIGEST_EVENT,
      title,
      body: text,
      target: DIGEST_CHANNEL,
      entityType: "checklist_digest",
      // entityId is OMITTED. It is a `@db.Uuid` column, and the network digest
      // spent months 500-ing every day because it passed an ET date string into
      // it (P2023, "invalid length: expected 32, found 8"). The date is already
      // in `title`; nothing here needs a foreign key.
    },
  });

  const outcome = {
    ok: true,
    sent: result.ok,
    error: result.ok ? undefined : result.error,
    channel: DIGEST_CHANNEL,
    yesterdayYMD,
    todayYMD,
  };
  console.log("[checklist-digest]", JSON.stringify(outcome));
  return NextResponse.json(outcome);
}

export async function GET(req: Request) {
  return handle(req, true);
}

// Manual trigger with the same auth and deliberately WITHOUT the hour guard —
// same shape as the generator's POST. A forced digest is wanted now, not at 9 AM.
export async function POST(req: Request) {
  return handle(req, false);
}
