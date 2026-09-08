"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  NotificationChannel,
  NotificationStatus,
  OtpPurpose,
} from "@prisma/client";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  isExpired,
  MAX_OTP_ATTEMPTS,
  OTP_TTL_MS,
} from "@/lib/otp";
import { registerSuccess } from "@/lib/auth-throttle";
import { validatePasswordStrength } from "@/lib/password";

/**
 * Self-service password reset by emailed 6-digit code.
 *
 * Why it exists (2026-09-08): admin-initiated reset was the only route back
 * into an account, so anyone who forgot — or whose password was overwritten
 * from the admin side, which is what actually happened to Erika — was locked
 * out of their own job until Kyle was at a keyboard.
 *
 * Two properties this file is responsible for:
 *
 * 1. NO ACCOUNT ENUMERATION. `requestPasswordReset` returns the identical
 *    result for a real address, an unknown one, and a deactivated one. This is
 *    the same property `preCheck` in ../login/actions.ts defends, and it is
 *    easier to break here because there is no password to hide behind.
 *
 * 2. A RESET CODE IS NOT A LOGIN CODE. Rows are written and read with
 *    `purpose: PASSWORD_RESET`; `authorize()` only accepts `LOGIN`. Without
 *    that split, a code anyone could request by typing an address would
 *    satisfy the new-device sign-in gate.
 */

export type ResetRequestResult =
  /** Always this on a well-formed address, whether or not it resolves. */
  | { ok: true }
  | { ok: false; error: "invalid_email" | "email_failed" | "throttled" };

export type ResetConfirmResult =
  | { ok: true }
  | { ok: false; error: "code" | "weak"; message?: string };

/**
 * Re-request cooldown. The reset endpoint needs no password, so without this
 * one address can be used to fire unlimited mail through Resend — both a
 * deliverability problem for the sending domain and a way to bury the victim's
 * inbox. 60s is long enough to stop a script and short enough that a real
 * person who missed the first mail is not stuck waiting.
 *
 * Deliberately NOT exported: a "use server" module may only export async
 * functions, so exporting this constant fails the production build (caught
 * 2026-09-08). If another module ever needs it, it moves to lib/.
 */
const RESEND_COOLDOWN_MS = 60 * 1000;

const emailSchema = z.string().email().max(320);

/** Step 1 — issue and email a reset code. */
export async function requestPasswordReset(
  emailInput: string,
): Promise<ResetRequestResult> {
  const parsed = emailSchema.safeParse(emailInput.trim().toLowerCase());
  // A malformed address is a typo, not a probe, so saying so leaks nothing and
  // saves the user staring at a "check your email" screen that never fills.
  if (!parsed.success) return { ok: false, error: "invalid_email" };
  const email = parsed.data;

  const secret = process.env.AUTH_SECRET ?? "";
  // Fail closed, exactly as issueOtp does: with no pepper the stored hash is a
  // plain SHA-256 of six digits, which is a rainbow table, not a secret.
  if (!secret) return { ok: false, error: "email_failed" };

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, locale: true, active: true },
  });

  // The silent branch. An unknown or deactivated address returns `ok: true`
  // and sends nothing — indistinguishable, from the browser, from a real one.
  // Do not add logging here that a caller could time.
  if (!user || !user.active) return { ok: true };

  const now = new Date();
  const recent = await db.loginOtp.findFirst({
    where: {
      userId: user.id,
      purpose: OtpPurpose.PASSWORD_RESET,
      consumedAt: null,
      createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
    },
    select: { id: true },
  });
  // Reported as a distinct state rather than a silent `ok: true`: this branch
  // is only reachable by someone who just used this form, so it tells them
  // nothing they did not already know, and pretending the mail was sent would
  // have them waiting on a second email that is never coming.
  if (recent) return { ok: false, error: "throttled" };

  const code = generateOtpCode();
  const codeHash = hashOtp(code, secret);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await db.$transaction([
    // Only one reset code live at a time. Scoped to PASSWORD_RESET so this
    // never invalidates a login code mid-sign-in.
    db.loginOtp.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
        purpose: OtpPurpose.PASSWORD_RESET,
      },
      data: { consumedAt: now },
    }),
    db.loginOtp.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt,
        purpose: OtpPurpose.PASSWORD_RESET,
      },
    }),
  ]);

  const locale = user.locale === "es" ? "es" : "en";
  const sent = await sendPasswordResetEmail(user.email, code, locale);

  await db.notificationLog.create({
    data: {
      userId: user.id,
      channel: NotificationChannel.EMAIL,
      status: sent.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      event: "otp_password_reset",
      title: "Password reset code",
      body: null,
      error: sent.ok ? null : (sent.error ?? "unknown"),
    },
  });

  // A send failure IS disclosed. It is a property of our mail configuration,
  // not of whether the account exists — and the alternative is telling someone
  // to check an inbox that will stay empty.
  if (!sent.ok) return { ok: false, error: "email_failed" };
  return { ok: true };
}

