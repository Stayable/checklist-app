// Teams destinations for CHECKLIST traffic — the daily digest and the due-time
// reminders. Kyle supplied two Power Automate Workflows URLs on 2026-09-09: a
// real channel the PMs sit in, and a test channel.
//
// ⚠ DELIBERATELY NOT `TEAMS_WEBHOOK_URL_*`. That prefix belongs to the NETWORK
// ticket channels and two things there would misfire if checklists borrowed it:
//
//   1. `isAnyTeamsWebhookConfigured()` in lib/network/teams-routing.ts globs
//      every key starting `TEAMS_WEBHOOK_URL`, so adding a checklist channel
//      would make the network side report itself configured when it is not,
//      and queue TEAMS rows that can never be delivered.
//   2. `resolveTeamsWebhook()` falls back to the network GENERAL channel for
//      any target it does not recognise — so a checklist reminder would land
//      in the network tickets channel rather than nowhere, which is worse than
//      an error because it looks like it worked.
//
// The TRANSPORT is shared on purpose (lib/network/teams-webhook.ts): both are
// the same Power Automate Workflows endpoint and the same Adaptive Card shape.
// Only the routing is separate.

/** Where a checklist post is going. */
export type ChecklistTeamsChannel = "main" | "test";

const ENV_KEY: Record<ChecklistTeamsChannel, string> = {
  main: "CHECKLIST_TEAMS_WEBHOOK_URL",
  test: "CHECKLIST_TEAMS_WEBHOOK_URL_TEST",
};

function clean(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ResolvedChecklistWebhook = {
  url: string;
  /** Which env var supplied it. Logged; the URL itself never is — it carries an HMAC. */
  envKey: string;
  channel: ChecklistTeamsChannel;
};

/**
 * Resolve a channel to its webhook.
 *
 * There is NO fallback between the two. A digest meant for the test channel
 * must never reach the real one because the test var is unset — a dry run that
 * silently goes live is the exact failure this indirection exists to prevent.
 */
export function resolveChecklistWebhook(
  channel: ChecklistTeamsChannel,
  env: Record<string, string | undefined> = process.env,
): ResolvedChecklistWebhook | null {
  const envKey = ENV_KEY[channel];
  const url = clean(env[envKey]);
  return url ? { url, envKey, channel } : null;
}

/** True iff the given channel can actually be posted to. */
export function isChecklistTeamsConfigured(
  channel: ChecklistTeamsChannel,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveChecklistWebhook(channel, env) !== null;
}

/** Env var name for a channel — for ops output that must not print the URL. */
export function checklistTeamsEnvKey(channel: ChecklistTeamsChannel): string {
  return ENV_KEY[channel];
}
