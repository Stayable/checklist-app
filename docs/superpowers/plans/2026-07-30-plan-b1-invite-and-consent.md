# Plan B1 — Invite Flow + Messaging Consent Capture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a token-gated invite page where a staff member or contractor enters their own mobile number and actively ticks an unchecked messaging-consent box, producing the live opt-in form Twilio's A2P 10DLC submission requires and the `ConsentRecord` rows Spec A needs before it may dispatch.

**Architecture:** One `InviteToken` table with a `kind` discriminator drives two modes through a single public page: `ACCOUNT` (staff — set password + phone + optional consent) and `CONSENT_ONLY` (contractor — phone + optional consent, **no account created**). Consent is optional by design; declining it creates a working account/record with zero consent rows and simply makes messaging unavailable. All token verification is pure and unit-tested; all mutations are Zod-validated, transactional, and audit-logged.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · Prisma 6 · Postgres (Neon) · Zod 4 · Vitest 4 · Resend · next-intl · bcryptjs · Node `crypto`

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-29-account-creation-and-consent-design.md`. Where this plan and the spec disagree, the plan's §Scope Deviations note wins.
- **Scope deviation (deliberate):** `Role.CONTRACTOR`, `/my/jobs`, and the rbac role audit are **NOT in this plan** — they depend on `ContractorJob` (Spec A T2, unbuilt) and block nothing on the A2P critical path. They become Plan B2.
- **Consent is OPTIONAL.** Never block account creation on it. Spec §5.1 — mandatory consent is coercive and voids the artifact's validity.
- **Checkbox renders unchecked.** No `defaultChecked`, no pre-selection, ever.
- **Consent copy is verbatim from spec §5.1.** Do not paraphrase. `policyVersion` is exactly `"2026-07-29.1"`.
- **Two `ConsentRecord` rows per grant** — one `WHATSAPP`, one `SMS`.
- **Bilingual EN + ES** on every invitee-facing surface (ADR-013). ES strings are machine-drafted and carry a review flag; consent copy ES comes verbatim from spec §5.1.
- **All datetimes** stored UTC, displayed via `lib/datetime.ts` in `America/New_York` with an `ET` suffix. Never call `toLocaleString` directly (ESLint enforces).
- **No `any`** without a documented reason. TypeScript strict mode.
- **Prisma via `lib/db.ts` singleton** only.
- **Every mutation writes `audit_log`** via the existing `writeAudit` pattern in `app/admin/users/actions.ts`.
- **Invite tokens are hashed at rest.** The raw token exists only in the emailed URL. No new signing secret — do not add a fourth use of `AUTH_SECRET`.
- **Migration must be additive.** It applies to the shared dev/prod Neon DB, so no column drops, no non-null columns without defaults.
- **Verification commands:** `pnpm test` · `pnpm typecheck` · `pnpm lint` · `pnpm build`. All four must pass before any task is considered done.
- **Do not deploy.** Branch only.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `lib/phone.ts` | **Pure.** E.164 normalization + display formatting | 1 |
| `lib/phone.test.ts` | Unit tests for the above | 1 |
| `lib/rbac.ts` | Harden `isFieldStaff` to an explicit allowlist | 2 |
| `lib/rbac.test.ts` | **New.** Table-driven predicate tests over every `Role` | 2 |
| `prisma/schema.prisma` | `InviteToken`, `ConsentRecord`, `InviteKind`, `ConsentChannel`, phone fields | 3 |
| `prisma/migrations/*/migration.sql` | Additive migration | 3 |
| `lib/invite.ts` | **Pure.** Token mint / hash / constant-time compare / expiry | 4 |
| `lib/invite.test.ts` | Unit tests | 4 |
| `lib/consent-copy.ts` | **Pure.** Verbatim EN/ES consent copy + `POLICY_VERSION` + channel list | 5 |
| `lib/consent-copy.test.ts` | Unit tests asserting required disclosure phrases | 5 |
| `lib/consent.ts` | **Pure.** `hasLiveConsent(records, channel)` — consumed by Spec A | 5 |
| `lib/consent.test.ts` | Unit tests | 5 |
| `lib/email.ts` | Add `sendInviteEmail` (bilingual) | 6 |
| `app/admin/users/actions.ts` | Add `sendAccountInvite`, `revokeInvite` | 6 |
| `app/contractors/actions.ts` | Add `sendConsentInvite` | 6 |
| `app/invite/[token]/page.tsx` | Public bilingual invite page, both modes | 7 |
| `app/invite/[token]/InviteClient.tsx` | Client form: password / phone / unchecked consent box | 7 |
| `app/invite/[token]/actions.ts` | `acceptInvite` — transactional, audit-logged | 7 |
| `app/legal/messaging/page.tsx` | Public disclosures page (EN/ES) | 8 |
| `messages/en.json`, `messages/es.json` | Invite + consent + legal strings | 7, 8 |
| `app/admin/users/UsersClient.tsx` | Invite button + status column | 6 |
| `app/contractors/ContractorsClient.tsx` | Consent state + "call instead" warning | 9 |
| `lib/nav.ts` | `/invite` + `/legal` added to `SHELL_HIDE_PREFIXES` | 7 |

---

## Scope Deviations from the Spec

Recorded so a reviewer can check intent rather than guess.

1. **`Role.CONTRACTOR` deferred to Plan B2.** Spec §7 designs it; it depends on `/my/jobs`, which depends on Spec A's unbuilt `ContractorJob`. Deferring keeps a security-sensitive enum change off the critical path. **Spec §7's rbac hardening is still done here** (Task 2) because it is valuable on its own and is the prerequisite for B2.
2. **`/my/jobs` contractor portal deferred to Plan B2** — same dependency.
3. **Contractors get `CONSENT_ONLY` invites, creating no `User` row.** Spec §8.1 assumed a contractor invite creates a `CONTRACTOR` account. Consent-only is strictly better: it yields the same compliance artifact, needs no new role, and matches spec D6 ("contractors don't need accounts"). `ConsentRecord.contractorId` already supports it.
4. **`phoneVerifiedAt` is written by Spec A's delivery-receipt callback**, which does not exist yet. This plan adds the column and leaves it null. Not a gap.

---

## Task 1: E.164 phone normalization

**Files:**
- Create: `lib/phone.ts`
- Test: `lib/phone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizePhone(input: string): { ok: true; e164: string } | { ok: false; error: PhoneError }`
  - `type PhoneError = "empty" | "too_short" | "too_long" | "invalid_chars" | "unsupported"`
  - `formatPhoneDisplay(e164: string): string`

**Context:** No phone library is installed and none is being added. The roster is US/Florida (`docs/component-ii` §II.5). This normalizer handles US 10-digit, US 11-digit with leading `1`, and already-E.164 `+`-prefixed international input with a permissive length check. Non-US numbers **must** be typed in full E.164 — documented in the field's helper text (Task 7).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/phone.test.ts
import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalizes a bare US 10-digit number", () => {
    expect(normalizePhone("4075551234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("strips US formatting punctuation", () => {
    expect(normalizePhone("(407) 555-1234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone("407.555.1234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone(" 407 555 1234 ")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts US 11-digit with a leading 1", () => {
    expect(normalizePhone("14075551234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone("1 (407) 555-1234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts already-E.164 input", () => {
    expect(normalizePhone("+14075551234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts non-US E.164 input", () => {
    expect(normalizePhone("+525512345678")).toEqual({ ok: true, e164: "+525512345678" });
  });

  it("collapses every US spelling to one canonical value", () => {
    const forms = ["+1 407 555 1234", "(407) 555-1234", "4075551234", "1-407-555-1234"];
    const out = new Set(forms.map((f) => (normalizePhone(f) as { e164: string }).e164));
    expect(out).toEqual(new Set(["+14075551234"]));
  });

  it("rejects empty input", () => {
    expect(normalizePhone("")).toEqual({ ok: false, error: "empty" });
    expect(normalizePhone("   ")).toEqual({ ok: false, error: "empty" });
  });

  it("rejects letters", () => {
    expect(normalizePhone("407-CALL-NOW")).toEqual({ ok: false, error: "invalid_chars" });
  });

  it("rejects too-short and too-long numbers", () => {
    expect(normalizePhone("5551234")).toEqual({ ok: false, error: "too_short" });
    expect(normalizePhone("+1234567890123456789")).toEqual({ ok: false, error: "too_long" });
  });

  it("rejects a bare 11-digit number not starting with 1", () => {
    expect(normalizePhone("24075551234")).toEqual({ ok: false, error: "unsupported" });
  });
});

describe("formatPhoneDisplay", () => {
  it("formats US numbers readably", () => {
    expect(formatPhoneDisplay("+14075551234")).toBe("(407) 555-1234");
  });

  it("returns non-US E.164 unchanged", () => {
    expect(formatPhoneDisplay("+525512345678")).toBe("+525512345678");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/phone.test.ts`
Expected: FAIL — `Failed to resolve import "./phone"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/phone.ts

// E.164 normalization for a US/Florida-based workforce. Deliberately dependency-free
// (no libphonenumber-js): the roster is US, and the accepted-input surface is small
// and fully enumerated in lib/phone.test.ts. Non-US numbers must be entered in full
// E.164 (leading `+` and country code) — surfaced in the invite form's helper text.

export type PhoneError = "empty" | "too_short" | "too_long" | "invalid_chars" | "unsupported";

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: PhoneError };

// E.164 allows at most 15 digits; the shortest plausible international number is 8.
const MAX_E164_DIGITS = 15;
const MIN_E164_DIGITS = 8;

export function normalizePhone(input: string): PhoneResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "empty" };

  const hadPlus = trimmed.startsWith("+");
  // Strip the punctuation people actually type; anything else is a hard reject so
  // that "407-CALL-NOW" never silently becomes a number.
  const stripped = (hadPlus ? trimmed.slice(1) : trimmed).replace(/[\s().\-–—]/g, "");
  if (!/^[0-9]+$/.test(stripped)) return { ok: false, error: "invalid_chars" };

  if (hadPlus) {
    if (stripped.length < MIN_E164_DIGITS) return { ok: false, error: "too_short" };
    if (stripped.length > MAX_E164_DIGITS) return { ok: false, error: "too_long" };
    return { ok: true, e164: `+${stripped}` };
  }

  // No `+` → assume US (NANP).
  if (stripped.length === 10) return { ok: true, e164: `+1${stripped}` };
  if (stripped.length === 11) {
    if (!stripped.startsWith("1")) return { ok: false, error: "unsupported" };
    return { ok: true, e164: `+${stripped}` };
  }
  if (stripped.length < 10) return { ok: false, error: "too_short" };
  return { ok: false, error: "unsupported" };
}

/** Human-readable form for UI. US numbers get (AAA) NNN-NNNN; others pass through. */
export function formatPhoneDisplay(e164: string): string {
  const m = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/phone.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Verify the whole suite and types are clean**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass; test count rises by 11.

- [ ] **Step 6: Commit**

```bash
git add lib/phone.ts lib/phone.test.ts
git commit -m "feat(consent): pure E.164 phone normalization

Dependency-free normalizer for a US/Florida roster. Collapses every US
spelling to one canonical value so the same person cannot end up with two
records, and hard-rejects letters rather than silently coercing them."
```

---

## Task 2: Harden role predicates + table-driven rbac tests

**Files:**
- Modify: `lib/rbac.ts:29-32`
- Create: `lib/rbac.test.ts`

**Interfaces:**
- Consumes: `Role` from `@prisma/client`.
- Produces: `isFieldStaff(role)` unchanged in signature but allowlist-based; `isPortfolioRole`, `isAdmin`, `isManagerOrAbove` unchanged.

**Context:** `isFieldStaff` is currently `!isManagerOrAbove(role)`. Any role added to the enum later inherits field-staff classification — fail-open. Spec §7. Converting it now is a **no-op for all six current roles** (verified by the test), and it is the prerequisite for Plan B2's `Role.CONTRACTOR`. `lib/rbac.ts` has no tests today; this adds the net before the change that needs it.

- [ ] **Step 1: Write the failing test**

```ts
// lib/rbac.test.ts
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { isAdmin, isFieldStaff, isManagerOrAbove, isPortfolioRole } from "./rbac";

// Table-driven over EVERY Role value. This is the guard that stops a future role
// from silently inheriting access: adding an enum member without adding a row
// here fails the exhaustiveness test below.
const EXPECTED: Record<Role, {
  portfolio: boolean;
  admin: boolean;
  managerOrAbove: boolean;
  fieldStaff: boolean;
}> = {
  [Role.HK]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.PA]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.MT]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.MANAGER]:   { portfolio: false, admin: false, managerOrAbove: true,  fieldStaff: false },
  [Role.CORPORATE]: { portfolio: true,  admin: false, managerOrAbove: true,  fieldStaff: false },
  [Role.ADMIN]:     { portfolio: true,  admin: true,  managerOrAbove: true,  fieldStaff: false },
};

describe("rbac role predicates", () => {
  it("covers every Role in the enum", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(Role).sort());
  });

  for (const [role, want] of Object.entries(EXPECTED) as [Role, typeof EXPECTED[Role]][]) {
    it(`classifies ${role} correctly`, () => {
      expect(isPortfolioRole(role)).toBe(want.portfolio);
      expect(isAdmin(role)).toBe(want.admin);
      expect(isManagerOrAbove(role)).toBe(want.managerOrAbove);
      expect(isFieldStaff(role)).toBe(want.fieldStaff);
    });
  }

  it("treats fieldStaff and managerOrAbove as disjoint for current roles", () => {
    for (const role of Object.values(Role)) {
      expect(isFieldStaff(role) && isManagerOrAbove(role)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run the test — it should PASS against current code**

Run: `pnpm vitest run lib/rbac.test.ts`
Expected: PASS. This is intentional — the test documents current behaviour so the
Step 3 refactor is provably behaviour-preserving. If it fails, stop: the mental
model is wrong and the refactor is unsafe.

- [ ] **Step 3: Convert `isFieldStaff` to an explicit allowlist**

In `lib/rbac.ts`, replace lines 29–32:

```ts
/**
 * Field staff (HK, PA, MT) — phone-first fill surfaces; the PWA-install audience.
 *
 * Deliberately an explicit allowlist, NOT `!isManagerOrAbove(role)`. A negation
 * would silently classify any future role (e.g. CONTRACTOR) as field staff and
 * grant it field-staff surfaces — fail-open. Adding a Role member must be an
 * explicit decision here, enforced by the exhaustiveness test in rbac.test.ts.
 */
export function isFieldStaff(role: Role): boolean {
  return role === Role.HK || role === Role.PA || role === Role.MT;
}
```

- [ ] **Step 4: Re-run the test to confirm the refactor changed no behaviour**

Run: `pnpm vitest run lib/rbac.test.ts`
Expected: PASS, identical results.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/rbac.ts lib/rbac.test.ts
git commit -m "refactor(rbac): allowlist isFieldStaff + table-driven role tests

isFieldStaff was !isManagerOrAbove, so any role added to the enum would
inherit field-staff surfaces — fail-open. Now an explicit allowlist, with a
table-driven test over every Role plus an exhaustiveness assertion, so adding
an enum member forces a deliberate classification decision.

No behaviour change for the six current roles; the test was written first and
passes identically before and after."
```

---

## Task 3: Schema — invites, consent records, phone fields

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_invites_and_consent/migration.sql` (generated)

**Interfaces:**
- Produces Prisma models `InviteToken`, `ConsentRecord`; enums `InviteKind`, `ConsentChannel`; fields `User.phoneE164`, `User.phoneVerifiedAt`, `Contractor.phoneVerifiedAt`.

**Context:** Additive only — this migration lands on the shared dev/prod Neon DB, so no drops and no non-null columns without defaults. `User.phone` already exists (`schema.prisma:151`) and is unused; it becomes the raw typed value while `phoneE164` holds canonical form.

- [ ] **Step 1: Add the enums**

Insert after the `Trade` enum block (`prisma/schema.prisma:130`):

```prisma
enum InviteKind {
  /// Staff: sets a password and creates working credentials.
  ACCOUNT
  /// Contractor: captures phone + messaging consent only. Creates NO account —
  /// contractors work via the dispatch magic-link (ADR-012 / Spec B D6).
  CONSENT_ONLY
}

enum ConsentChannel {
  WHATSAPP
  SMS
  EMAIL
}
```

- [ ] **Step 2: Add the models**

Insert before the `AuditLog` model (`prisma/schema.prisma:550`):

```prisma
/// Single-use, TTL'd invitation. An admin creates the User (or the Contractor row
/// already exists); this lets the PERSON set their own credentials and tick their
/// own consent box — which is what Twilio's "actively selected by the user"
/// requirement demands and what proxy consent fails.
model InviteToken {
  id              String     @id @default(uuid()) @db.Uuid
  kind            InviteKind
  /// Exactly one of these is set, matching `kind`. Enforced in the action layer.
  userId          String?    @map("user_id") @db.Uuid
  contractorId    String?    @map("contractor_id") @db.Uuid
  /// SHA-256 of the raw token. The raw value exists only in the emailed URL.
  tokenHash       String     @unique @map("token_hash")
  expiresAt       DateTime   @map("expires_at") @db.Timestamptz
  consumedAt      DateTime?  @map("consumed_at") @db.Timestamptz
  revokedAt       DateTime?  @map("revoked_at") @db.Timestamptz
  createdByUserId String     @map("created_by_user_id") @db.Uuid
  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz

  user       User?       @relation("InviteRecipient", fields: [userId], references: [id], onDelete: Cascade)
  contractor Contractor? @relation(fields: [contractorId], references: [id], onDelete: Cascade)
  createdBy  User        @relation("InviteCreator", fields: [createdByUserId], references: [id])

  @@index([userId])
  @@index([contractorId])
  @@map("invite_tokens")
}

/// Immutable proof of opt-in, one row per channel granted. Never updated: a
/// revocation is a NEW row with revokedAt set, so the full consent history
/// survives a carrier or Meta challenge.
model ConsentRecord {
  id            String         @id @default(uuid()) @db.Uuid
  userId        String?        @map("user_id") @db.Uuid
  contractorId  String?        @map("contractor_id") @db.Uuid
  channel       ConsentChannel
  /// The E.164 number consent was granted FOR. Stored explicitly so that if the
  /// number later changes, this row still proves what was consented to and when.
  phoneE164     String         @map("phone_e164")
  /// Verbatim text shown to the person, plus a version key. "We have a checkbox
  /// somewhere" is not a defence.
  consentText   String         @map("consent_text")
  policyVersion String         @map("policy_version")
  locale        Locale
  ipAddress     String?        @map("ip_address")
  userAgent     String?        @map("user_agent")
  grantedAt     DateTime       @default(now()) @map("granted_at") @db.Timestamptz
  revokedAt     DateTime?      @map("revoked_at") @db.Timestamptz
  revokedReason String?        @map("revoked_reason")

  user       User?       @relation(fields: [userId], references: [id], onDelete: Cascade)
  contractor Contractor? @relation(fields: [contractorId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([contractorId, revokedAt])
  @@map("consent_records")
}
```

- [ ] **Step 3: Add the new fields and back-relations**

In `model User` (after `phone String?`, line 151):

```prisma
  /// Canonical E.164 form of `phone`. Nullable because existing users predate the
  /// field and backfilling a fake number would be worse than a null; "required"
  /// is a validation rule on the invite path, not a DB constraint.
  phoneE164       String?   @unique @map("phone_e164")
  phoneVerifiedAt DateTime? @map("phone_verified_at") @db.Timestamptz
```

In `model User`'s relation block (after `notifications NotificationLog[]`):

```prisma
  invitesReceived InviteToken[]   @relation("InviteRecipient")
  invitesCreated  InviteToken[]   @relation("InviteCreator")
  consentRecords  ConsentRecord[]
```

In `model Contractor` (after `active Boolean @default(true)`):

```prisma
  /// Contact email, used ONLY to deliver a consent invite. Separate from
  /// `user.email` because most contractors are not staff: of the seeded roster,
  /// only Jesús Pérez has a linked User. Without this column three of four
  /// contractors would have no path to grant messaging consent at all.
  email           String?
  phoneVerifiedAt DateTime? @map("phone_verified_at") @db.Timestamptz
```

In `model Contractor`'s relation block (after `properties ContractorProperty[]`):

```prisma
  invites        InviteToken[]
  consentRecords ConsentRecord[]
```

- [ ] **Step 4: Generate and apply the migration**

```bash
pnpm db:migrate --name add_invites_and_consent
```

Expected: a new folder under `prisma/migrations/`, applied cleanly. **Read the
generated SQL before continuing** and confirm it contains only `CREATE TYPE`,
`CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`, `CREATE INDEX`, and
`ADD CONSTRAINT` — **no `DROP`, no `ALTER COLUMN ... SET NOT NULL`**. If any
destructive statement appears, stop and report.

- [ ] **Step 5: Verify the client regenerates and the app still builds**

Run: `pnpm db:generate && pnpm typecheck && pnpm test && pnpm build`
Expected: all pass. Route count unchanged (no new routes yet).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(consent): invite tokens + immutable consent records schema

InviteToken carries a kind discriminator so one flow serves staff account
activation and contractor consent-only capture (no account — contractors work
via the dispatch magic-link per ADR-012).

ConsentRecord is append-only: a revocation is a new row, not an update, so the
consent history survives a carrier or Meta challenge. It stores the verbatim
text, policy version, locale, and the E.164 number consent was granted for, so
a later number change does not destroy the proof.

Additive migration only — no drops, no NOT NULL backfills — because it lands on
the shared dev/prod Neon DB."
```

---

## Task 4: Invite token mint / verify

**Files:**
- Create: `lib/invite.ts`
- Test: `lib/invite.test.ts`

**Interfaces:**
- Consumes: nothing (pure, Node `crypto` only).
- Produces:
  - `INVITE_TTL_MS: number` (7 days)
  - `generateInviteToken(): string` — 32 random bytes, base64url
  - `hashInviteToken(token: string): string` — SHA-256 hex
  - `inviteTokenMatches(token: string, hash: string): boolean` — constant-time
  - `inviteState(row, now): "valid" | "expired" | "consumed" | "revoked"`

**Context:** Mirrors `lib/otp.ts`'s hash-and-compare shape. **No pepper and no
`AUTH_SECRET`** — the token is 256 bits of entropy, so a plain SHA-256 at rest is
sufficient and avoids a fourth use of `AUTH_SECRET` (a logged piece of deferred debt).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/invite.test.ts
import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
  generateInviteToken,
  hashInviteToken,
  inviteState,
  inviteTokenMatches,
} from "./invite";

describe("invite tokens", () => {
  it("mints distinct, URL-safe, high-entropy tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes deterministically and does not echo the token", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toContain(t);
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a correct token and rejects a wrong one", () => {
    const t = generateInviteToken();
    const h = hashInviteToken(t);
    expect(inviteTokenMatches(t, h)).toBe(true);
    expect(inviteTokenMatches(generateInviteToken(), h)).toBe(false);
  });

  it("rejects a malformed hash without throwing", () => {
    expect(inviteTokenMatches(generateInviteToken(), "not-a-hash")).toBe(false);
    expect(inviteTokenMatches(generateInviteToken(), "")).toBe(false);
  });

  it("has a 7-day TTL", () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-07-30T12:00:00Z");
  const future = new Date("2026-08-05T12:00:00Z");
  const past = new Date("2026-07-29T12:00:00Z");

  it("is valid when unexpired, unconsumed, unrevoked", () => {
    expect(inviteState({ expiresAt: future, consumedAt: null, revokedAt: null }, now)).toBe("valid");
  });

  it("is expired past expiresAt", () => {
    expect(inviteState({ expiresAt: past, consumedAt: null, revokedAt: null }, now)).toBe("expired");
  });

  it("is consumed once used", () => {
    expect(inviteState({ expiresAt: future, consumedAt: past, revokedAt: null }, now)).toBe("consumed");
  });

  it("is revoked when revoked", () => {
    expect(inviteState({ expiresAt: future, consumedAt: null, revokedAt: past }, now)).toBe("revoked");
  });

  it("reports revoked before consumed before expired when several apply", () => {
    expect(inviteState({ expiresAt: past, consumedAt: past, revokedAt: past }, now)).toBe("revoked");
    expect(inviteState({ expiresAt: past, consumedAt: past, revokedAt: null }, now)).toBe("consumed");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/invite.test.ts`
Expected: FAIL — `Failed to resolve import "./invite"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/invite.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/invite.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/invite.ts lib/invite.test.ts
git commit -m "feat(consent): pure invite token mint/hash/verify

Hashed at rest with no pepper — 256 bits of entropy makes a plain SHA-256
sufficient, which avoids a fourth use of AUTH_SECRET. inviteState precedence is
revoked > consumed > expired so an admin revocation is always the recorded
reason, though the invitee page shows one generic message for all of them."
```

---

## Task 5: Consent copy + live-consent predicate

**Files:**
- Create: `lib/consent-copy.ts`, `lib/consent-copy.test.ts`
- Create: `lib/consent.ts`, `lib/consent.test.ts`

**Interfaces:**
- Consumes: `ConsentChannel`, `Locale` from `@prisma/client`.
- Produces:
  - `POLICY_VERSION = "2026-07-29.1"`
  - `CONSENT_CHANNELS: readonly ConsentChannel[]` — `[WHATSAPP, SMS]`
  - `consentCopy(locale: "en" | "es"): string`
  - `hasLiveConsent(records: ConsentLike[], channel: ConsentChannel): boolean`
  - `type ConsentLike = { channel: ConsentChannel; revokedAt: Date | null }`

**Context:** Copy is **verbatim from spec §5.1** — it is a legal artifact, not UI
text, and is stored into `ConsentRecord.consentText` exactly as shown. `hasLiveConsent`
is what Spec A's `dispatch.server.ts` calls to refuse sending without consent.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/consent-copy.test.ts
import { describe, expect, it } from "vitest";
import { ConsentChannel } from "@prisma/client";
import { CONSENT_CHANNELS, POLICY_VERSION, consentCopy } from "./consent-copy";

describe("consent copy", () => {
  it("pins the policy version", () => {
    expect(POLICY_VERSION).toBe("2026-07-29.1");
  });

  it("grants WhatsApp and SMS, not email", () => {
    expect(CONSENT_CHANNELS).toEqual([ConsentChannel.WHATSAPP, ConsentChannel.SMS]);
  });

  // Each of these is a Twilio A2P requirement (docs/assets/TwilioConsentRequirements_*).
  // If a phrase is edited out, the registration answer becomes untrue.
  it.each([
    ["names SMS", /SMS/],
    ["names WhatsApp", /WhatsApp/],
    ["states frequency", /0–10 messages per week/],
    ["discloses rates", /Message and data rates may apply/],
    ["gives HELP", /Reply HELP/],
    ["gives STOP", /STOP to opt out/],
    ["states consent is optional", /Consent is optional/],
    ["links terms", /Terms and Conditions/],
    ["links privacy", /Privacy Policy/],
  ])("EN copy %s", (_label, pattern) => {
    expect(consentCopy("en")).toMatch(pattern);
  });

  it.each([
    ["names SMS", /SMS/],
    ["names WhatsApp", /WhatsApp/],
    ["discloses rates", /tarifas de mensajes y datos/],
    ["gives HELP", /HELP/],
    ["gives STOP", /STOP/],
    ["states consent is optional", /consentimiento es opcional/],
  ])("ES copy %s", (_label, pattern) => {
    expect(consentCopy("es")).toMatch(pattern);
  });

  it("falls back to EN for an unknown locale", () => {
    expect(consentCopy("de" as "en")).toBe(consentCopy("en"));
  });
});
```

```ts
// lib/consent.test.ts
import { describe, expect, it } from "vitest";
import { ConsentChannel } from "@prisma/client";
import { hasLiveConsent } from "./consent";

const W = ConsentChannel.WHATSAPP;
const S = ConsentChannel.SMS;

describe("hasLiveConsent", () => {
  it("is false with no records", () => {
    expect(hasLiveConsent([], W)).toBe(false);
  });

  it("is true for an unrevoked grant on the channel", () => {
    expect(hasLiveConsent([{ channel: W, revokedAt: null }], W)).toBe(true);
  });

  it("is false when the only grant is revoked", () => {
    expect(hasLiveConsent([{ channel: W, revokedAt: new Date() }], W)).toBe(false);
  });

  it("does not let one channel satisfy another", () => {
    expect(hasLiveConsent([{ channel: S, revokedAt: null }], W)).toBe(false);
  });

  it("is true when a later grant follows a revocation (re-consent)", () => {
    expect(
      hasLiveConsent(
        [
          { channel: W, revokedAt: new Date("2026-07-01") },
          { channel: W, revokedAt: null },
        ],
        W,
      ),
    ).toBe(true);
  });

  it("is false when every grant for the channel is revoked", () => {
    expect(
      hasLiveConsent(
        [
          { channel: W, revokedAt: new Date("2026-07-01") },
          { channel: W, revokedAt: new Date("2026-07-20") },
        ],
        W,
      ),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run lib/consent-copy.test.ts lib/consent.test.ts`
Expected: FAIL — both imports unresolved.

- [ ] **Step 3: Write the implementations**

```ts
// lib/consent-copy.ts
import { ConsentChannel } from "@prisma/client";

// Messaging-consent copy. VERBATIM from
// docs/superpowers/specs/2026-07-29-account-creation-and-consent-design.md §5.1.
//
// This is a legal artifact, not UI text: the exact string is persisted into
// ConsentRecord.consentText so we can prove later precisely what a person agreed
// to. Do NOT reword, reflow, or "improve" it without bumping POLICY_VERSION —
// every disclosure phrase here is a Twilio A2P requirement and is pinned by a
// test in lib/consent-copy.test.ts.
//
// ⚠️ The ES text is machine-drafted. It MUST be human-reviewed before being relied
// on legally (spec §9, open item O3) — "the Spanish was machine-translated" is a
// bad answer to a consent challenge.

export const POLICY_VERSION = "2026-07-29.1";

/**
 * Channels a single tick grants. One ConsentRecord row is written per channel,
 * because A2P (SMS) and Meta (WhatsApp) may each need to evidence their own
 * consent independently.
 */
export const CONSENT_CHANNELS = [ConsentChannel.WHATSAPP, ConsentChannel.SMS] as const;

const COPY = {
  en:
    "I agree to receive SMS text messages and WhatsApp messages from Stayable about " +
    "work assignments, job details, and urgent callouts at the mobile number above. " +
    "Typically 0–10 messages per week, depending on job volume. Message and data rates " +
    "may apply. Reply HELP for help or STOP to opt out at any time. Consent is optional " +
    "and is not required to create your account or to be assigned work. See our Terms " +
    "and Conditions and Privacy Policy.",
  es:
    "Acepto recibir mensajes de texto (SMS) y mensajes de WhatsApp de Stayable sobre " +
    "asignaciones de trabajo, detalles de trabajos y llamadas urgentes al número de " +
    "celular indicado arriba. Normalmente de 0 a 10 mensajes por semana, según el " +
    "volumen de trabajo. Pueden aplicarse tarifas de mensajes y datos. Responda HELP " +
    "para obtener ayuda o STOP para darse de baja en cualquier momento. El " +
    "consentimiento es opcional y no es necesario para crear su cuenta ni para recibir " +
    "asignaciones de trabajo. Consulte nuestros Términos y Condiciones y Política de " +
    "Privacidad.",
} as const;

export function consentCopy(locale: "en" | "es"): string {
  return COPY[locale] ?? COPY.en;
}
```

```ts
// lib/consent.ts
import { ConsentChannel } from "@prisma/client";

// ConsentRecord is append-only: a revocation is a NEW row, never an update. So
// "do we have consent right now?" is not a single-row lookup — it is "does at
// least one unrevoked grant exist for this channel?", which also makes
// re-consent after a STOP work without mutating history.

export type ConsentLike = { channel: ConsentChannel; revokedAt: Date | null };

/**
 * True iff at least one unrevoked grant exists for `channel`.
 *
 * Spec A's dispatch.server.ts MUST call this before sending, and refuse with a
 * visible dispatcher-facing reason when it returns false. That is a compliance
 * hard stop, not a warning.
 */
export function hasLiveConsent(records: ConsentLike[], channel: ConsentChannel): boolean {
  return records.some((r) => r.channel === channel && r.revokedAt === null);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run lib/consent-copy.test.ts lib/consent.test.ts`
Expected: PASS — 19 tests.

- [ ] **Step 5: Full verification**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add lib/consent-copy.ts lib/consent-copy.test.ts lib/consent.ts lib/consent.test.ts
git commit -m "feat(consent): verbatim consent copy + live-consent predicate

Copy is a legal artifact persisted into ConsentRecord.consentText, so every
Twilio-required disclosure phrase is pinned by a test — editing one out fails
the suite rather than silently making the registration answer untrue.

hasLiveConsent asks whether any unrevoked grant exists rather than reading a
flag, which is what makes append-only history and post-STOP re-consent work.
Spec A's dispatcher calls it as a hard stop before sending."
```

---

## Task 6: Invite email + admin/contractor invite actions

**Files:**
- Modify: `lib/email.ts`
- Modify: `app/admin/users/actions.ts`
- Modify: `app/contractors/actions.ts`
- Modify: `app/admin/users/UsersClient.tsx`

**Interfaces:**
- Consumes: `generateInviteToken`, `hashInviteToken`, `INVITE_TTL_MS` (Task 4).
- Produces:
  - `sendInviteEmail(to, url, locale, kind): Promise<{ok, error?}>` in `lib/email.ts`
  - `sendAccountInvite(userId: string): Promise<ActionResult>` in admin actions
  - `revokeInvite(inviteId: string): Promise<ActionResult>` in admin actions
  - `sendConsentInvite(contractorId: string): Promise<ActionResult>` in contractor actions

**Context:** Follows the existing `ActionResult` + `writeAudit` + `requireAdmin`
patterns already in `app/admin/users/actions.ts`. Contractor invites require
manager-or-above with property scope, matching T1's existing contractor actions.
`sendEmail` already returns `{ok:false, error:"email_not_configured"}` when Resend
is unset — treat that as a surfaced failure, not a throw.

- [ ] **Step 1: Add the bilingual invite email to `lib/email.ts`**

Append to `lib/email.ts`:

```ts
const INVITE_COPY = {
  en: {
    ACCOUNT: {
      subject: "Set up your StayCheck account",
      body: (url: string) =>
        `You've been invited to StayCheck. Set your password and confirm your mobile number here:\n\n${url}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
    },
    CONSENT_ONLY: {
      subject: "Confirm your contact details for Stayable work assignments",
      body: (url: string) =>
        `Stayable would like to send you work assignments by WhatsApp. Confirm your mobile number here:\n\n${url}\n\nThis link expires in 7 days. Messaging is optional — you can decline and still receive work.`,
    },
  },
  es: {
    ACCOUNT: {
      subject: "Configura tu cuenta de StayCheck",
      body: (url: string) =>
        `Te invitamos a StayCheck. Establece tu contraseña y confirma tu número de celular aquí:\n\n${url}\n\nEste enlace caduca en 7 días. Si no esperabas esto, ignora este correo.`,
    },
    CONSENT_ONLY: {
      subject: "Confirma tus datos de contacto para asignaciones de Stayable",
      body: (url: string) =>
        `Stayable quiere enviarte asignaciones de trabajo por WhatsApp. Confirma tu número de celular aquí:\n\n${url}\n\nEste enlace caduca en 7 días. Los mensajes son opcionales — puedes rechazarlos y seguir recibiendo trabajo.`,
    },
  },
} as const;

export async function sendInviteEmail(
  to: string,
  url: string,
  locale: "en" | "es",
  kind: "ACCOUNT" | "CONSENT_ONLY",
): Promise<{ ok: boolean; error?: string }> {
  const copy = (INVITE_COPY[locale] ?? INVITE_COPY.en)[kind];
  return sendEmail({ to, subject: copy.subject, text: copy.body(url) });
}
```

- [ ] **Step 2: Add `sendAccountInvite` and `revokeInvite` to `app/admin/users/actions.ts`**

Add these imports at the top:

```ts
import { InviteKind, NotificationChannel, NotificationStatus } from "@prisma/client";
import {
  INVITE_TTL_MS,
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from "@/lib/invite";
import { sendInviteEmail } from "@/lib/email";
```

First add `buildInviteUrl` to `lib/invite.ts` (shared by both action files — do not
duplicate it), and a test for it:

```ts
// lib/invite.ts — append
/** Absolute invite URL. Falls back to the production origin when the env is unset. */
export function buildInviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://ops.rentstayable.com";
  return `${base.replace(/\/+$/, "")}/invite/${token}`;
}
```

```ts
// lib/invite.test.ts — append
describe("buildInviteUrl", () => {
  it("builds an absolute URL and strips a trailing slash on the base", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    expect(buildInviteUrl("abc")).toBe("https://example.com/invite/abc");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});
```

Run: `pnpm vitest run lib/invite.test.ts` → PASS.

Then append these actions to `app/admin/users/actions.ts`:

```ts
export async function sendAccountInvite(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, locale: true, active: true },
  });
  if (!user) return { ok: false, error: "User not found." };
  if (!user.active) return { ok: false, error: "Reactivate this user before inviting them." };

  const token = generateInviteToken();
  const invite = await db.inviteToken.create({
    data: {
      kind: InviteKind.ACCOUNT,
      userId,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdByUserId: admin.id,
    },
    select: { id: true },
  });

  const sent = await sendInviteEmail(user.email, buildInviteUrl(token), user.locale, "ACCOUNT");
  // NotificationLog.title is non-null with no default — it must be supplied.
  await db.notificationLog.create({
    data: {
      userId,
      channel: NotificationChannel.EMAIL,
      status: sent.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
      event: "account_invite",
      title: "StayCheck account invitation",
      entityType: "user",
      entityId: userId,
      error: sent.error,
    },
  });
  await writeAudit(admin.id, userId, "send_invite", { inviteId: invite.id, sent: sent.ok });
  revalidatePath("/admin/users");

  if (!sent.ok) {
    return {
      ok: false,
      error: `Invite created but email failed (${sent.error}). Use Resend invite once email is configured.`,
    };
  }
  return { ok: true, message: `Invite sent to ${user.email}. Expires in 7 days.` };
}

export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const invite = await db.inviteToken.findUnique({
    where: { id: inviteId },
    select: { id: true, userId: true, contractorId: true, consumedAt: true, revokedAt: true },
  });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.consumedAt) return { ok: false, error: "That invite was already used." };
  if (invite.revokedAt) return { ok: true, message: "Already revoked." };

  await db.inviteToken.update({ where: { id: inviteId }, data: { revokedAt: new Date() } });
  await writeAudit(admin.id, invite.userId ?? invite.contractorId ?? inviteId, "revoke_invite", {
    inviteId,
  });
  revalidatePath("/admin/users");
  revalidatePath("/contractors");
  return { ok: true, message: "Invite revoked." };
}
```

- [ ] **Step 3: Add `sendConsentInvite` to `app/contractors/actions.ts`**

Read the existing file first and follow its RBAC + audit pattern exactly. Add:

```ts
export async function sendConsentInvite(contractorId: string): Promise<ActionResult> {
  const user = await requireManager();

  const contractor = await db.contractor.findUnique({
    where: { id: contractorId },
    select: {
      id: true,
      name: true,
      language: true,
      active: true,
      email: true,
      user: { select: { email: true } },
      properties: { select: { propertyId: true } },
    },
  });
  if (!contractor) return { ok: false, error: "Contractor not found." };
  if (!contractor.active) return { ok: false, error: "This contractor is archived." };

  // Scoped managers may only invite contractors at properties they can access.
  const allowed = await Promise.all(
    contractor.properties.map((p) => canAccessProperty(user, p.propertyId)),
  );
  if (!allowed.some(Boolean)) {
    return { ok: false, error: "You don't have access to this contractor's properties." };
  }

  // Consent invites are emailed. Prefer the contractor's own email; fall back to a
  // linked staff account's (Jesús Pérez is both). Most of the roster has no User,
  // which is exactly why Contractor.email exists.
  const email = contractor.email ?? contractor.user?.email;
  if (!email) {
    return {
      ok: false,
      error: "Add an email address for this contractor before sending a consent invite.",
    };
  }

  const token = generateInviteToken();
  const invite = await db.inviteToken.create({
    data: {
      kind: InviteKind.CONSENT_ONLY,
      contractorId,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdByUserId: user.id,
    },
    select: { id: true },
  });

  const sent = await sendInviteEmail(email, buildInviteUrl(token), contractor.language, "CONSENT_ONLY");
  await writeAudit(user.id, contractorId, "send_consent_invite", {
    inviteId: invite.id,
    sent: sent.ok,
  });
  revalidatePath("/contractors");

  if (!sent.ok) return { ok: false, error: `Invite created but email failed (${sent.error}).` };
  return { ok: true, message: `Consent invite sent to ${email}.` };
}
```

> Import `buildInviteUrl`, `INVITE_TTL_MS`, `generateInviteToken`, `hashInviteToken`
> from `@/lib/invite`, and `canAccessProperty` / `requireManager` from `@/lib/rbac` —
> matching the imports the existing contractor actions already use.

- [ ] **Step 4: Add an Invite button + status to `app/admin/users/UsersClient.tsx`**

Follow the file's existing button/dialog pattern. Add per-row:
- **Invite** → calls `sendAccountInvite(user.id)`, shows the returned message.
- Status text when a live invite exists: `Invited — expires {date} ET` using `formatInET`.
- **Revoke** next to a live invite → `revokeInvite(id)`.

The users `page.tsx` query must additionally select the newest non-consumed,
non-revoked invite per user so the client can render that state.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all pass; route count unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/email.ts lib/invite.ts lib/invite.test.ts app/admin/users app/contractors/actions.ts
git commit -m "feat(consent): invite + consent-invite actions with bilingual email

Staff get ACCOUNT invites (set their own password); contractors get
CONSENT_ONLY invites that create no account, matching ADR-012 — they work via
the dispatch magic-link, so an account would be scope we do not need.

Email failure never loses the invite: the row persists, the failure is recorded
in notification_log and surfaced to the admin, and Resend can be retried."
```

---

## Task 7: Public invite page + accept action

**Files:**
- Create: `app/invite/[token]/page.tsx`, `app/invite/[token]/InviteClient.tsx`, `app/invite/[token]/actions.ts`
- Modify: `lib/nav.ts:42-48` (add `/invite` to `SHELL_HIDE_PREFIXES`)
- Modify: `messages/en.json`, `messages/es.json`

**Interfaces:**
- Consumes: `inviteState`, `inviteTokenMatches`, `hashInviteToken` (Task 4); `normalizePhone` (Task 1); `consentCopy`, `POLICY_VERSION`, `CONSENT_CHANNELS` (Task 5).
- Produces: `acceptInvite(input: unknown): Promise<{ok:true} | {ok:false, error:string}>`

**Context:** Public, no session. The page renders bare (no app shell). Both modes
share one form; `ACCOUNT` additionally shows password fields. **The consent
checkbox renders unchecked and never blocks submission.**

- [ ] **Step 1: Add `/invite` and `/legal` to the shell-hide list**

In `lib/nav.ts`, extend `SHELL_HIDE_PREFIXES`:

```ts
export const SHELL_HIDE_PREFIXES = [
  "/login",
  "/invite",
  "/legal",
  "/install",
  "/ios-spike",
  "/photo-test",
  "/checklists",
];
```

Add to `lib/nav.test.ts`:

```ts
it("hides the shell on public invite and legal pages", () => {
  expect(shouldHideShell("/invite/abc123")).toBe(true);
  expect(shouldHideShell("/legal/messaging")).toBe(true);
});
```

Run: `pnpm vitest run lib/nav.test.ts` → PASS.

- [ ] **Step 2: Write the accept action**

```ts
// app/invite/[token]/actions.ts
"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ConsentChannel, InviteKind, Locale } from "@prisma/client";
import { db } from "@/lib/db";
import { hashInviteToken, inviteState } from "@/lib/invite";
import { normalizePhone } from "@/lib/phone";
import { CONSENT_CHANNELS, POLICY_VERSION, consentCopy } from "@/lib/consent-copy";

const BCRYPT_COST = 12;

export type AcceptResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  token: z.string().min(1),
  phone: z.string().min(1),
  locale: z.nativeEnum(Locale),
  consent: z.boolean(),
  // Only required for ACCOUNT invites; validated below once the kind is known.
  password: z.string().optional(),
});

/** One generic message for every invalid-token state — never reveal which (Spec §10). */
const GENERIC = "This invitation is no longer valid. Ask your manager for a new one.";

export async function acceptInvite(input: unknown): Promise<AcceptResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the form and try again." };
  const { token, phone, locale, consent, password } = parsed.data;

  const invite = await db.inviteToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      id: true,
      kind: true,
      userId: true,
      contractorId: true,
      expiresAt: true,
      consumedAt: true,
      revokedAt: true,
      createdByUserId: true,
      user: { select: { active: true } },
      contractor: { select: { active: true } },
    },
  });
  if (!invite) return { ok: false, error: GENERIC };
  if (inviteState(invite, new Date()) !== "valid") return { ok: false, error: GENERIC };
  // A deactivated target must not be activatable via an outstanding invite.
  if (invite.user && !invite.user.active) return { ok: false, error: GENERIC };
  if (invite.contractor && !invite.contractor.active) return { ok: false, error: GENERIC };

  const normalized = normalizePhone(phone);
  if (!normalized.ok) {
    return { ok: false, error: "Enter a valid mobile number, e.g. (407) 555-1234." };
  }
  const e164 = normalized.e164;

  if (invite.kind === InviteKind.ACCOUNT) {
    if (!password || password.length < 10) {
      return { ok: false, error: "Password must be at least 10 characters." };
    }
    const clash = await db.user.findFirst({
      where: { phoneE164: e164, NOT: { id: invite.userId! } },
      select: { id: true },
    });
    // Do NOT reveal whose number it is.
    if (clash) return { ok: false, error: "That mobile number is already in use." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;
  const text = consentCopy(locale === Locale.es ? "es" : "en");

  const consentRows = consent
    ? CONSENT_CHANNELS.map((channel: ConsentChannel) => ({
        userId: invite.userId,
        contractorId: invite.contractorId,
        channel,
        phoneE164: e164,
        consentText: text,
        policyVersion: POLICY_VERSION,
        locale,
        ipAddress: ip,
        userAgent,
      }))
    : [];

  try {
    await db.$transaction(async (tx) => {
      // Re-check consumption inside the transaction so two tabs cannot both win.
      const fresh = await tx.inviteToken.updateMany({
        where: { id: invite.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: new Date() },
      });
      if (fresh.count !== 1) throw new Error("already_consumed");

      if (invite.kind === InviteKind.ACCOUNT) {
        await tx.user.update({
          where: { id: invite.userId! },
          data: {
            passwordHash: await bcrypt.hash(password!, BCRYPT_COST),
            phone,
            phoneE164: e164,
            locale,
            failedLoginAttempts: 0,
            lastFailedLoginAt: null,
            lockedUntil: null,
          },
        });
      } else {
        await tx.contractor.update({
          where: { id: invite.contractorId! },
          data: { whatsapp: e164, language: locale },
        });
      }

      if (consentRows.length > 0) await tx.consentRecord.createMany({ data: consentRows });

      await tx.auditLog.create({
        data: {
          actorUserId: invite.userId ?? invite.createdByUserId,
          entityType: invite.kind === InviteKind.ACCOUNT ? "user" : "contractor",
          entityId: invite.userId ?? invite.contractorId!,
          action: "accept_invite",
          after: { consent, channels: consent ? CONSENT_CHANNELS : [], policyVersion: POLICY_VERSION },
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "already_consumed") {
      return { ok: false, error: GENERIC };
    }
    return { ok: false, error: "Something went wrong. Try again." };
  }

  return { ok: true };
}
```

> **Why `createdByUserId` is selected:** `audit_log.actorUserId` is non-null and
> FK-constrained, so a `CONSENT_ONLY` invite — which has no `userId` — must
> attribute the accept to the inviting admin rather than to nobody.

- [ ] **Step 3: Write the page and client form**

`app/invite/[token]/page.tsx` — server component:
- `await params` for the token (Next 15 async params).
- Look up by `hashInviteToken(token)`, select the same fields as the action.
- If missing or `inviteState !== "valid"` or target inactive → render the generic
  error page. **No detail about which failure.**
- Otherwise render `<InviteClient>` with: `token`, `kind`, `email` (read-only for
  ACCOUNT), `defaultLocale`, `existingPhone` (contractor's current `whatsapp`,
  prefilled for confirmation), and `consentText` for both locales.

`app/invite/[token]/InviteClient.tsx` — client component:
- Locale toggle EN / ES; all labels via `next-intl`, consent text from the prop.
- **ACCOUNT mode:** password + confirm-password fields.
- Mobile number field, `type="tel"`, helper text: *"US numbers can be typed as (407) 555-1234. For a non-US number, include the country code, e.g. +52…"*
- **Consent checkbox — `checked` state initialised `false`, no `defaultChecked`.**
  Label renders the full `consentCopy` text. Links to `/legal/messaging` and the
  privacy policy.
- Submit button: *"Create my account"* (ACCOUNT) / *"Confirm my details"* (CONSENT_ONLY).
  **Never disabled on account of the checkbox.**
- On `{ok:true}`: ACCOUNT → redirect to `/login` with a success flag; CONSENT_ONLY
  → render a standalone thank-you (they have no account to log into).

- [ ] **Step 4: Add EN + ES strings**

Add an `invite` namespace to both `messages/en.json` and `messages/es.json` covering
every label, helper, button, and error string above. ES entries are machine-drafted;
the consent text itself comes from `lib/consent-copy.ts`, not from the catalogs.

- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all pass; **route count +1** (`/invite/[token]`).

- [ ] **Step 6: Manual check**

1. Create a test user in `/admin/users`, click **Invite**.
2. With `RESEND_API_KEY` unset, confirm the action reports the email failure and the
   invite row still exists.
3. Read the raw token from the DB, open `/invite/<token>`.
4. Confirm: checkbox is **unchecked**; submitting **without** ticking succeeds and
   creates **zero** `ConsentRecord` rows; the account works.
5. Repeat with the box ticked → exactly **two** rows (`WHATSAPP`, `SMS`), correct
   `consentText`, `policyVersion`, `locale`, `ipAddress`, `userAgent`.
6. Reload the consumed link → generic error.

- [ ] **Step 7: Commit**

```bash
git add app/invite lib/nav.ts lib/nav.test.ts messages
git commit -m "feat(consent): public bilingual invite page with optional consent

One token-gated page serves both modes: staff set a password, contractors
confirm a number only. The consent checkbox initialises unchecked and never
gates submission — mandatory consent would be coercive and would void the
artifact's validity (spec 5.1).

Invalid, expired, consumed, revoked, and deactivated-target tokens all render
one identical message so the page cannot be used to probe account state.
Consumption is re-checked inside the transaction via updateMany so two tabs
cannot both succeed."
```

---

## Task 8: Public messaging-disclosures page

**Files:**
- Create: `app/legal/messaging/page.tsx`

**Interfaces:**
- Consumes: `consentCopy`, `POLICY_VERSION` (Task 5).
- Produces: a public route at `/legal/messaging`.

**Context:** Twilio requires a publicly reachable URL carrying the disclosures.
The invite page is token-gated, and Twilio permits a hosted screenshot for that —
but a real public page is a stronger artifact and costs one file. This page does
**not** collect anything; it documents.

- [ ] **Step 1: Write the page**

Server component, no auth, renders bare (already covered by the `/legal` shell-hide
prefix from Task 7). Content, in EN with an ES section below it:

- Heading: *Messaging from Stayable*
- Who receives messages: staff and contractors who opt in during account setup.
- **How to opt in:** by ticking the consent box on a personal invitation link.
- Message types: work assignments, job details, urgent callouts.
- **Frequency:** typically 0–10 messages per week, depending on job volume.
- **Message and data rates may apply.**
- **HELP / STOP:** reply `HELP` for help, `STOP` to opt out at any time.
- **We do not sell, rent, or share mobile numbers with third parties** for
  marketing. Numbers are used only to send the messages described here.
- Links to the Terms and Conditions and Privacy Policy.
- The verbatim consent text via `consentCopy("en")` / `consentCopy("es")`, plus
  `Policy version {POLICY_VERSION}`.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: pass; **route count +1** (`/legal/messaging`).

- [ ] **Step 3: Confirm it renders unauthenticated**

Start the built app, open `/legal/messaging` in a logged-out browser. Expected:
200, full disclosures, no app shell, no redirect to `/login`.

- [ ] **Step 4: Commit**

```bash
git add app/legal
git commit -m "feat(consent): public /legal/messaging disclosures page

Twilio requires a publicly reachable URL carrying the message-type, frequency,
rate, HELP/STOP, and non-sharing disclosures. A hosted screenshot of the
token-gated invite page is permitted, but a real public page is a stronger
artifact and costs one file. Documents only — collects nothing."
```

---

## Task 9: Consent visibility for dispatchers

**Files:**
- Modify: `app/contractors/page.tsx`, `app/contractors/ContractorsClient.tsx`

**Interfaces:**
- Consumes: `hasLiveConsent` (Task 5), `formatPhoneDisplay` (Task 1), `sendConsentInvite` (Task 6).
- Produces: no new exports.

**Context:** A dispatcher must be able to see, before reaching for WhatsApp,
whether a contractor can legally be messaged. Spec §8.3: dispatch is blocked
without consent — that block lives in Spec A, but the **visibility** belongs here
so the state is never a surprise.

- [ ] **Step 1: Extend the contractors query**

In `app/contractors/page.tsx`, add to the contractor `select`:

```ts
consentRecords: { select: { channel: true, revokedAt: true } },
phoneVerifiedAt: true,
invites: {
  where: { consumedAt: null, revokedAt: null },
  select: { id: true, expiresAt: true },
  orderBy: { createdAt: "desc" },
  take: 1,
},
```

- [ ] **Step 2: Render consent state per row**

In `ContractorsClient.tsx`, per contractor, compute
`hasLiveConsent(c.consentRecords, ConsentChannel.WHATSAPP)` and render:

- **Consented** → `WhatsApp OK` plus `formatPhoneDisplay(whatsapp)`.
- **Not consented** → a visible warning: **`No messaging consent — call instead`**,
  with a **Send consent invite** button calling `sendConsentInvite(c.id)`. When the
  contractor has neither `email` nor a linked user email, the button is replaced by
  `Add an email to send a consent invite` — do not render a button that always fails.
- **Invite outstanding** → `Consent invite sent — expires {date} ET` via `formatInET`.

- [ ] **Step 3: Add an email field to the contractor create/edit form**

`Contractor.email` (Task 3) is otherwise unreachable — a column nobody can populate
is a dead column, and without it three of the four seeded contractors can never be
consent-invited.

In `app/contractors/ContractorsClient.tsx`, add an `email` input to the existing
create/edit form, beside the WhatsApp and phone fields. In `app/contractors/actions.ts`,
extend the existing create/update Zod schema with:

```ts
email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
```

Normalize `""` to `null` before writing. **Do not make it required** — T1's existing
rule is "WhatsApp or phone required," and email is only needed to *send* a consent
invite, not to exist in the directory.

- [ ] **Step 4: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all pass; route count unchanged.

- [ ] **Step 5: Manual check**

Open `/contractors` as a manager. Every seeded contractor shows
**No messaging consent — call instead** (none have consented). Send a consent
invite to one with a linked email and confirm the row flips to the
invite-outstanding state. Add an email to a contractor who had none (e.g. Orlando
Torres) and confirm the invite button becomes available.

- [ ] **Step 6: Commit**

```bash
git add app/contractors
git commit -m "feat(consent): surface messaging-consent state on /contractors

A dispatcher must know before reaching for WhatsApp whether a contractor can
legally be messaged. Un-consented contractors read 'No messaging consent — call
instead', which is also the honest fallback: calling is how the process runs
today. The enforcing hard stop lives in Spec A's dispatcher; this makes the
state visible so it is never a surprise."
```

---

## Task 10: Produce the Twilio artifact + close out

**Files:**
- Create: `docs/assets/OptInForm_RISE8_<MMDDYY>.png` (screenshot)
- Modify: `docs/superpowers/specs/2026-07-29-account-creation-and-consent-design.md` (mark O1/O6 done)

**Context:** This is the deliverable that unblocks the A2P submission. The build is
worthless to Kyle until the screenshot exists.

- [ ] **Step 1: Full green run**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all four pass. Record the test count and route count in the commit body.

- [ ] **Step 2: Capture the opt-in form screenshot**

Open a live `/invite/<token>` page in `ACCOUNT` mode and screenshot the full form,
showing: mobile-number field, **unchecked** consent box, the full consent text
(message types, frequency, rates, HELP/STOP, "consent is optional"), Terms and
Privacy links, and the submit button. Save to
`docs/assets/OptInForm_RISE8_<MMDDYY>.png`.

- [ ] **Step 3: Report to Kyle what he must do in Twilio**

Hand back, ready to paste:
- The `/legal/messaging` public URL.
- The screenshot path for the **Message Flow** field.
- The corrected consent-flow wording from spec §5.1 (replacing the proxy-consent text).
- The privacy-policy sentences that still need publishing on `rentstayable.com`
  (non-sharing of mobile numbers, frequency, rates) — **still an open item; Claude
  can draft, someone must publish.**

- [ ] **Step 4: Commit**

```bash
git add docs/assets docs/superpowers/specs
git commit -m "docs(consent): opt-in form screenshot for Twilio A2P submission

Closes the artifact gap that blocked the A2P Message Flow field: a real
screenshot of the live opt-in form showing the unchecked box and every required
disclosure. Marks spec O6 resolved (consent optional).

Still open and not resolvable from here: the rentstayable.com privacy policy
needs the mobile-number non-sharing statement, message frequency, and rate
disclosure published before the submission will pass review."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task | Note |
|---|---|---|
| §5 Twilio compliance mapping | 5, 7, 8 | Copy pinned by test; page renders it; public disclosures page |
| §5.1 consent optional + copy | 5, 7 | Verbatim; optionality tested and manually verified |
| §6 data model | 3 | `InviteToken`, `ConsentRecord`, phone fields |
| §7 CONTRACTOR role + rbac audit | **2 (partial)** | Allowlist + tests done. Role itself → **Plan B2** (documented deviation) |
| §8.1 invite | 6 | Send, revoke; temp-password path retained |
| §8.2 accept invite | 7 | All four steps |
| §8.3 opt-out / revocation | 5, 9 | `hasLiveConsent` + visibility. **Inbound STOP handling is Spec A** (it needs the webhook) |
| §8.4 contractor portal | — | **Plan B2** — needs `ContractorJob` |
| §9 localization | 7, 8 | EN + ES; ES review flagged in code comment |
| §10 error handling | 4, 7 | Generic messages, transactional double-submit guard, collision non-disclosure |
| §11 testing | 1, 2, 4, 5 | Pure tests. **Integration tests are manual steps** (no integration harness in this repo) |
| §12 env vars | — | None new, as specified |

**Gaps deliberately left, with reasons:**
- **Resend-invite action** is referenced in a Task 6 error message but not built as
  a separate action — `sendAccountInvite` can simply be clicked again, which mints a
  fresh token. Calling it "Resend" in the UI is accurate.
- **Automated integration tests**: the repo has no integration harness (Vitest units
  + manual verification is the established pattern). Added as explicit manual steps
  rather than pretending otherwise.
- **`phoneVerifiedAt`** is written by Spec A. Column added, left null.

**Placeholder scan:** no TBD/TODO. Two flagged `> Note:` items in Task 6 and Task 7
direct the implementer to verify `NotificationLog` field names and add
`createdByUserId` to a `select` — these are verify-against-schema instructions with
the exact remedy stated, not deferred decisions.

**Type consistency:** `normalizePhone` → `{ok,e164}` used identically in Tasks 6/7.
`inviteState(row, now)` signature matches all call sites. `CONSENT_CHANNELS` is
`readonly` and mapped with an explicit `ConsentChannel` annotation in the action.
`ActionResult` reuses the existing exported type from `app/admin/users/actions.ts`;
`acceptInvite` returns its own `AcceptResult` because it is not an admin action.
`inviteUrl` is consolidated into `lib/invite.ts` as `buildInviteUrl` (Task 6 Step 3)
rather than duplicated.
