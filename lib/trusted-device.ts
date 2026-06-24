import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const TRUSTED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function newDeviceId(): string {
  return randomBytes(16).toString("hex");
}

function sig(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Token = base64url(`${userId}.${deviceId}.${issuedAtMs}`).`${hmac}`
export function signTrustedToken(userId: string, deviceId: string, issuedAtMs: number, secret: string): string {
  const payload = `${userId}.${deviceId}.${issuedAtMs}`;
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sig(body, secret)}`;
}

export function parseTrustedToken(
  token: string,
  secret: string,
  now: Date,
  maxAgeMs: number,
): { userId: string; deviceId: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = token.slice(dot + 1);
  const expected = sig(body, secret);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString();
  } catch {
    return null;
  }
  const parts = payload.split(".");
  if (parts.length !== 3) return null;
  const [userId, deviceId, issuedStr] = parts;
  const issuedAt = Number(issuedStr);
  if (!userId || !deviceId || !Number.isFinite(issuedAt)) return null;
  if (now.getTime() - issuedAt > maxAgeMs) return null;
  if (issuedAt > now.getTime() + 60_000) return null; // future-dated guard
  return { userId, deviceId };
}
