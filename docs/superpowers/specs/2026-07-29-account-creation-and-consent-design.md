# Account Creation, Phone Capture & Messaging Consent — Design Spec

**Date:** 2026-07-29
**Component:** Cross-cutting (Component I auth + Component II.A contractor rail)
**Companion spec:** `2026-07-29-whatsapp-twilio-contractor-rail-design.md` (Spec A — consumes the consent artifact this spec produces)
**Status:** Design approved; **build approved (Kyle, 2026-07-29)**.
**Priority:** ⚡ **Builds BEFORE Spec A.** Twilio's A2P 10DLC submission is live and requires
demonstrating a real opt-in checkbox (`docs/assets/TwilioConsentRequirements_RISE8_072926.png`,
"Web Form" opt-in ticked). The submission cannot complete until this form exists.

---

## 1. Purpose

Three things, one flow:

1. **Let staff and contractors set up their own accounts** via an invite link, replacing
   admin-typed temp passwords — finally building the **activation-email flow blocked since
   Phase 2** (`TODO` Phase 2 `[!]` *"Activation email via Resend, 7-day TTL, bilingual"*). Resend
   has been live in production since 2026-06-27, so the blocker is stale.
2. **Collect a phone number and a legally sound messaging consent** — because the person themselves
   must tick the box, which is what Twilio's registration requires and what a PM ticking it on their
   behalf does not satisfy.
3. **Give contractors a way to see their own jobs** without a dispatcher relaying everything.

**Item 2 is on Spec A's critical path.** Without a defensible opt-in artifact, WhatsApp sender
registration is at risk and every dispatch rests on proxy consent.

---

## 2. Decisions settled in brainstorm (2026-07-29)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Invite-token signup, not open public `/signup`** | Satisfies Twilio's *"checkbox actively selected by the user"* while keeping admin-initiated provisioning. A public registration endpoint on a live app is attack surface for no gain |
| D2 | **Email is the only login identifier** | Reuses the auth path untouched. See §3 for the phone-as-login analysis |
| D3 | **Existing email OTP + 30-day trusted device stays the authenticator.** No SMS/WhatsApp OTP | CLAUDE.md already ruled out SMS MFA. Decisive factor: `authorize` survived two dedicated Opus security reviews, one of which caught a lockout-metering regression in this exact path. Do not reopen it for convenience |
| D4 | **Phone is a required field, canonical E.164, but never a credential** | Sidesteps number recycling and SIM-swap entirely |
| D5 | **Phone verified by Twilio delivery receipt on first real dispatch** — not a signup round trip | No extra step, and does not block on Meta approval |
| D6 | **Contractors do not need accounts.** The Spec A magic-link keeps them fully functional | Accounts are an upgrade. This is what makes D2 affordable and keeps ADR-012's intent intact |
| D7 | **`Role.CONTRACTOR` added to the existing enum**; contractor accounts are `User` rows linked via the existing `Contractor.userId` | Reuses all of auth. Alternative (separate account system) means two auth stacks forever |
| D8 | **`isFieldStaff()` redefined to an explicit allowlist** | It is currently `!isManagerOrAbove()`, which would silently classify `CONTRACTOR` as field staff. Fail-open. See §7 |

---

## 3. Phone as login — the analysis behind D2/D4

Recorded because it will be re-proposed. A phone number can do three separable jobs; conflating them
is where this goes wrong.

| Job | Needed? | Decision |
|---|---|---|
| **Contact channel** (WhatsApp dispatch) | Yes, essential | Required field |
| **Identifier** (what you type to log in) | Optional | **No** |
| **Authenticator** (OTP) | Optional | **No** |

### Phone as identifier

**For:** field staff and contractors reliably have a phone; email is often shared, dormant, or
absent. No domain typos. Already collected for WhatsApp. More familiar for Spanish-speaking crews.

**Against:**
- **Number recycling.** US carriers reassign disconnected numbers after ~30–90 days. The new owner
  requests an OTP and inherits the account. Email has no equivalent failure mode. This alone is
  disqualifying for anything holding operational data.
- Frequent number changes in this workforce → recovery churn on the admin.
- Shared handsets break a unique constraint.
- E.164 normalization is a duplicate-account bug farm.
- **The Jesús Pérez case breaks.** He is staff *and* contractor; a globally-unique phone fights the
  dual-record model T1 deliberately built.

### Phone OTP as authenticator

- **SIM swap / port-out** is the canonical attack — cheap, common, not exotic.
- SMS is unencrypted and renders on lock screens.
- WhatsApp OTP is genuinely better (E2E, device-bound) but still phone-possession-based, and
  WhatsApp's own registration uses SMS, so SIM swap reaches it too.
