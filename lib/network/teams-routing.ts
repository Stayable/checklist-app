// Which Teams channel a network notification goes to (Kyle 2026-08-01).
//
// Until now every ticket event posted to a single TEAMS_WEBHOOK_URL — one
// "Network Tickets (test)" channel for the whole portfolio. Kyle supplied nine
// Power Automate webhooks: one General channel plus one per property, with a
// different job for each:
//
//   General          — the 9 AM ET daily digest, and escalations (realtime)
//   Per property     — ticket created, ticket resolved, mass outage
//
// WHY ENV AND NOT THE DATABASE
// These URLs are credentials, not addresses: the `sig=` query parameter is a
// bearer token, and anyone holding the URL can post into the channel as us.
// That is the same reasoning that moved the Spotipo keys out of
// `Property.spotipoApiKey` into env (see spotipo-config.ts) and closed open
// decision D6 — a secret in a Property column is a secret in every backup,
// query log and admin page that reads the row. So the DB stores only a ROUTING
// KEY ("GENERAL", "KW", …) on the queued NotificationLog row, and the URL is
// resolved from env at delivery time. A queued row is therefore never itself a
// credential, which matters because NotificationLog is kept forever.
//
// Pure — env is injectable so precedence is testable and nothing here does I/O.

/** Routing key for the portfolio-wide channel. */
export const GENERAL_TARGET = "GENERAL";

/**
 * A routing key stored on NotificationLog.target: either GENERAL_TARGET or a
 * property short code (JN/JW/KE/KW/LL/OR/SA/DP).
 */
export type TeamsTarget = string;

/** Legacy single-channel var, kept as the General fallback. See below. */
const LEGACY_KEY = "TEAMS_WEBHOOK_URL";
const GENERAL_KEY = "TEAMS_WEBHOOK_URL_GENERAL";

/** The env var name that holds one target's webhook. */
export function teamsWebhookEnvKey(target: TeamsTarget): string {
  return target === GENERAL_TARGET
    ? GENERAL_KEY
    : `TEAMS_WEBHOOK_URL_${target.toUpperCase()}`;
}

function clean(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ResolvedTeamsWebhook = {
  url: string;
  /** Which env var supplied it — logged, never the URL itself. */
  envKey: string;
  /**
   * True when a property's own channel wasn't configured and this fell back to
   * the General channel.
   *
   * Falling back rather than dropping is deliberate. A silently dropped
   * notification means a property that looks monitored but tells nobody when it
   * breaks — the same class of trap as reporting an unreachable console's
   * devices as "online" (N4), and the reason those became UNKNOWN instead. A
   * message landing in the wrong channel is a visible, fixable annoyance; a
   * message landing nowhere is invisible until an outage goes unanswered. The
   * title always carries the property short code, so a rerouted post still
   * says which property it is about.
   */
  rerouted: boolean;
};

/**
 * Resolves a routing key to a webhook URL.
 *
 * Precedence:
 *   GENERAL    → TEAMS_WEBHOOK_URL_GENERAL, then legacy TEAMS_WEBHOOK_URL
 *   <CODE>     → TEAMS_WEBHOOK_URL_<CODE>, then the General channel (rerouted)
 *
 * The legacy var is honoured for General only. Letting it catch property events
 * too would send eight properties' traffic to the old test channel the moment a
 * per-property var was missing, and read as working.
 */
export function resolveTeamsWebhook(
  target: TeamsTarget,
  env: Record<string, string | undefined> = process.env,
): ResolvedTeamsWebhook | null {
  const general = clean(env[GENERAL_KEY]) ?? clean(env[LEGACY_KEY]);

  if (target === GENERAL_TARGET) {
    if (!general) return null;
    return {
      url: general,
      envKey: clean(env[GENERAL_KEY]) ? GENERAL_KEY : LEGACY_KEY,
      rerouted: false,
    };
  }

  const own = clean(env[teamsWebhookEnvKey(target)]);
  if (own) return { url: own, envKey: teamsWebhookEnvKey(target), rerouted: false };

  if (general) {
    return {
      url: general,
      envKey: clean(env[GENERAL_KEY]) ? GENERAL_KEY : LEGACY_KEY,
      rerouted: true,
    };
  }
  return null;
}

/**
 * True iff at least one channel is configured — i.e. queueing a Teams row has
 * some chance of being delivered.
 *
 * Checks General and the per-property vars by prefix rather than against a
 * hardcoded property list: the property set is data, and a hardcoded list here
 * would silently answer "not configured" for a ninth property.
 */
export function isAnyTeamsWebhookConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Object.entries(env).some(
    ([key, value]) => key.startsWith("TEAMS_WEBHOOK_URL") && clean(value) !== null,
  );
}

/**
 * Which targets are configured and which aren't — for an ops/debug view, so
 * "why is this property's channel quiet?" is answerable without reading env by
 * hand. Never returns URL material, only whether one was found and from where.
 */
export function describeTeamsRouting(
  shortCodes: string[],
  env: Record<string, string | undefined> = process.env,
): { target: string; configured: boolean; source: string; rerouted: boolean }[] {
  return [GENERAL_TARGET, ...shortCodes].map((target) => {
    const resolved = resolveTeamsWebhook(target, env);
    return {
      target,
      configured: resolved !== null,
      source: resolved?.envKey ?? "missing",
      rerouted: resolved?.rerouted ?? false,
    };
  });
}