/** Step 2 — verify the code and set the new password. */
export async function confirmPasswordReset(
  emailInput: string,
  code: string,
  newPassword: string,
): Promise<ResetConfirmResult> {
  const parsedEmail = emailSchema.safeParse(emailInput.trim().toLowerCase());
  // Past step 1 every failure collapses to "code", including a bad address:
  // reaching here at all means the caller claims to hold a code, and telling
  // them which half was wrong is what turns this form into an oracle.
  if (!parsedEmail.success) return { ok: false, error: "code" };

  const weak = validatePasswordStrength(newPassword);
  // Checked before the code is spent so a rejected password does not burn the
  // code and force a fresh email.
  if (weak) return { ok: false, error: "weak", message: weak };

  const secret = process.env.AUTH_SECRET ?? "";
  if (!secret) return { ok: false, error: "code" };

  const user = await db.user.findUnique({
    where: { email: parsedEmail.data },
    select: { id: true, active: true },
  });
  if (!user || !user.active) return { ok: false, error: "code" };

  const now = new Date();
  const row = await db.loginOtp.findFirst({
    where: {
      userId: user.id,
      consumedAt: null,
      purpose: OtpPurpose.PASSWORD_RESET,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: "code" };
  if (isExpired(row.expiresAt, now) || row.attempts >= MAX_OTP_ATTEMPTS) {
    return { ok: false, error: "code" };
  }

  if (!verifyOtpHash(code.trim(), secret, row.codeHash)) {
    // Bounded guessing: five wrong codes and the row is dead, so a six-digit
    // space cannot be walked. The counter lives on the code, not the account,
    // which is deliberate — a stranger guessing codes must not be able to lock
    // the real owner out of signing in with the password they still know.
    await db.loginOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: "code" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db.$transaction([
    db.loginOtp.update({ where: { id: row.id }, data: { consumedAt: now } }),
    // Any other live reset code dies with it — a second code sitting in an
    // older email should not still work after the password has changed.
    db.loginOtp.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
        purpose: OtpPurpose.PASSWORD_RESET,
      },
      data: { consumedAt: now },
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        // Proving control of the mailbox and choosing a password is the whole
        // point of the flow — landing on a forced-change screen afterwards
        // would ask them to do it twice.
        mustChangePassword: false,
        // Clears failed attempts and any active lock. Someone arriving here
        // has usually just hammered the login form; leaving the lock in place
        // would mean a successful reset still cannot sign in.
        ...registerSuccess(),
      },
    }),
    db.auditLog.create({
      data: {
        // Self-service: the actor and the subject are the same person. That is
        // what distinguishes these rows from an admin `set_password`.
        actorUserId: user.id,
        entityType: "user",
        entityId: user.id,
        action: "self_password_reset",
        after: { via: "email_otp" },
      },
    }),
  ]);

  // NOTE (known gap, not introduced here): existing sessions survive this.
  // `session()` reads only the JWT, so a 30-day cookie held by whoever knew
  // the old password stays valid until it expires. Tracked in CLAUDE.md under
  // "No session-revocation path"; a reset is the strongest argument yet for
  // fixing it, since it is the one moment a user actively expects the old
  // credential to stop working everywhere.
  return { ok: true };
}
