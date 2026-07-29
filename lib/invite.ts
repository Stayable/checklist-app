import { createHash, randomBytes, timingSafeEqual } from "crypto";

// Invite tokens for account activation and consent capture. Mirrors lib/otp.ts's
// hash-at-rest shape, but with NO pepper: the token is 256 bits of entropy, so a
// plain SHA-256 is sufficient. That deliberately avoids a fourth use of
// AUTH_SECRET (already NextAuth secret + OTP pepper + trusted-device HMAC).

/** 7 days, matching the original Phase-2 activation-email spec. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time compare. Never throws on a malformed stored hash. */
export function inviteTokenMatches(token: string, hash: string): boolean {
  const a = Buffer.from(hashInviteToken(token), "hex");
  let b: Buffer;
  try {
    b = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export type InviteRow = {
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
};

export type InviteState = "valid" | "expired" | "consumed" | "revoked";

/**
 * Precedence is revoked → consumed → expired, so an admin's explicit revocation
 * is always the reported reason. Callers must NOT surface this to the invitee —
 * the page shows one generic message for every non-valid state (Spec §10).
 */
export function inviteState(row: InviteRow, now: Date): InviteState {
  if (row.revokedAt !== null) return "revoked";
  if (row.consumedAt !== null) return "consumed";
  if (now.getTime() >= row.expiresAt.getTime()) return "expired";
  return "valid";
}

/** Absolute invite URL. Falls back to the production origin when the env is unset. */
export function buildInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://ops.rentstayable.com";
  return `${base.replace(/\/+$/, "")}/invite/${token}`;
}
