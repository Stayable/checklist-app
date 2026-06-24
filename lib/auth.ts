import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { type Role, type Locale } from "@prisma/client";
import { db } from "@/lib/db";
import { isLocked, registerFailure, registerSuccess } from "@/lib/auth-throttle";
import { parseTrustedToken, TRUSTED_MAX_AGE_MS } from "@/lib/trusted-device";
import { verifyOtpHash, isExpired, MAX_OTP_ATTEMPTS } from "@/lib/otp";

// Auth.js v5 — Credentials provider, login-only for v1 (admin-initiated
// provisioning lands in Phase 2). JWT sessions, 30-day rolling expiry. Account
// lockout per ADR-008. RBAC middleware is intentionally NOT wired here yet so
// bcrypt + Prisma stay off the edge runtime; route protection is done in server
// components via auth() for now.

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, rolling

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  otp: z.string().optional(),
  trustedToken: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const now = new Date();
        // Locked accounts are rejected before any password work is done.
        if (isLocked(user, now)) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
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

        // Second factor (ADR-019): require a valid trusted-device token OR a
        // verified, unexpired, unconsumed OTP. This gate runs AFTER password
        // success and lockout-clear. OTP failures increment only the OTP row's
        // attempts counter — they do NOT call registerFailure so the password
        // lockout is never tripped by a bad code.
        const secret = process.env.AUTH_SECRET ?? "";
        if (!secret) return null;

        const trusted =
          typeof parsed.data.trustedToken === "string" && parsed.data.trustedToken.length > 0
            ? parseTrustedToken(parsed.data.trustedToken, secret, now, TRUSTED_MAX_AGE_MS)
            : null;
        const trustedOk = trusted !== null && trusted.userId === user.id;

        if (!trustedOk) {
          // No valid trusted-device token — require a valid OTP.
          const code = typeof parsed.data.otp === "string" ? parsed.data.otp : "";
          if (!code) return null;
          const otpRow = await db.loginOtp.findFirst({
            where: { userId: user.id, consumedAt: null },
            orderBy: { createdAt: "desc" },
          });
          if (!otpRow) return null;
          if (isExpired(otpRow.expiresAt, now) || otpRow.attempts >= MAX_OTP_ATTEMPTS) return null;
          const pepper = secret;
          if (!verifyOtpHash(code, pepper, otpRow.codeHash)) {
            await db.loginOtp.update({
              where: { id: otpRow.id },
              data: { attempts: { increment: 1 } },
            });
            return null;
          }
          await db.loginOtp.update({
            where: { id: otpRow.id },
            data: { consumedAt: now },
          });
        }

        // Write success state only after 2FA gate has passed.
        await db.user.update({
          where: { id: user.id },
          data: { ...registerSuccess(), lastLoginAt: now },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          locale: user.locale,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.locale = user.locale;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.locale = token.locale as Locale;
      }
      return session;
    },
  },
});