- Needs Meta's separate **authentication** template category — another approval.
- Every login becomes a paid message; email OTP via Resend is ~free.

**Escape hatch:** if adoption shows contractors genuinely cannot manage email, phone-as-login is
addable later, **contractor-scoped only**, without touching staff auth. Cheap to defer, expensive to
unwind.

---

## 4. Reversals to record as an ADR

Two locked decisions move. Flagged, not silently changed.

| Decision | Was | Now |
|---|---|---|
| CLAUDE.md 2026-05-30 | *"Auth v1 = login-only — no public `/signup`; admin-initiated provisioning"* | Still **no public signup**. Admin still initiates. The invitee completes their own credentials. A refinement, not a reversal |
| ADR-012 | *"**No contractor accounts.** System issues a magic-link"* | Magic-link **remains the primary path** (D6). Accounts become an optional upgrade for contractors who want a job list. Genuine scope addition |
| **ADR-023** | *"keep the **6-role** DB enum + 3-role display grouping"* | Becomes a **7-role** DB enum. The 3-role *display* grouping is unaffected in spirit — `CONTRACTOR` is outside the staff hierarchy entirely, not a fourth staff tier — but ADR-023's stated role count changes and must be amended, not quietly outgrown |

---

## 5. Twilio compliance mapping

Traced directly against Twilio's requirement screens, captured 2026-07-29:
- `docs/assets/TwilioConsentRequirements_RISE8_072926.png` — recipient-consent / web-form opt-in rules
- `docs/assets/TwilioMessageContents_RISE8_072926.png` — message contents + policy URLs

⚠️ **Both screens belong to Twilio's A2P 10DLC (US SMS) registration, not WhatsApp sender
registration.** The consent principles carry over and are worth honouring either way, but see
Spec A §14 O1 — completing these forms does not unlock WhatsApp.

| Twilio requirement | Where it is satisfied |
|---|---|
| Phone number input field | Invite form, §6 step 2 |
| **Checkbox not pre-selected** | Unchecked by default; **submit blocked until ticked**. No default-true, no dark pattern |
| Clear description of message types | Consent copy: job dispatches, job updates, urgent callouts |
| Message frequency | *"Typically 0–10 messages per week, depending on job volume"* |
| Message and data rates disclaimer | In consent copy and `/legal/messaging` |
| HELP and STOP instructions | In consent copy; STOP handling in §8 |
| Links to Terms + Privacy Policy | Links to `rentstayable.com` pages — **see O2, they currently lack the required disclosures** |
| Submit button with clear language | *"Create my account"* — consent text sits directly above it |
| **Channels named in the copy** | Names **both SMS and WhatsApp** — see §5.1 |
| Opt-in behind a link → host a screenshot publicly | Twilio explicitly permits this (image 2, note 2). Plus we publish a genuinely public `/legal/messaging` page carrying all disclosures, so a public URL exists |

### 5.1 Consent is OPTIONAL — and the copy

**Corrected during spec review (2026-07-29).** An earlier draft of §8.2 made the checkbox mandatory
to create an account. That is wrong on two counts:

1. It contradicts the *"consent is not required"* non-coercion line Twilio's own pattern expects.
2. **Consent conditioned on getting a work account is not freely given** — which undermines the
   validity of the very artifact we are building. A coerced opt-in is worse than no opt-in: it looks
   compliant while failing the substance.

So: **account creation requires email + password + phone. The messaging checkbox is genuinely
optional.** Decline it and the account works normally — that contractor is reached by phone call and
magic-link instead of WhatsApp, which is exactly how the process runs today. **Resolves O6.**

**One checkbox covers both channels; one `ConsentRecord` row is written per channel granted**
(`WHATSAPP` + `SMS`), because A2P and Meta may each need to evidence their own consent independently.

**Consent copy (EN)** — `policyVersion: "2026-07-29.1"`

> ☐ I agree to receive SMS text messages and WhatsApp messages from Stayable about work assignments,
> job details, and urgent callouts at the mobile number above. Typically 0–10 messages per week,
> depending on job volume. Message and data rates may apply. Reply HELP for help or STOP to opt out
> at any time. **Consent is optional and is not required to create your account or to be assigned
> work.** See our [Terms and Conditions] and [Privacy Policy].

**Consent copy (ES)** — machine-drafted; **must be human-reviewed before being relied on** (§9, O3)

