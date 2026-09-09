/**
 * Post the daily checklist digest to the TEST Teams channel.
 *
 * Live data (production numbers, test channel):
 *   pnpm dotenv -e .env.production.local -- tsx scripts/send-checklist-digest-test.ts
 *
 * Fabricated all-eight-properties preview:
 *   pnpm dotenv -e .env.production.local -- tsx scripts/send-checklist-digest-test.ts --sample
 *   …--sample --seed 7        reproducible variation
 *   …--sample --dry           print it, send nothing, touch no database
 *
 * `--dry` works in either mode.
 *
 * This is Kyle's "send a sample to the test" (2026-09-09). In live mode it
 * builds the digest through exactly the same code path the 9 AM cron uses, so
 * what lands in the test channel is what the real one will look like — not a
 * mock-up that can drift away from the thing it is previewing.
 *
 * ⚠ IT CANNOT POST TO THE MAIN CHANNEL. The channel is a hard-coded constant, it
 * is asserted below against `checklistTeamsEnvKey`, and `resolveChecklistWebhook`
 * has no fallback between the two channels by design — so an unset
 * CHECKLIST_TEAMS_WEBHOOK_URL_TEST makes this script refuse, never silently go
 * live. A dry run that posts to the real chat is the exact failure this
 * arrangement exists to prevent.
 *
 * It also writes NOTHING: no notification_log row, no reminder stamps. The log
 * is the record of what the real digest did, and a rehearsal in it would make
 * "did the 9 AM digest go out?" unanswerable.
 */
import { InstanceStatus } from "@prisma/client";
import { db } from "../lib/db";
import { appUrl } from "../lib/app-url";
import {
  buildChecklistDigest,
  checklistDigestDays,
  dateOnlyUtc,
  type ChecklistDigestInput,
  type ChecklistStatusCount,
  type DigestProperty,
} from "../lib/checklist-digest";
import {
  checklistTeamsEnvKey,
  resolveChecklistWebhook,
  type ChecklistTeamsChannel,
} from "../lib/checklist-teams";
import { postTeamsCard } from "../lib/network/teams-webhook";

/** The only destination this script may ever use. */
const CHANNEL: ChecklistTeamsChannel = "test";

/**
 * The disclaimer for `--sample`.
 *
 * Repeated in THREE places — the card title, the first line of the body, and the
 * terminal — because a Teams post full of invented numbers that looks real is a
 * genuine hazard: somebody screenshots it into a thread, or acts on a miss that
 * never happened. A footnote at the bottom of a card nobody scrolls does not
 * count as a warning.
 */
const SAMPLE_MARK = "[SAMPLE — NOT REAL DATA]";
const SAMPLE_BANNER =
  "⚠️ SAMPLE — NOT REAL DATA. Every number below is randomly generated to preview " +
  "the layout across all eight properties. It describes nothing that happened. " +
  "Do not act on it, and do not forward it as a report.";

// ── Live data ───────────────────────────────────────────────────────────────

/**
 * Per-property, per-status counts for one ET calendar day. Mirrors the cron
 * route exactly, including the absence of a `status: { in: [...] }` filter: an
 * allow-list would silently DROP a newly added `InstanceStatus` and the totals
 * would stop summing to the number of instances. The digest's exhaustive
 * `bucketOf` switch classifies everything instead.
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

// ── Sample data ─────────────────────────────────────────────────────────────

/**
 * mulberry32 — a tiny seeded PRNG.
 *
 * Seeded rather than `Math.random()` so a sample can be reproduced: "the one I
 * sent you with seed 7" is a thing two people can look at together, and it is
 * what makes the sample testable at all.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The eight properties with their real room counts (Cloudbeds export,
 * 2026-08-12). Real inventory sizes make the fabricated load plausible — a
 * sample where a 127-room property shows 400 checklists would teach the reader
 * to distrust the layout rather than read it.
 */
const SAMPLE_PROPERTIES: Array<DigestProperty & { rooms: number }> = [
  { id: "s-jn", shortCode: "JN", rooms: 127 },
  { id: "s-jw", shortCode: "JW", rooms: 133 },
  { id: "s-ke", shortCode: "KE", rooms: 167 },
  { id: "s-kw", shortCode: "KW", rooms: 160 },
  { id: "s-ll", shortCode: "LL", rooms: 157 },
  { id: "s-or", shortCode: "OR", rooms: 135 },
  { id: "s-sa", shortCode: "SA", rooms: 140 },
  { id: "s-dp", shortCode: "DP", rooms: 153 },
];

