/**
 * The app's public origin, for links that leave the app.
 *
 * ⚠ Why this exists rather than reading the env var inline: three call sites
 * (Teams ticket posts, escalation posts, the daily digest) each did
 * `process.env.NEXT_PUBLIC_APP_URL ?? ""`, and the var is NOT set in Vercel
 * Production. An empty base turns `${base}/network/tickets/x` into the
 * *relative* path `/network/tickets/x`, and a relative markdown link inside a
 * Teams message resolves against teams.microsoft.com — so every "View ticket"
 * link bounced the reader back into Teams instead of opening the app.
 * Reported by Kyle 2026-08-13, confirmed against the live notification_log.
 *
 * So the fallback here is an absolute origin, not "". A missing env var must
 * degrade to "links to production" — never to "links to wherever the reader
 * happens to be standing".
 *
 * Also normalises what an operator might reasonably type into Vercel:
 *  - a bare host (`ops.rentstayable.com`) gets `https://`, because without a
 *    scheme it is still a relative path and reproduces the original bug;
 *  - a trailing slash is stripped, so callers can always append `/path`.
 */
export const DEFAULT_APP_ORIGIN = "https://ops.rentstayable.com";

export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return DEFAULT_APP_ORIGIN;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

/** Absolute URL for an app path (leading slash optional). */
export function appUrl(path: string): string {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
