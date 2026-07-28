import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, time-limited, no-account links to a contractor job (T4).
//
// A contractor never logs in (ADR-025), so the dispatch message carries a link
// that proves by itself which job may be viewed. Stateless HMAC: the token is
// `{jobId}.{expiryEpochSeconds}.{signature}` and needs no database row.
//
// ── Deliberate deviation from the Phase-9 contractor-checklist pattern ──
// Phase 9 specifies signed SINGLE-USE links, because there a contractor SUBMITS
// a checklist and replay would mean a second submission. This link is READ-ONLY
// — it shows the job, the address and the photos — and a contractor re-opening
// it while standing in the room is normal and desirable. Consuming it on first
// view would break the link exactly when it is most needed, and would push us
// into per-view database state for no security gain. When contractor
// checklists arrive and a WRITE path exists, that path gets single-use
// consumption; this one stays idempotent.
//
// ── Key separation ──
// The key is DERIVED from AUTH_SECRET rather than being AUTH_SECRET itself.
// AUTH_SECRET is already triple-purpose (NextAuth secret, OTP pepper,
// trusted-device HMAC) and that is recorded as tech debt; adding a fourth raw
// use would make a future rotation even more entangled. Domain separation means
// a token minted here can never be replayed against the OTP or device paths
// even though they share a root secret.

const KEY_DOMAIN = "contractor-job-link:v1";
/** 72 hours, matching the Phase-9 contractor-link TTL. */
export const JOB_LINK_TTL_SECONDS = 72 * 60 * 60;

function derivedKey(): Buffer | null {
  const root = process.env.AUTH_SECRET;
  // Fail CLOSED on a missing/empty secret rather than signing with a constant.
  // An unsigned "signed" link is worse than no link: it looks trustworthy.
  if (!root) return null;
  return createHmac("sha256", root).update(KEY_DOMAIN).digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Mints a token for a job. Returns null if signing isn't possible. */
export function createJobLinkToken(
  jobId: string,
  now: Date = new Date(),
  ttlSeconds: number = JOB_LINK_TTL_SECONDS,
): string | null {
  const key = derivedKey();
  if (key === null) return null;
  const expiry = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = `${jobId}.${expiry}`;
  return `${payload}.${sign(payload, key)}`;
}

export type JobLinkResult =
  | { ok: true; jobId: string }
  | { ok: false; reason: "malformed" | "expired" | "bad_signature" | "not_configured" };

/**
 * Verifies a token and returns the job id it authorises.
 *
 * Signature is checked BEFORE expiry so a tampered token can never be
 * distinguished from an expired one by response timing or message, and the
 * comparison is constant-time.
 */
export function verifyJobLinkToken(token: string, now: Date = new Date()): JobLinkResult {
  const key = derivedKey();
  if (key === null) return { ok: false, reason: "not_configured" };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [jobId, expiryRaw, provided] = parts as [string, string, string];

  const expiry = Number(expiryRaw);
  if (!Number.isSafeInteger(expiry) || expiry <= 0) return { ok: false, reason: "malformed" };
  if (jobId.length === 0) return { ok: false, reason: "malformed" };

  const expected = sign(`${jobId}.${expiryRaw}`, key);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on unequal lengths.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  if (Math.floor(now.getTime() / 1000) >= expiry) return { ok: false, reason: "expired" };

  return { ok: true, jobId };
}

/** Absolute URL for the message. Null when the app URL or secret is missing. */
export function jobLinkUrl(jobId: string, now: Date = new Date()): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  const token = createJobLinkToken(jobId, now);
  if (token === null) return null;
  return `${base.replace(/\/$/, "")}/j/${token}`;
}
