/**
 * Master OFF switch for checklist notifications that reach real people.
 *
 * Kyle, 2026-09-09: "disable the 9AM Digest. and also the reminder -> I just
 * need you to build it but not activate. Still on testing phase."
 *
 * Removing the entries from `vercel.json` already stops them firing on a
 * schedule, and that is the primary control. This is the second layer, because
 * a schedule is not the only way these routes run: a manual POST, a re-added
 * cron entry, a copy-paste of the curl command from a runbook, or a future
 * deploy that restores vercel.json from an older branch would all reach the
 * PM channel with no further thought.
 *
 * The failure this guards against is specific and expensive: a card landing in
 * front of every Property Manager during a testing phase, which costs trust in
 * the digest before it has earned any.
 *
 * DEFAULT IS OFF. Unset, empty, or anything other than the exact string "true"
 * means disabled — an env var typo must fail safe, not silently arm the thing.
 *
 * TO ACTIVATE, when testing is done:
 *   1. `vercel env add CHECKLIST_NOTIFICATIONS_ENABLED production` -> `true`
 *   2. restore the cron entries in `vercel.json` (see git history for this
 *      commit; the digest needs BOTH UTC entries, 13:00 and 14:00, so the
 *      isEtHour(9) guard can admit exactly one across the DST boundary)
 *   3. redeploy
 *
 * NOT gated by this: the `--dry` paths and the two test-channel scripts
 * (`scripts/send-checklist-digest-test.ts`,
 * `scripts/send-checklist-reminder-test.ts`). Those are hard-locked to the
 * test channel and exist precisely so the thing can be exercised while it is
 * switched off here.
 */
export function checklistNotificationsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.CHECKLIST_NOTIFICATIONS_ENABLED === "true";
}

/** Shape a disabled route returns, so a caller can tell "off" from "nothing to do". */
export const DISABLED_RESPONSE = {
  ok: true as const,
  skipped: "notifications_disabled" as const,
  hint: "Set CHECKLIST_NOTIFICATIONS_ENABLED=true to activate. See lib/checklist-notifications-enabled.ts",
};
