"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendOtpEmail } from "@/lib/email";
import { generateOtpCode, hashOtp, OTP_TTL_MS } from "@/lib/otp";
import {
  signTrustedToken,
  newDeviceId,
  parseTrustedToken,
  TRUSTED_MAX_AGE_MS,
} from "@/lib/trusted-device";
import { isLocked, registerFailure } from "@/lib/auth-throttle";
import { TRUSTED_DEVICE_COOKIE } from "@/lib/cookies";

export type LoginResult =
  | { ok: true; redirect: string }
  | { ok: "otp" }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generic pre-check: find the user and validate password + lockout.
 *  Returns the user row on success, or null for any failure.
 *  Intentionally does NOT reveal which check failed (no enumeration).
 *
 *  On a wrong password this function calls registerFailure and persists the
 *  updated throttle state to the DB — identical to what authorize does — so
 *  that wrong-password attempts via requestLogin/resendOtp trip the lockout
 *  even though they never reach signIn → authorize.
 *
 *  No-double-count guarantee: the wrong-password path returns null here, so
 *  signIn is never called and authorize never runs — registerFailure fires
 *  exactly once per attempt. The correct-password path returns the user without
 *  touching the counter; authorize then calls registerSuccess only after the
 *  2FA gate passes — no double increment.
 */
async function preCheck(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (!user || !user.active) return null;

  const now = new Date();
  if (isLocked(user, now)) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const next = registerFailure(
      {
        failedLoginAttempts: user.failedLoginAttempts,
        lastFailedLoginAt: user.lastFailedLoginAt,
        lockedUntil: user.lockedUntil,
      },
      now,
    );
    await db.user.update({ where: { id: user.id }, data: next });
    return null;
  }

  return user;
}

/** Supersede any prior unconsumed OTP rows for this user, insert a fresh one,
 *  send the email, and write a notification_log row.
 *  Returns `{ ok: true }` or `{ ok: false, error: string }`.
 */
async function issueOtp(
  userId: string,
  userEmail: string,
  userLocale: string,
): Promise<{ ok: boolean; error?: string }> {
  const secret = process.env.AUTH_SECRET ?? "";
  // Fail closed: an empty secret means OTP hashes have no pepper and would be
  // trivially reversible. Refuse to generate or send a code — mirrors the
  // `if (!secret) return null` guard in authorize.
  if (!secret) return { ok: false, error: "email_failed" };
  const code = generateOtpCode();
  const codeHash = hashOtp(code, secret);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  // Supersede all prior unconsumed codes for this user in a single transaction.
  await db.$transaction([
    db.loginOtp.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    }),
    db.loginOtp.create({
      data: { userId, codeHash, expiresAt },
    }),
  ]);

  const locale = userLocale === "es" ? "es" : "en";
  const emailResult = await sendOtpEmail(userEmail, code, locale);

  // Write notification_log regardless of outcome so we have an audit trail.
  await db.notificationLog.create({
    data: {
      userId,
      channel: NotificationChannel.EMAIL,
      status: emailResult.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      event: "otp_login",
      title: "Sign-in code",
      body: null,
      error: emailResult.ok ? null : (emailResult.error ?? "unknown"),
    },
  });

  if (!emailResult.ok) {
    return { ok: false, error: "email_failed" };
  }
  return { ok: true };
}

/** Read the TRUSTED_DEVICE cookie and attempt to parse it.
 *  Returns parsed `{ userId, deviceId }` or null.
 */
async function readTrustedCookie(): Promise<{ userId: string; deviceId: string } | null> {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return null;
  const jar = await cookies();
  const raw = jar.get(TRUSTED_DEVICE_COOKIE)?.value;
  if (!raw) return null;
  return parseTrustedToken(raw, secret, new Date(), TRUSTED_MAX_AGE_MS);
}

/** Set or refresh the TRUSTED_DEVICE cookie.
 *  deviceId: reuse an existing one if we parsed it from the old cookie,
 *  otherwise mint a fresh one. This implements the 30-day sliding window.
 */