> ☐ Acepto recibir mensajes de texto (SMS) y mensajes de WhatsApp de Stayable sobre asignaciones de
> trabajo, detalles de trabajos y llamadas urgentes al número de celular indicado arriba. Normalmente
> de 0 a 10 mensajes por semana, según el volumen de trabajo. Pueden aplicarse tarifas de mensajes y
> datos. Responda HELP para obtener ayuda o STOP para darse de baja en cualquier momento. **El
> consentimiento es opcional y no es necesario para crear su cuenta ni para recibir asignaciones de
> trabajo.** Consulte nuestros [Términos y Condiciones] y [Política de Privacidad].

**⚠️ The consent language currently drafted in the Twilio form is the weak point.** It says opt-in is
*"completed by their Stayable project manager on their behalf,"* which contradicts *"checkbox must be
actively selected by the user, not pre-checked."* **Rewrite it** once this flow ships, to describe
the invitee ticking their own box. Suggested replacement:

> Contractors and staff receive a personal invitation link from Stayable. On that page they enter
> their own mobile number and must actively check an unchecked consent box before an account is
> created. The consent text, message frequency, rate disclaimer, and opt-out instructions are shown
> on the same screen. Recipients may opt out at any time by replying STOP.

---

## 6. Data model

`User.phone` already exists (`schema.prisma:151`) and is unused — this fills it.

```prisma
enum Role {
  HK
  PA
  MT
  MANAGER
  CORPORATE
  ADMIN
  CONTRACTOR      // NEW — see §7 before touching anything
}

enum ConsentChannel {
  WHATSAPP
  SMS
  EMAIL
}

/// Single-use, TTL'd invitation. Admin/dispatcher creates the User or Contractor
/// row first; this lets the person set their own credentials and tick their own box.
model InviteToken {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @map("user_id") @db.Uuid
  /// SHA-256 of the token; the raw value only ever exists in the emailed URL.
  tokenHash    String    @unique @map("token_hash")
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz
  consumedAt   DateTime? @map("consumed_at") @db.Timestamptz
  createdByUserId String @map("created_by_user_id") @db.Uuid
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz

  user      User @relation("InviteRecipient", fields: [userId], references: [id], onDelete: Cascade)
  createdBy User @relation("InviteCreator", fields: [createdByUserId], references: [id])

  @@index([userId])
  @@map("invite_tokens")
}

/// Immutable proof of opt-in. One row per grant. Never updated — a revocation is a
/// new row with revokedAt set, so the full consent history survives a challenge.
model ConsentRecord {
  id            String         @id @default(uuid()) @db.Uuid
  userId        String?        @map("user_id") @db.Uuid
  contractorId  String?        @map("contractor_id") @db.Uuid
  channel       ConsentChannel
  /// E.164 number consent was granted for. Stored explicitly: if the number later
  /// changes, this row still proves what was consented to, and when.
  phoneE164     String         @map("phone_e164")
  /// Verbatim text shown, plus a version key. "We have a checkbox somewhere" is not
  /// a defence if Meta or a carrier challenges an opt-in.
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

  @@index([contractorId, revokedAt])
  @@index([userId, revokedAt])
  @@map("consent_records")
}
```

**Additive changes:**

- `User.phoneE164 String? @unique` — canonical form; `User.phone` retained as the raw typed value for display.
  **Nullable in the schema, required at the invite form.** Deliberate: existing users predate this
  field and backfilling a fake number would be worse than a null. "Required" is a validation rule on
  the invite path (§8.2), not a DB constraint — so a legacy account without a phone stays valid and
  simply cannot be dispatched to.
- `User.phoneVerifiedAt DateTime?` — set by Spec A's delivery-receipt callback (D5).
- `Contractor.phoneVerifiedAt DateTime?` — same, for account-less contractors.
- `Contractor.consentRecords` / `User.consentRecords` back-relations.

**`phoneE164` uniqueness is scoped per table, not global** — `User.phoneE164` unique and
`Contractor.whatsapp` independent. Jesús Pérez holds the same number in both, legitimately.

---

## 7. Security — the `CONTRACTOR` role audit

**This is the riskiest part of the spec and must not be treated as routine.**

`lib/rbac.ts:30` currently reads:

```ts
export function isFieldStaff(role: Role): boolean {
  return !isManagerOrAbove(role);
}
```

Adding `CONTRACTOR` to the enum makes contractors **field staff by default**. Fail-open.

### Required changes

1. **Redefine to an explicit allowlist:**
   ```ts
   export function isFieldStaff(role: Role): boolean {
     return role === Role.HK || role === Role.PA || role === Role.MT;
   }
   export function isContractor(role: Role): boolean {
     return role === Role.CONTRACTOR;
   }
   ```
