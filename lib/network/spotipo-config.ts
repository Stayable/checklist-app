// Where Spotipo credentials come from (2026-07-29).
//
// The Task-9 scaffold read `Property.spotipoSiteId` / `Property.spotipoApiKey`
// straight from the database. That left an API key sitting in a plaintext
// column — recorded as open decision D6 — and gave no way to enter one, since
// /admin/properties is read-only.
//
// Kyle's instruction is to put the credentials in Vercel + .env.local, which is
// the better answer anyway: an env var keeps the secret out of the database and
// out of any query, backup or log that touches the Property row. So resolution
// is now ENV-FIRST, with the DB columns kept as a fallback so nothing that
// already relies on them breaks.
//
// Precedence, most specific first:
//   1. SPOTIPO_API_KEY_<SHORTCODE>   per-site key      e.g. SPOTIPO_API_KEY_KW
//   2. SPOTIPO_API_KEY               one key for the whole account
//   3. Property.spotipoApiKey        legacy DB fallback
//
//   1. SPOTIPO_SITE_ID_<SHORTCODE>   e.g. SPOTIPO_SITE_ID_KW
//   2. Property.spotipoSiteId        legacy DB fallback
//
// Both a site id AND a key are required; one without the other is treated as
// unconfigured rather than half-configured, because a half-configured site
// would otherwise report `configured: true` and then render permanently blank.

export type SpotipoProperty = {
  shortCode: string;
  spotipoSiteId: string | null;
  spotipoApiKey: string | null;
};

export type SpotipoSiteConfig = { siteId: string; apiKey: string };

/** Env var names for one property, exposed so docs and tests can't drift. */
export function spotipoEnvKeys(shortCode: string): { siteId: string; apiKey: string } {
  const code = shortCode.toUpperCase();
  return { siteId: `SPOTIPO_SITE_ID_${code}`, apiKey: `SPOTIPO_API_KEY_${code}` };
}

function clean(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves one property's Spotipo config, or null if it isn't configured.
 *
 * `env` is injectable so this stays a pure function under test — reading
 * process.env directly would make the precedence rules untestable.
 */
export function resolveSpotipoConfig(
  property: SpotipoProperty,
  env: Record<string, string | undefined> = process.env,
): SpotipoSiteConfig | null {
  const keys = spotipoEnvKeys(property.shortCode);

  const siteId = clean(env[keys.siteId]) ?? clean(property.spotipoSiteId);
  const apiKey =
    clean(env[keys.apiKey]) ?? clean(env.SPOTIPO_API_KEY) ?? clean(property.spotipoApiKey);

  if (siteId === null || apiKey === null) return null;
  return { siteId, apiKey };
}

export function isSpotipoConfiguredFor(
  property: SpotipoProperty,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveSpotipoConfig(property, env) !== null;
}

/**
 * Which properties are configured and which aren't — for an admin/debug view,
 * so "why is this site blank?" is answerable without reading env by hand.
 * Never returns key material, only whether one was found and from where.
 */
export function describeSpotipoConfig(
  properties: SpotipoProperty[],
  env: Record<string, string | undefined> = process.env,
): { shortCode: string; configured: boolean; siteIdSource: string; keySource: string }[] {
  return properties.map((p) => {
    const keys = spotipoEnvKeys(p.shortCode);
    const siteIdSource = clean(env[keys.siteId])
      ? keys.siteId
      : clean(p.spotipoSiteId)
        ? "database"
        : "missing";
    const keySource = clean(env[keys.apiKey])
      ? keys.apiKey
      : clean(env.SPOTIPO_API_KEY)
        ? "SPOTIPO_API_KEY"
        : clean(p.spotipoApiKey)
          ? "database"
          : "missing";
    return {
      shortCode: p.shortCode,
      configured: resolveSpotipoConfig(p, env) !== null,
      siteIdSource,
      keySource,
    };
  });
}