async function setTrustedCookie(userId: string, existingDeviceId?: string): Promise<void> {
  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return;
  const deviceId = existingDeviceId ?? newDeviceId();
  const token = signTrustedToken(userId, deviceId, Date.now(), secret);
  const jar = await cookies();
  jar.set(TRUSTED_DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(TRUSTED_MAX_AGE_MS / 1000), // 30 days in seconds
  });
}

// ---------------------------------------------------------------------------
// Public server actions
// ---------------------------------------------------------------------------

/**
 * Step 1: password check + trusted-device or OTP gate.
 *
 * - Pre-validates password + lockout (authoritative check; wrong-password
 *   attempts call registerFailure and persist throttle state so the 5/15/30
 *   lockout fires even without reaching authorize).
 * - If a valid trusted-device cookie for this user exists → calls `signIn` with
 *   { email, password, trustedToken } and refreshes the cookie.
 * - If no valid trusted cookie → issues an OTP, emails it, returns `{ ok: "otp" }`.
 */
export async function requestLogin(email: string, password: string): Promise<LoginResult> {
  // Pre-check (UX gate — do not increment lockout here)
  const user = await preCheck(email, password);
  if (!user) {
    // Generic error — do not reveal whether email exists or password was wrong.
    return { ok: false, error: "invalid" };
  }

  // Read trusted-device cookie
  const parsed = await readTrustedCookie();
  const trusted = parsed !== null && parsed.userId === user.id ? parsed : null;

  if (trusted) {
    // Trusted path — forward the raw cookie value as the trustedToken credential
    // so `authorize`'s second-factor gate can verify it. The raw token is the
    // cookie value; we re-read it to pass it through.
    const jar = await cookies();
    const rawToken = jar.get(TRUSTED_DEVICE_COOKIE)?.value ?? "";
    try {
      await signIn("credentials", {
        email,
        password,
        trustedToken: rawToken,
        redirect: false,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        return { ok: false, error: "invalid" };
      }
      throw err;
    }
    // Refresh the cookie (sliding 30-day window)
    await setTrustedCookie(user.id, trusted.deviceId);
    return { ok: true, redirect: "/" };
  }

  // Untrusted path — issue and email an OTP
  const result = await issueOtp(user.id, user.email, user.locale);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "email_failed" };
  }
  return { ok: "otp" };
}

/**
 * Step 2: OTP verification.
 *
 * Calls `signIn` with { email, password, otp: code }. On success sets/refreshes
 * the trusted-device cookie and returns `{ ok: true }`.
 */
export async function submitOtp(
  email: string,
  password: string,
  code: string,
): Promise<LoginResult> {
  // Determine the current deviceId (if there's already a valid trusted cookie
  // for this email address, reuse the deviceId so the device stays consistent).
  // We need the userId to check ownership; look it up without trusting it for auth.
  const userRow = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true },
  });

  let existingDeviceId: string | undefined;
  if (userRow) {
    const parsed = await readTrustedCookie();
    if (parsed && parsed.userId === userRow.id) {
      existingDeviceId = parsed.deviceId;
    }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      otp: code,
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "otp" };
    }
    throw err;
  }

  // signIn succeeded — authorize consumed the OTP and wrote registerSuccess.
  // Set/refresh the trusted-device cookie.
  if (userRow) {
    await setTrustedCookie(userRow.id, existingDeviceId);
  }

  return { ok: true, redirect: "/" };
}

/**
 * Resend: re-issue a fresh OTP (supersedes prior).
 *
 * Re-validates password lightly before re-sending, so a stale or guessed
 * email cannot be used to spam OTP emails.
 */
export async function resendOtp(email: string, password: string): Promise<LoginResult> {
  const user = await preCheck(email, password);
  if (!user) {
    return { ok: false, error: "invalid" };
  }

  const result = await issueOtp(user.id, user.email, user.locale);
  if (!result.ok) {
    return { ok: false, error: result.error ?? "email_failed" };
  }
  return { ok: "otp" };
}
