import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { type Role, type Locale } from "@prisma/client";
import { db } from "@/lib/db";
import { isLocked, registerFailure, registerSuccess } from "@/lib/auth-throttle";

// Auth.js v5 — Credentials provider, login-only for v1 (admin-initiated
// provisioning lands in Phase 2). JWT sessions, 30-day rolling expiry. Account
// lockout per ADR-008. RBAC middleware is intentionally NOT wired here yet so
// bcrypt + Prisma stay off the edge runtime; route protection is done in server
// components via auth() for now.

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, rolling

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
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