2. **Add `requireStaff()`** — `requireUser()` plus an explicit `CONTRACTOR` deny, redirecting to the
   contractor home.
3. **Audit all five `requireUser()` call sites** — every one is staff-only and must become
   `requireStaff()`:
   - `app/page.tsx:18` · `app/checklists/[id]/page.tsx:14` ·
     `app/checklists/[id]/actions.ts:47` · `app/checklists/[id]/mark-opened.action.ts:11` ·
     `app/locale-actions.ts:10` *(locale is the one legitimately shared — contractors set a locale too)*
4. **Contractors must never receive `UserProperty` rows.** `canAccessProperty` grants any
   non-portfolio role with a membership row full property access. Contractor scoping goes through
   `Contractor.properties` **only**. Enforce in `createUser`/invite: reject a `UserProperty` write
   for a `CONTRACTOR`.
5. **`lib/role-display.ts`** (ADR-023 3-role display grouping) needs a `CONTRACTOR` mapping →
   `"Contractor"`. Label-only, never authorization.
6. **`lib/nav.ts`** — contractors get their own nav; assert they receive no staff entries.

### Test obligation

`lib/rbac.ts` currently has **no unit tests** (a standing backlog item). This change makes them
mandatory: a table-driven test asserting, for **every** `Role` value, the exact boolean each
predicate returns. That test is what stops a future seventh role from silently inheriting access.

---

## 8. Flows

### 8.1 Invite (admin / dispatcher)

1. Admin creates the `User` (role, properties, locale) — existing `/admin/users`. For contractors,
   the `Contractor` row already exists from T1; the invite links a new `CONTRACTOR` `User` to it via
   `Contractor.userId`.
2. **Send invite** → mint token, hash it, store `InviteToken` (**7-day TTL**, matching the original
   Phase-2 spec), email the raw link via Resend using the existing bilingual `lib/email.ts`.
3. **Resend invite** and **revoke invite** as admin actions. Both `audit_log`ged.
4. Temp-password provisioning is **retained** as a fallback for a user with no working email —
   removing it would strand people mid-transition.

### 8.2 Accept invite (`/invite/[token]`, public, no session)

1. Validate: exists, not consumed, not expired, user still `active`. Any failure → a generic
   "invalid or expired invitation" page with no detail about which. Contact-your-manager copy.
2. Form: **set password** (existing `lib/password.ts` rules) · **confirm email** (read-only) ·
   **mobile number** (E.164-normalized on blur, shown back formatted) · **locale picker** ·
   **unchecked consent box** with full disclosure copy above the submit button.
3. Submit: transaction → set `passwordHash`, `phone`, `phoneE164`, `locale`; write `ConsentRecord`
   (text + version + IP + UA + locale); consume `InviteToken`; `audit_log`. Then sign the user in.
4. **Consent is OPTIONAL** (§5.1). Account creation succeeds either way. If ticked, write one
   `ConsentRecord` per channel (`WHATSAPP`, `SMS`). If not, the account is created with no consent
   rows and messaging is simply unavailable for that person — the dispatcher sees "no messaging
   consent — call instead" on the contractor record, and the magic-link path still works.

### 8.3 Opt-out / revocation

- Inbound `STOP` (or the ES equivalent) on the Spec A webhook → new `ConsentRecord` with `revokedAt`,
  and `JobUpdate(SYSTEM)` if attributable.
- **`dispatch.server.ts` must refuse to send** to a contractor with no live consent, with a clear
  dispatcher-facing reason. This is a compliance hard stop, not a warning.
- Admin surface: consent state on the contractor and user detail pages, plus a **re-invite to
  re-consent** action.

### 8.4 Contractor portal

Deliberately thin. Everything here is already reachable by magic-link; the account only removes the
need to find the last WhatsApp message.

- **`/my/jobs`** — jobs where `contractorId` = their linked contractor. Open first, then recent.
- **`/my/jobs/[id]`** — problem, property, room, photos, the `JobUpdate` feed, and **add an update**
  (text + photo) from the web. Photos land `NO_GPS` exactly as WhatsApp ones do.
- **Schedule view** — deferred to T6. Until the calendar exists there is no schedule to show;
  shipping an empty page would be worse than not shipping it.
- **Staff need no new surface.** Existing Home/Today already is their tasks view; staff gain only the
  invite flow.

---

## 9. Localization (ADR-013)

Field-staff surfaces are bilingual; admin/manager stay English. **Contractors are bilingual** —
`Contractor.language` defaults to `es` and the roster is Spanish-speaking.

In scope for EN + ES: invite email, `/invite/[token]` including **all consent copy**,
`/legal/messaging`, `/my/jobs`, contractor-facing notifications.

