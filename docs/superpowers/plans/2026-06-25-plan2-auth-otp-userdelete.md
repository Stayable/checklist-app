# Plan 2 — Auth/OTP + Trusted Device + User Hard-Delete + Admin Password

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email-OTP second-factor (password + 6-digit emailed code) for ALL users with a 30-day trusted-device skip, delivered via Resend; add admin user hard-delete (blocked when the user has history); and set the admin account password to `StayableAdmin`.

**Architecture:** Verification proof lives inside the Auth.js v5 Credentials `authorize` callback so a direct `signIn` cannot bypass OTP: `authorize` always checks password + lockout, then requires EITHER a valid trusted-device token OR a valid one-time OTP (both passed as credentials and verified server-side). The login page becomes two-step; server actions orchestrate (verify password → trusted-device skip OR email an OTP → verify OTP → signIn → set the 30-day trusted-device cookie). Pure crypto/format logic (OTP generation/hashing/expiry, trusted-device token sign/verify) is extracted into unit-tested helpers. Hard-delete is an ADMIN action gated by a server-side history check.

**Tech Stack:** Next.js 15 App Router, Auth.js v5 (NextAuth beta), TypeScript strict, Prisma/Neon, `resend`, Node `crypto` (HMAC/SHA-256), bcrypt (existing), `next-intl`, Vitest.

## Global Constraints

- TypeScript strict; no `any` without a documented reason.
- This branch is NOT merged to `main`; Plan 2 changes the login flow only on the branch. The OTP path MUST be validated on a branch Preview (Resend creds present in Preview scope) before merge — note in the final report.
- OTP: 6-digit numeric, **stored hashed** (never plaintext), **10-minute TTL**, single-use (consumed on success), **max 5 verify attempts** per code then invalid. New code supersedes old (mark prior unconsumed codes for that user expired/consumed).
- Trusted-device: HMAC-SHA256 over `${userId}.${deviceId}.${issuedAtMs}` keyed by `AUTH_SECRET`; stored in an **httpOnly, Secure, SameSite=Lax** cookie; **30-day** max age; re-issued (sliding) on each successful OTP login. A tampered/expired/mismatched token is treated as absent (→ OTP required).
- Security invariant (must hold): with NO valid trusted-device token, `authorize` MUST reject a credentials sign-in that lacks a valid OTP — even if the password is correct. No OTP bypass.
- Reuse the existing lockout (`lib/auth-throttle.ts` + the `registerFailure`/`registerSuccess`/`isLocked` wiring) — do not weaken it; OTP is in addition.
- Field-staff-facing auth strings (login, OTP entry, OTP email) are **bilingual EN+ES** (ADR-013); machine-drafted ES is acceptable (Phase-8 review). OTP email locale follows `users.locale`.
- All datetimes via `lib/datetime.ts`. Prisma singleton `import { db } from "@/lib/db"`.
- Admin account `admin@rentstayable.com` → password `StayableAdmin` (weak/known — acceptable per Kate for now; harden before real staff onboarding; do NOT print it anywhere except the one-time script output).
- Migrations are additive (one new table). No destructive change to `audit_log` (the keep-forever attribution is preserved by the hard-delete rule, not by FK changes).

## Decisions resolved for this plan

1. **OTP enforcement inside `authorize`** (not only in the UI flow) — closes the bypass where someone calls `signIn` with just email+password. `authorize` accepts `{ email, password, otp?, trustedToken? }` and requires one valid second factor when no trusted token is valid.
2. **Hard-delete = block-if-history** (user decision 2026-06-25): allow hard-delete ONLY when the user has no `audit_log` actor rows AND no assigned/reviewed instances AND no assigned issues AND no created rules AND no notifications. Otherwise return an error directing the admin to **Deactivate**. No `audit_log` FK change. `user_properties` cascade-delete is fine for a no-history user.
3. **OTP hashing = SHA-256 with an `AUTH_SECRET` pepper** (fast, fine for a short-lived attempt-limited 6-digit code) rather than bcrypt — keeps verify cheap and avoids bcrypt's cost on a hot path. (bcrypt remains for passwords.)
4. **Trusted device is per-browser** (a random `deviceId` minted on first successful OTP and embedded in the signed cookie) — clearing cookies/another browser → OTP again. No `trusted_devices` table in v1 (admin revocation deferred).
5. **Email delivery now ON** (Resend creds set 2026-06-25). Beyond OTP, this plan does NOT retrofit the deferred submit/flag/activation emails — those are separate follow-ups; this plan only sends the OTP email. (Keep `lib/email.ts` general so they can reuse it.)
6. **Admin password set via a one-off script** (`scripts/set-admin-password.ts`), not a migration/seed change, so it's auditable and re-runnable.

