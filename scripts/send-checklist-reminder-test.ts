/**
 * Post the CURRENT reminder card to the Teams TEST channel (ADR-037).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/send-checklist-reminder-test.ts
 *       ... --dry     print it and send nothing
 *
 * The twin of scripts/send-checklist-digest-test.ts, and it exists for the same
 * reason: the reminder cron posts to the MAIN channel the PMs sit in, and there
 * has to be a way to see the real card without putting a rehearsal in front of
 * them.
 *
 * It drives the cron route's own `?dry=1` path rather than rebuilding the card,
 * so what lands in the test chat is byte-for-byte what the 15-minute job would
 * post. Rebuilding it here would let the two drift, and a rehearsal that does
 * not match the real thing is worse than none.
 *
 * ⚠ Nothing is stamped and no notification_log row is written. `?dry=1` returns
 * before the send-and-stamp block, so running this can never consume a
 * reminder that the real cron then fails to deliver, and can never be mistaken
 * for the real send in the log.
 */
import { GET } from "../app/api/cron/checklist-reminders/route";
import {
  checklistTeamsEnvKey,
  resolveChecklistWebhook,
} from "../lib/checklist-teams";
import { postTeamsCard } from "../lib/network/teams-webhook";
import type { CardElement } from "../lib/network/teams-webhook";

/**
 * Hard-coded, and asserted below. The whole value of this script is that it
 * CANNOT reach the channel the PMs read, so the destination is not a parameter.
 */
const CHANNEL = "test" as const;

type DryPayload = {
  ok: boolean;
  dryRun?: boolean;
  considered: number;
  dueSoon: number;
  dueNow: number;
  title?: string;
  text?: string;
  card?: CardElement[];
};

async function main() {
  const dry = process.argv.includes("--dry");

  // The route is fail-closed in production when CRON_SECRET is set, and this
  // script runs with the production env loaded — so present the same bearer
  // token Vercel Cron would.
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = secret
    ? { authorization: `Bearer ${secret}` }
    : {};

  const res = await GET(
    new Request("https://ops.rentstayable.com/api/cron/checklist-reminders?dry=1", {
      headers,
    }),
  );
  const body = (await res.json()) as DryPayload;

  if (res.status !== 200 || !body.ok) {
    console.error(`route returned ${res.status}:`, JSON.stringify(body));
    process.exit(1);
  }

  console.log(`channel:    ${CHANNEL}`);
  console.log(`considered: ${body.considered} open checklist(s) with a due time`);
  console.log(`due soon:   ${body.dueSoon}`);
  console.log(`overdue:    ${body.dueNow}`);
  console.log("");

  if (!body.card || !body.title || !body.text) {
    // Not a failure. The cron is deliberately silent when nothing is due, and
    // saying so plainly stops a quiet run being read as a broken one.
    console.log("Nothing is due within the next hour and nothing is overdue");
    console.log("inside the 12-hour backlog window, so the cron would post");
    console.log("NOTHING right now. That is correct behaviour, not a failure.");
    console.log("");
    console.log("To see a real card, give an open checklist a due time inside");
    console.log("the next hour and run this again.");
    return;
  }

  console.log(body.title);
  console.log("");
  console.log(body.text);
  console.log("");

  if (dry) {
    console.log("dry run — nothing was sent.");
    return;
  }

  const envKey = checklistTeamsEnvKey(CHANNEL);
  // Belt and braces: prove the constant above still resolves to the test var
  // before anything leaves the process.
  if (envKey !== "CHECKLIST_TEAMS_WEBHOOK_URL_TEST") {
    console.error(`refusing to send: channel "${CHANNEL}" resolved to ${envKey}`);
    process.exit(1);
  }

  const webhook = resolveChecklistWebhook(CHANNEL);
  if (!webhook) {
    console.error(`${envKey} is not set. Refusing to send.`);
    console.error("There is deliberately no fallback to the main channel.");
    process.exit(1);
  }

  const result = await postTeamsCard(webhook.url, body.title, body.card, body.text);
  if (!result.ok) {
    console.error(`send FAILED via ${webhook.envKey}: ${result.error}`);
    process.exit(1);
  }
  console.log(`posted to ${webhook.envKey} (HTTP ${result.status}).`);
  console.log("The endpoint accepted it — confirm it rendered in the test chat.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import("../lib/db");
    await db.$disconnect();
  });