/**
 * What each property is meant to DEMONSTRATE.
 *
 * Assigned, not randomised, because the point of the sample is to show how the
 * whole board reads — including the ugly rows. Eight tidy green rows would prove
 * nothing about the layout. The magnitudes inside each archetype are random, so
 * a rerun looks different without losing the coverage.
 */
type Archetype =
  | "heavy-miss" // 🔴 a property that largely did not run
  | "some-miss" // 🔴 a normal bad day
  | "flagged" // 🟡 everything in, some rejected
  | "clean" // 🟢 measured and passed
  | "clean-reviewed" // 🟢 and the manager has already worked the queue
  | "nothing-measured" // ⚫ nothing due yesterday, work on today
  | "invalidated" // stayovers — proves the dashes row is explained
  | "silent"; // nothing either day — proves the "Nothing scheduled" line

const SAMPLE_PLAN: Array<[string, Archetype]> = [
  ["KE", "heavy-miss"],
  ["OR", "some-miss"],
  ["LL", "flagged"],
  ["JW", "clean"],
  ["KW", "clean-reviewed"],
  ["SA", "nothing-measured"],
  ["DP", "invalidated"],
  ["JN", "silent"],
];

type SampleCounts = { yesterday: ChecklistStatusCount[]; today: ChecklistStatusCount[] };