**Consent copy must be translated by a human before it is relied on legally.** Machine-drafted ES
ships for other surfaces (ADR-014 defers review to Phase 8); a consent artifact is different — if it
is challenged, "the Spanish was machine-translated" is a bad answer. `ConsentRecord.locale` +
`policyVersion` record exactly which text a person saw. **Add to the Phase-8 Spanish review as a
priority item, and flag it to Kate now.**

---

## 10. Error handling

| Failure | Behaviour |
|---|---|
| Invite invalid / expired / consumed | Generic error page, no discrimination between causes |
| Token valid, user deactivated | Same generic error; no account activation |
| Consent box unticked | **Account still created**; no `ConsentRecord` rows; messaging unavailable for that person (§5.1) |
| Phone fails E.164 parse | Inline field error; no partial write |
| `phoneE164` collides with an existing user | Inline "already in use" — do **not** reveal whose |
| Resend send fails | Invite row persists; admin sees FAILED in `notification_log` and can resend |
| Two tabs submit the same invite | `consumedAt` checked inside the transaction; second attempt gets the generic error |
| Contractor with revoked consent | Dispatch blocked with an explicit reason (§8.3) |

---

## 11. Testing

**Pure (Vitest):**
- **`lib/rbac.ts` — table-driven over every `Role`** for all four predicates (§7)
- E.164 normalization: `+1 407 555 1234` / `(407) 555-1234` / `4075551234` → one canonical value; rejects garbage
- Invite token mint/verify/expiry/consume
- Consent optionality: unticked → account created, **zero** `ConsentRecord` rows, messaging blocked;
  ticked → exactly two rows (`WHATSAPP` + `SMS`) with matching text, version, and locale

**Integration:** full invite → account round trip; deactivated-user token; double-submit;
consent-revoked dispatch block.

**Security review checkpoint:** this touches `authorize`-adjacent code and adds a role to the
authorization enum. **Requires an explicit security review pass before merge**, matching the
precedent set by Plan 2.

---

## 12. Environment variables

No new ones. Reuses `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`.

Invite tokens are random and **hashed at rest**, so they need no signing secret — deliberately
avoiding yet another use of `AUTH_SECRET`, which already carries three (NextAuth secret, OTP pepper,
trusted-device HMAC) and is a logged piece of deferred debt.

---

## 13. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| O1 | **Rewrite the Twilio consent-flow answer** (§5) once this ships — the proxy-consent wording is a rejection risk | Kyle | Sender registration |
| O2 | `rentstayable.com` privacy policy lacks: non-sharing of mobile numbers, message frequency, "message and data rates may apply". Claude can draft; someone must publish | Kyle | Registration review |
| O3 | **Human ES review of consent copy** (§9) | Kate | Relying on ES consent legally |
| O4 | Record the §4 reversals as an ADR | Kyle | — |
| O5 | prod/dev DB split — invites write real emails and phone numbers | Kyle | Go-live |
| O6 | ~~Should staff be allowed to decline consent and still get an account?~~ **RESOLVED in spec review: yes — consent is optional (§5.1).** Mandatory consent would be coercive and would undermine the artifact's validity | — | — |

---

## 14. Definition of done

- Migration applies clean; `prisma generate` green.
- **`lib/rbac.ts` table-driven role test passes for all seven roles**; `isFieldStaff` no longer
  negation-based; all five `requireUser()` sites converted.
- A `CONTRACTOR` account is provably denied `/`, `/review`, `/issues`, `/dispatch`, `/admin`,
  `/templates`, `/rules`, `/completed`, `/reports`, and the checklist runtime.
- Contractors cannot be given `UserProperty` rows.
- Invite → set password + phone (+ optional consent) → signed in, in both EN and ES.
- **Consent unticked path works:** account created, no consent rows, dispatcher sees "no messaging
  consent — call instead," magic-link still functions.
- Consent ticked → two `ConsentRecord` rows (`WHATSAPP` + `SMS`) capturing text, version, locale, IP,
  UA. Revocation writes a new row; history intact.
- **Checkbox renders unchecked, submit is not blocked by it, and a screenshot of the live page is
  produced for the Twilio A2P submission** (the reason this ships first).
- Dispatch to a revoked contractor is blocked with a visible reason.
- `/my/jobs` shows only that contractor's jobs; web-added updates appear in the same feed as WhatsApp ones.
- Expired, consumed, and deactivated-user tokens all fail generically.
- Security review pass completed.
- Full suite green; types + lint clean; build succeeds.
- **Not deployed.** Gated on O5.