---

## File Structure

**Create:**
- `lib/otp.ts` + `lib/otp.test.ts` — pure OTP code/hash/expiry helpers.
- `lib/trusted-device.ts` + `lib/trusted-device.test.ts` — pure HMAC token sign/verify + deviceId.
- `lib/email.ts` — Resend client + `sendOtpEmail(to, code, locale)`.
- `app/login/actions.ts` — `requestLogin`, `submitOtp`, `resendOtp` server actions.
- `scripts/set-admin-password.ts` — one-off admin password setter.

**Modify:**
- `package.json` — add `resend`.
- `prisma/schema.prisma` — add `LoginOtp` model + `User.loginOtps` relation.
- `lib/auth.ts` — rework `authorize` to accept + enforce the second factor.
- `app/login/page.tsx` — two-step UI (password → OTP), bilingual.
- `messages/en.json` + `messages/es.json` — OTP strings (`Auth` namespace).
- `app/admin/users/actions.ts` — add `deleteUser`; `app/admin/users/UsersClient.tsx` — Delete button.
- `.env.example` — already lists `RESEND_*`; confirm.

---

### Task 1: Resend email helper

**Files:** Modify `package.json`; Create `lib/email.ts`

**Interfaces:**
- Produces: `sendOtpEmail(to: string, code: string, locale: "en" | "es"): Promise<{ ok: boolean; error?: string }>`.

- [ ] **Step 1: Install**

```bash
pnpm add resend
```

- [ ] **Step 2: Write the email helper**

```typescript
// lib/email.ts
import { Resend } from "resend";

// Lazily construct the client so a missing key never throws at import time
// (build/test/CI run without RESEND_API_KEY). Sends are no-ops-with-error when
// unconfigured; the OTP flow surfaces that as a retryable failure.
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "Stayable Operations <no-reply@rentstayable.com>";

const COPY = {
  en: {
    subject: "Your Stayable Operations sign-in code",
    line: (code: string) => `Your sign-in code is ${code}. It expires in 10 minutes. If you didn't try to sign in, ignore this email.`,
  },
  es: {
    subject: "Tu código de acceso a Stayable Operations",
    line: (code: string) => `Tu código de acceso es ${code}. Caduca en 10 minutos. Si no intentaste iniciar sesión, ignora este correo.`,
  },
} as const;