function buildSampleCounts(seed: number): SampleCounts {
  const rand = rng(seed);
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

  const yesterday: ChecklistStatusCount[] = [];
  const today: ChecklistStatusCount[] = [];
  const push = (
    into: ChecklistStatusCount[],
    propertyId: string,
    status: InstanceStatus,
    count: number,
  ) => {
    if (count > 0) into.push({ propertyId, status, count });
  };

  for (const [shortCode, archetype] of SAMPLE_PLAN) {
    const p = SAMPLE_PROPERTIES.find((x) => x.shortCode === shortCode)!;
    // A day's load is a fraction of the inventory — arrivals and due-outs, not
    // every room every day.
    const load = Math.max(6, Math.round(p.rooms * (0.06 + rand() * 0.06)));

    switch (archetype) {
      case "heavy-miss": {
        const done = between(1, 3);
        push(yesterday, p.id, InstanceStatus.SUBMITTED, done);
        push(yesterday, p.id, InstanceStatus.EXPIRED, load - done - 2);
        push(yesterday, p.id, InstanceStatus.SCHEDULED, 2);
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "some-miss": {
        const missed = between(2, 5);
        push(yesterday, p.id, InstanceStatus.SUBMITTED, load - missed - 1);
        push(yesterday, p.id, InstanceStatus.REVIEWED, 1);
        push(yesterday, p.id, InstanceStatus.IN_PROGRESS, missed);
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "flagged": {
        const flags = between(1, 3);
        push(yesterday, p.id, InstanceStatus.SUBMITTED, load - flags - 2);
        push(yesterday, p.id, InstanceStatus.REVIEWED, 2);
        push(yesterday, p.id, InstanceStatus.FLAGGED, flags);
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "clean": {
        push(yesterday, p.id, InstanceStatus.SUBMITTED, load);
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "clean-reviewed": {
        // Reviewed is a SUBSET of done — this row is the one that proves the
        // legend, so it deliberately shows Rev'd close to but under Done.
        const reviewed = Math.max(1, load - between(1, 3));
        push(yesterday, p.id, InstanceStatus.REVIEWED, reviewed);
        push(yesterday, p.id, InstanceStatus.SUBMITTED, load - reviewed);
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "nothing-measured": {
        // Nothing due yesterday (a weekly template's off day), work on today.
        push(today, p.id, InstanceStatus.SCHEDULED, load);
        break;
      }
      case "invalidated": {
        push(yesterday, p.id, InstanceStatus.INVALIDATED, between(3, 8));
        push(yesterday, p.id, InstanceStatus.SUBMITTED, between(1, 3));
        break;
      }
      case "silent":
        break;
      default: {
        const unhandled: never = archetype;
        throw new Error(`unhandled sample archetype: ${String(unhandled)}`);
      }
    }
  }

  return { yesterday, today };
}

// ── Main ────────────────────────────────────────────────────────────────────

function numericArg(flag: string, fallback: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const sample = process.argv.includes("--sample");
  const seed = numericArg("--seed", 1);

  // Belt and braces on top of the constant: if anyone ever edits CHANNEL to
  // "main" this stops the run before a single query, rather than at the point
  // where the message has already landed in the PMs' chat.
  const envKey = checklistTeamsEnvKey(CHANNEL);
  if (CHANNEL !== "test" || envKey !== "CHECKLIST_TEAMS_WEBHOOK_URL_TEST") {
    console.error(
      `REFUSING: this script may only post to the test channel, got "${CHANNEL}" (${envKey}).`,
    );
    process.exitCode = 1;
    return;
  }

  // The URL itself is NEVER printed — a Power Automate Workflows URL carries an
  // HMAC signature in its query string, so it is a credential. The env var name
  // is what an operator actually needs to know.
  const destination = dry ? null : resolveChecklistWebhook(CHANNEL);
  if (!dry && !destination) {
    console.error(`REFUSING: ${envKey} is not set, so there is no test channel to post to.`);
    console.error(
      "There is deliberately no fallback to the main channel — set the var, or run with --dry.",
    );
    process.exitCode = 1;
    return;
  }

  const now = new Date();
  const { todayYMD, yesterdayYMD } = checklistDigestDays(now);
  const links = {
    day: appUrl(`/checklists?status=all&from=${yesterdayYMD}&to=${yesterdayYMD}`),
    reviewQueue: appUrl("/review"),
  };

  let params: ChecklistDigestInput;
  if (sample) {
    // No database call at all in sample mode — not even the property list. A
    // preview of invented numbers has no business opening a connection to
    // production, and not opening one is what makes that impossible rather than
    // merely unlikely.
    const counts = buildSampleCounts(seed);
    params = {
      properties: SAMPLE_PROPERTIES.map(({ id, shortCode }) => ({ id, shortCode })),
      yesterday: counts.yesterday,
      today: counts.today,
      now,
      links,
      banner: SAMPLE_BANNER,
    };
  } else {
    const [properties, yesterday, today] = await Promise.all([
      db.property.findMany({
        where: { active: true },
        select: { id: true, shortCode: true },
        orderBy: { shortCode: "asc" },
      }),
      countsFor(yesterdayYMD),
      countsFor(todayYMD),
    ]);
    params = { properties, yesterday, today, now, links };
  }

  const built = buildChecklistDigest(params);
  // The mark goes in the TITLE too, because a Teams notification preview and the
  // channel list both show the title before anyone opens the card.
  const title = sample ? `${SAMPLE_MARK} ${built.title}` : built.title;
  const { text, card, model } = built;

  console.log(sample ? `MODE:       SAMPLE — FABRICATED DATA (seed ${seed})` : "MODE:       live data");
  console.log(`channel:    ${CHANNEL}`);
  console.log(`env var:    ${envKey}${dry ? " (not read — dry run)" : " (resolved)"}`);
  console.log(`properties: ${params.properties.length}${sample ? " (invented)" : " active"}`);
  console.log(`yesterday:  ${yesterdayYMD}   today: ${todayYMD}`);
  console.log("");
  console.log(title);
  console.log(text);
  console.log("");

  if (sample) {
    console.log(
      "NOTE: every number above is fabricated. Nothing was read from the database.",
    );
    console.log("");
  } else if (model.portfolioEmpty) {
    // Worth saying out loud in the terminal, because the digest itself is
    // designed to look sparse in this state and a reader could mistake a working
    // send for a broken one. As of 2026-09-07 there are 0 recurring rules, so
    // this is the EXPECTED result of a live test send today.
    console.log("NOTE: zero instances on both days — the digest is reporting an empty portfolio.");
    console.log("");
  }

  if (dry) {
    console.log("dry run — nothing was sent and nothing was written.");
    await db.$disconnect();
    return;
  }

  const result = await postTeamsCard(destination!.url, title, card, text);
  console.log(
    result.ok
      ? `posted to ${envKey} (HTTP ${result.status}).`
      : `FAILED to post to ${envKey}: ${result.error}`,
  );
  // "Accepted" is the strongest honest claim: the Workflows endpoint returns 202
  // for anything it takes, whether or not the flow then posts. Check the channel.
  if (result.ok) console.log("The endpoint accepted it — confirm it rendered in the test chat.");
  if (!result.ok) process.exitCode = 1;

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