export async function sendOtpEmail(
  to: string,
  code: string,
  locale: "en" | "es",
): Promise<{ ok: boolean; error?: string }> {
  const c = client();
  if (!c) return { ok: false, error: "email_not_configured" };
  const copy = COPY[locale] ?? COPY.en;
  try {
    const res = await c.emails.send({
      from: FROM,
      to,
      subject: copy.subject,
      text: copy.line(code),
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 3: Verify build (resend bundles cleanly)**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean; no bundling error for `resend`. (If `resend` needs to be server-external, add it to `serverExternalPackages` in `next.config.ts` and rebuild.) If it cannot build, report BLOCKED with the error.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml lib/email.ts
git commit -m "feat(email): Resend client + bilingual OTP email helper"
```

---

### Task 2: `login_otps` table

**Files:** Modify `prisma/schema.prisma`; migration

**Interfaces:**
- Produces: `LoginOtp { id, userId, codeHash, expiresAt, consumedAt, attempts, createdAt }` + `User.loginOtps`.

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`:

```prisma
model LoginOtp {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  codeHash  String    @map("code_hash")
  expiresAt DateTime  @map("expires_at") @db.Timestamptz
  consumedAt DateTime? @map("consumed_at") @db.Timestamptz
  attempts  Int       @default(0)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("login_otps")
}
```

Add to `model User` relations: `loginOtps LoginOtp[]`.

- [ ] **Step 2: Migrate**

```bash
pnpm prisma migrate dev --name add_login_otps
```

Expected: additive `CREATE TABLE login_otps`. If it wants to drop anything, STOP/BLOCKED.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): login_otps table for email OTP"
```

---

### Task 3: Pure OTP + trusted-device helpers

**Files:** Create `lib/otp.ts` + `lib/otp.test.ts`, `lib/trusted-device.ts` + `lib/trusted-device.test.ts`

**Interfaces:**
- Produces:
  - `generateOtpCode(): string` (6 digits, leading zeros allowed)
  - `hashOtp(code: string, pepper: string): string` (sha256 hex)
  - `verifyOtpHash(code: string, pepper: string, hash: string): boolean` (constant-time compare)
  - `isExpired(expiresAt: Date, now: Date): boolean`
  - `MAX_OTP_ATTEMPTS = 5`, `OTP_TTL_MS = 10*60*1000`
  - `newDeviceId(): string`
  - `signTrustedToken(userId: string, deviceId: string, issuedAtMs: number, secret: string): string`
  - `parseTrustedToken(token, secret, now, maxAgeMs): { userId: string; deviceId: string } | null` (returns null on bad signature / expiry / malformed)
  - `TRUSTED_MAX_AGE_MS = 30*24*60*60*1000`

- [ ] **Step 1: OTP test (RED)**

```typescript
// lib/otp.test.ts
import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtp, verifyOtpHash, isExpired } from "./otp";

describe("otp", () => {
  it("generates a 6-digit code", () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
  it("hash verifies the right code and rejects a wrong one", () => {
    const h = hashOtp("123456", "pep");
    expect(verifyOtpHash("123456", "pep", h)).toBe(true);
    expect(verifyOtpHash("654321", "pep", h)).toBe(false);
  });
  it("hash is pepper-dependent", () => {
    expect(hashOtp("123456", "a")).not.toBe(hashOtp("123456", "b"));
    expect(verifyOtpHash("123456", "b", hashOtp("123456", "a"))).toBe(false);
  });
  it("isExpired is exclusive at the boundary forward", () => {
    const exp = new Date("2026-06-25T12:00:00Z");
    expect(isExpired(exp, new Date("2026-06-25T11:59:59Z"))).toBe(false);
    expect(isExpired(exp, new Date("2026-06-25T12:00:01Z"))).toBe(true);
  });
});
```

- [ ] **Step 2: OTP impl (GREEN)**

```typescript
// lib/otp.ts
import { createHash, randomInt, timingSafeEqual } from "crypto";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtp(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

export function verifyOtpHash(code: string, pepper: string, hash: string): boolean {
  const a = Buffer.from(hashOtp(code, pepper), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}
```

Run after each: `pnpm vitest run lib/otp.test.ts` (RED then GREEN).

- [ ] **Step 3: Trusted-device test (RED)**

```typescript
// lib/trusted-device.test.ts
import { describe, expect, it } from "vitest";
import { signTrustedToken, parseTrustedToken, newDeviceId, TRUSTED_MAX_AGE_MS } from "./trusted-device";

const SECRET = "test-secret";
const t0 = 1_750_000_000_000;

describe("trusted-device token", () => {
  it("round-trips a valid token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    const parsed = parseTrustedToken(tok, SECRET, new Date(t0 + 1000), TRUSTED_MAX_AGE_MS);
    expect(parsed).toEqual({ userId: "u1", deviceId: "d1" });
  });
  it("rejects a tampered token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET) + "x";
    expect(parseTrustedToken(tok, SECRET, new Date(t0 + 1000), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    expect(parseTrustedToken(tok, "other", new Date(t0 + 1000), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects an expired token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    expect(parseTrustedToken(tok, SECRET, new Date(t0 + TRUSTED_MAX_AGE_MS + 1), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(parseTrustedToken("garbage", SECRET, new Date(t0), TRUSTED_MAX_AGE_MS)).toBeNull();
    expect(parseTrustedToken("", SECRET, new Date(t0), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("newDeviceId is unique-ish and non-empty", () => {
    expect(newDeviceId()).not.toBe(newDeviceId());
    expect(newDeviceId().length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 4: Trusted-device impl (GREEN)**

```typescript
// lib/trusted-device.ts
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
```

Run: `pnpm vitest run lib/trusted-device.test.ts` (RED then GREEN).

- [ ] **Step 5: Commit**

```bash
git add lib/otp.ts lib/otp.test.ts lib/trusted-device.ts lib/trusted-device.test.ts
git commit -m "feat(auth): pure OTP + trusted-device token helpers"
```

---

### Task 4: Enforce the second factor in `authorize` (security crux)

**Files:** Modify `lib/auth.ts`

**Interfaces:**
- Consumes: `verifyOtpHash`/`isExpired`/`MAX_OTP_ATTEMPTS` (Task 3), `parseTrustedToken`/`TRUSTED_MAX_AGE_MS` (Task 3), existing lockout + bcrypt.
- Produces: an `authorize` that accepts `{ email, password, otp?, trustedToken? }` and enforces the security invariant.

**Read `lib/auth.ts` fully first** and preserve the existing structure (Zod schema, user lookup, `isLocked`/`registerFailure`/`registerSuccess`, returned user shape, jwt/session callbacks). Extend the credentials schema and add the second-factor gate AFTER password success and BEFORE returning the user.

- [ ] **Step 1: Extend the credentials schema + authorize logic**

In the Credentials provider, widen the parsed credentials to include optional `otp` and `trustedToken` strings. After the password is verified and lockout cleared, insert the second-factor gate:

```typescript
// (inside authorize, after bcrypt success + before returning user)
// Second factor (ADR-019): a valid trusted-device token OR a valid OTP.
const secret = process.env.AUTH_SECRET ?? "";
const trusted =
  typeof creds.trustedToken === "string" && creds.trustedToken.length > 0
    ? parseTrustedToken(creds.trustedToken, secret, new Date(), TRUSTED_MAX_AGE_MS)
    : null;
const trustedOk = trusted !== null && trusted.userId === user.id;

if (!trustedOk) {
  // Require a valid OTP. No OTP / bad OTP => reject (no bypass).
  const code = typeof creds.otp === "string" ? creds.otp : "";
  if (!code) return null;
  const otpRow = await db.loginOtp.findFirst({
    where: { userId: user.id, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRow) return null;
  if (isExpired(otpRow.expiresAt, new Date()) || otpRow.attempts >= MAX_OTP_ATTEMPTS) return null;
  const pepper = secret;
  if (!verifyOtpHash(code, pepper, otpRow.codeHash)) {
    await db.loginOtp.update({ where: { id: otpRow.id }, data: { attempts: { increment: 1 } } });
    return null;
  }
  await db.loginOtp.update({ where: { id: otpRow.id }, data: { consumedAt: new Date() } });
}
// (then the existing registerSuccess + return user)
```

Notes for the implementer:
- The credentials `authorize` signature in this codebase: confirm whether it receives `(credentials)` or `(credentials, request)`. We pass `otp`/`trustedToken` as credential fields from the server actions, so reading `request` cookies inside `authorize` is NOT required — keep it credential-based.
- Keep `registerFailure` ONLY for password failures (existing behavior). An OTP failure should NOT trip the password lockout (it increments the OTP row's `attempts` instead) — preserve that separation.
- The returned user shape, jwt/session callbacks, and exports are unchanged.

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit` — clean.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): enforce email-OTP / trusted-device second factor in authorize (ADR-019)"
```

---

### Task 5: Login server actions (orchestration + email + cookie)

**Files:** Create `app/login/actions.ts`

**Interfaces:**
- Consumes: `signIn` (from `lib/auth.ts`), `db`, `sendOtpEmail` (Task 1), `generateOtpCode`/`hashOtp`/`OTP_TTL_MS` (Task 3), `signTrustedToken`/`newDeviceId`/`parseTrustedToken`/`TRUSTED_MAX_AGE_MS` (Task 3), bcrypt + lockout for the pre-check, `cookies()`.
- Produces:
  - `type LoginResult = { ok: true; redirect: string } | { ok: "otp"; } | { ok: false; error: string }`
  - `requestLogin(email, password): Promise<LoginResult>` — verifies password+lockout; if a valid trusted-device cookie for this user exists → `signIn` with `{ email, password, trustedToken }` → `{ ok: true }`; else generate+store+email an OTP → `{ ok: "otp" }`.
  - `submitOtp(email, password, code): Promise<LoginResult>` — `signIn` with `{ email, password, otp: code }`; on success set/refresh the trusted-device cookie → `{ ok: true }`; on failure `{ ok: false }`.
  - `resendOtp(email, password): Promise<LoginResult>` — re-issue + email a fresh code (supersede prior).

Key implementation points (full code authored by the implementer, reconciled to the real `signIn` usage):
- Trusted-device cookie name `TRUSTED_DEVICE` (httpOnly, secure, sameSite lax, path `/`, maxAge 30d). On read, `parseTrustedToken` it; if it parses to this user → trusted.
- When emailing an OTP: generate code, `hashOtp(code, AUTH_SECRET)`, mark prior unconsumed codes for the user consumed (supersede), insert a `LoginOtp` row with `expiresAt = now + OTP_TTL_MS`, then `sendOtpEmail(user.email, code, user.locale)`. If `sendOtpEmail` fails, return `{ ok: false, error: "email_failed" }` (do NOT reveal the code). Also write a `notification_log` row (channel EMAIL) recording sent/failed (reuse the existing pattern).
- `signIn(...)` is called with `redirect: false`; on success set the trusted-device cookie THEN return `{ ok: true, redirect: "/" }`. On the trusted path in `requestLogin`, refresh the cookie too.
- Set the cookie: mint `deviceId` = the parsed existing deviceId if present, else `newDeviceId()`; `signTrustedToken(user.id, deviceId, Date.now(), AUTH_SECRET)`.
- Do NOT leak whether an email exists: keep error copy generic ("invalid credentials") for the password step; the OTP step returns generic failure too.

- [ ] **Step 1: Write `app/login/actions.ts`** per the above (full code; "use server").
- [ ] **Step 2: Typecheck + lint** — `pnpm tsc --noEmit && pnpm lint` clean.
- [ ] **Step 3: Commit** — `feat(auth): login server actions — password→OTP→trusted-device orchestration`

---

### Task 6: Two-step login UI + strings

**Files:** Modify `app/login/page.tsx`, `messages/en.json`, `messages/es.json`

- [ ] **Step 1: Add OTP strings (both catalogs, `Auth` namespace)**

en: `otpTitle: "Enter your code"`, `otpSubtitle: "We emailed a 6-digit code. It expires in 10 minutes."`, `otpLabel: "6-digit code"`, `otpVerify: "Verify"`, `otpResend: "Resend code"`, `otpError: "That code is invalid or expired. Try again or resend."`, `otpSent: "Code sent."`, `emailFailed: "We couldn't send your code. Try again or contact your administrator."`
es (machine-drafted): `otpTitle: "Ingresa tu código"`, `otpSubtitle: "Te enviamos un código de 6 dígitos. Caduca en 10 minutos."`, `otpLabel: "Código de 6 dígitos"`, `otpVerify: "Verificar"`, `otpResend: "Reenviar código"`, `otpError: "Ese código no es válido o caducó. Intenta de nuevo o reenvía."`, `otpSent: "Código enviado."`, `emailFailed: "No pudimos enviar tu código. Intenta de nuevo o contacta a tu administrador."`

Keep the same key set in both catalogs.

- [ ] **Step 2: Rework the login page into two steps**

Replace the direct `signIn` call with the new actions. State machine: `step: "password" | "otp"`. On password submit → `requestLogin(email,password)`; if `{ok:true}` → `router.push(redirect)`; if `{ok:"otp"}` → switch to `step:"otp"`; if `{ok:false}` → show error. On OTP submit → `submitOtp(email,password,code)`; success → push; failure → `otpError`. "Resend" → `resendOtp`. Preserve the existing email/password fields, locale switcher, show/hide password, and the bilingual treatment. Keep `email`+`password` in state across the OTP step (do not require re-entry). The OTP input is `inputMode="numeric"` `autoComplete="one-time-code"` `maxLength={6}`.

- [ ] **Step 3: Verify** — `pnpm tsc --noEmit && pnpm lint && pnpm build` (the `/login` route builds; no missing-translation-key errors).
- [ ] **Step 4: Commit** — `feat(auth): two-step OTP login UI (bilingual)`

---

### Task 7: User hard-delete + admin password + final verification

**Files:** Modify `app/admin/users/actions.ts`, `app/admin/users/UsersClient.tsx`; Create `scripts/set-admin-password.ts`

**Interfaces:**
- Produces: `deleteUser(userId: string): Promise<ActionResult>` (block-if-history); a Delete button; the admin-password script.

- [ ] **Step 1: `deleteUser` action (block-if-history)**

In `app/admin/users/actions.ts`, add (ADMIN-guarded, matching the file's `ActionResult`/`writeAudit` patterns):

```typescript
export async function deleteUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (admin.id === userId) return { ok: false, error: "You can't delete your own account." };

  const [auditCount, assigned, reviewed, issues, rules, notifs] = await Promise.all([
    db.auditLog.count({ where: { actorUserId: userId } }),
    db.checklistInstance.count({ where: { assignedUserId: userId } }),
    db.checklistInstance.count({ where: { reviewedByUserId: userId } }),
    db.issue.count({ where: { assignedUserId: userId } }),
    db.recurringRule.count({ where: { createdByUserId: userId } }),
    db.notificationLog.count({ where: { userId } }),
  ]);
  const history = auditCount + assigned + reviewed + issues + rules + notifs;
  if (history > 0) {
    return { ok: false, error: "This user has activity history — deactivate them instead of deleting." };
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) return { ok: false, error: "User not found." };

  // No history → user_properties cascade-deletes; safe hard delete.
  await db.user.delete({ where: { id: userId } });
  await writeAudit(admin.id, userId, "delete", { email: target.email });
  revalidatePath("/admin/users");
  return { ok: true, message: `Deleted ${target.email}.` };
}
```

> Confirm the exact relation/field names (`actorUserId`, `assignedUserId`, `reviewedByUserId`, `createdByUserId`, `notificationLog.userId`) against the schema before finalizing.

- [ ] **Step 2: Delete button in `UsersClient.tsx`**

Add a "Delete" action next to Deactivate, ADMIN-only, with a `confirm()` ("Permanently delete {email}? This can't be undone."), calling `deleteUser(u.id)` via the existing `run(...)`/`useTransition` banner pattern. Do not show Delete for the current admin's own row.

- [ ] **Step 3: Admin password script**

```typescript
// scripts/set-admin-password.ts
import { db } from "@/lib/db";
import bcrypt from "bcryptjs"; // match the bcrypt import the app uses (verify in lib/auth.ts)

async function main() {
  const email = "admin@rentstayable.com";
  const password = "StayableAdmin";
  const passwordHash = await bcrypt.hash(password, 12);
  const res = await db.user.update({
    where: { email },
    data: { passwordHash, failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
  });
  console.log(`Updated password for ${res.email}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

Run it once:

```bash
pnpm tsx scripts/set-admin-password.ts
```

(If `tsx` isn't available, match how other scripts in the repo are run — check `package.json` scripts / the seed runner. Confirm the bcrypt package name used by `lib/auth.ts` and import the same one.) Expected: prints "Updated password for admin@rentstayable.com". This hits the shared DB (admin login password becomes `StayableAdmin`).

- [ ] **Step 4: Final whole-plan verification**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run && pnpm build`
Expected: clean types/lint; all tests pass (prior + new otp/trusted-device); `/login` builds. Note in the report that **live OTP send must be validated on a branch Preview** (Resend creds in Preview scope) before merge.

- [ ] **Step 5: Commit**

```bash
git add app/admin/users/actions.ts app/admin/users/UsersClient.tsx scripts/set-admin-password.ts
git commit -m "feat(admin): user hard-delete (block-if-history) + admin password script"
```

---

## Self-Review

**Spec coverage (spec §4 Auth/OTP, §5 user management, ADR-019):**
- Password + email OTP for all users → Tasks 1–6. ✓
- 30-day trusted-device skip → Task 3 (token) + Task 4 (authorize) + Task 5 (cookie). ✓
- OTP via Resend → Task 1 + Task 5. ✓
- Bilingual OTP (email + UI) → Task 1 copy + Task 6 strings. ✓
- `login_otps` table → Task 2. ✓
- Hard-delete (block-if-history per the 2026-06-25 decision) → Task 7. ✓
- Admin password `StayableAdmin` → Task 7 script. ✓
- Supersedes the TOTP MFA placeholder (ADR-019) — `mfaEnabled`/`mfaSecret` left untouched/unused; not wired. ✓

**Security invariants checked:** OTP enforced inside `authorize` (no signIn bypass); OTP stored hashed + peppered, single-use, attempt-limited, TTL'd; OTP failures don't trip password lockout; trusted token is HMAC-signed, expiry-checked, user-bound, httpOnly cookie; generic error copy avoids account enumeration; the code is never returned to the client or logged.

**Placeholder scan:** full code for email helper, schema, both pure-helper modules + tests, the authorize gate, hard-delete, and the admin script. Tasks 5 and 6 are "author the orchestration/UI to this precise contract" steps (server actions + page state machine) with the exact function signatures, cookie attributes, and behaviors specified — the implementer writes the glue against the real `signIn`; no "TBD"/"add validation" placeholders.

**Type consistency:** `hashOtp(code, pepper)`/`verifyOtpHash` and `parseTrustedToken(token, secret, now, maxAgeMs)` signatures match their `authorize` (Task 4) and actions (Task 5) call sites; `LoginResult` shared across the three actions and the page; `LoginOtp` fields (Task 2) match the `authorize` query (Task 4) and the actions' insert (Task 5).

**Top risks (flag for reviewers):** Task 4 is the security crux — review must confirm there is NO path to a session without either a valid trusted token or a verified OTP, and that OTP attempts/expiry/consumption are enforced. Task 5 must not leak the code or account existence and must set the cookie only after a confirmed signIn. Validate live email on Preview before merge.
