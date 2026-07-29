# WhatsApp × Twilio Contractor Communication Rail — Design Spec

**Date:** 2026-07-29
**Component:** II.A — Contractor Dispatch MVP (ADR-025)
**Covers:** T3 (match & rank) · T4 (one-tap dispatch) · inbound append feed (the "L2-lite" slice)
**Depends on:** T1 contractor directory (`0f86b2b`, shipped) · **T2 `ContractorJob` (specced `23b5559`, NOT built — hard prerequisite)**
**Companion spec:** `2026-07-29-account-creation-and-consent-design.md` (Spec B — supplies the consent artifact this rail legally requires)
**Status:** Design approved in brainstorm (Kyle, 2026-07-29). Not yet planned/built.

---

## 1. Purpose

Get an emergency or scheduled job to the right contractor over WhatsApp in one tap, capture their
Accept/Decline, and fold everything they send back — text, photos, Spanish voice notes — into the job
record automatically, without a human retyping it.

The pain being fixed is **reach time**: today Crystal/Shayla flag an emergency in a Teams chat,
Gerardo or Jesús then reaches contractors by WhatsApp or phone, and nothing about that round trip is
recorded anywhere the business can see.

### Non-goals (explicit)

- **No dispatcher free-form chat over WhatsApp.** Technically possible inside the 24h window, but it
  turns this into an inbox — that is the email desk's job (II.3).
- **No ETA prompts, no auto-escalation timers, no broadcast-to-pool.** See §11.
- **No SMS.** Pending the open question in §14; the `lib/messaging/` seam accommodates it if the
  answer changes.
- **No contractor accounts required.** Accounts are an upgrade (Spec B); the magic-link keeps a
  no-account contractor fully functional. This preserves ADR-012's intent.

---

## 2. Decisions settled in brainstorm (2026-07-29)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Twilio is the rail**, not `wa.me` deep-links | Twilio procurement already underway; a manual deep-link step would be throwaway |
| D2 | **Accept / Decline quick-reply buttons + append-only inbound feed** | Accept/Decline is the minimum that fixes reach time; append avoids a conversation state machine |
| D3 | **Append + suggest.** Inbound never mutates job status; it proposes | ADR-025: *"No AI decides alone."* An LLM auto-closing a job off a transcribed voice note is exactly that failure mode |
| D4 | **Dispatcher-driven ladder.** Decline/timeout alerts a human; no auto-advance | The ladder is 2 contractors deep per trade. Auto-advance earns its keep at 10, not 4 — and needs durable timers + idempotency + race guards for near-zero gain |
| D5 | **STT = OpenAI `gpt-4o-transcribe`** | Accepts OGG/Opus (what WhatsApp actually sends) natively; Azure would need an ffmpeg transcode step |
| D6 | **Audio is always stored in R2 regardless of STT** | Transcription is an enhancement, never a dependency. Missing key or failed call still yields a playable update |
| D7 | **Human-initiated send.** Dispatcher taps Dispatch | Nothing auto-fires at a contractor |
| D8 | **Per-contractor language** from `Contractor.language` | Already in the T1 schema; one template with ES + EN localizations |
| D9 | **Magic-link is multi-view, job-scoped, expires at job close or 14 days** | ⚠️ **Reverses** the TODO II.A note specifying the Phase-9 *single-use 72h* token. Single-use is right for a checklist you submit once; a contractor reopens a job link on site, tomorrow, after his phone locks |
| D10 | **Ranked attribution resolver that parks ambiguity** instead of guessing | Kyle's schedule-based idea, generalized. See §8 |
| D11 | **Dedicated `JOB_LINK_SECRET`**, not `AUTH_SECRET` | `AUTH_SECRET` is already triple-purpose (OTP pepper + trusted-device HMAC + NextAuth) and flagged as deferred debt. Do not make it quadruple |

---

## 3. Critical path — paperwork, not code

The build is not the long pole. Meta is.

| # | Owner | Item | Blocks |
|---|---|---|---|
| 1 | **Kyle** | WhatsApp sender registration: Meta Business Manager → business verification → WABA → Twilio *WhatsApp Senders* | All production sending |
| 2 | **Kyle** | Submit the dispatch template (§6) for approval, ES + EN, category **UTILITY** | All production sending |
| 3 | **Kyle** | Publish privacy-policy language: non-sharing of mobile numbers, message frequency, "message and data rates may apply" | Twilio/Meta registration review |
| 4 | Claude | Build T2 → T3 → T4 → inbound, developed against the **Twilio Sandbox** | — |
| 5 | **Kyle** | prod/dev DB split | Entering real contractor phone numbers (PII) — go-live |

**The Sandbox is why (4) does not wait on (1).** Sandbox exposes an identical API surface; only
`TWILIO_WHATSAPP_FROM` changes at cutover. Each pilot contractor opts in once with a join code.

⚠️ **Stage check (2026-07-29):** Kyle is mid-**A2P 10DLC** registration (US SMS), which does **not**
unlock WhatsApp. Item 1 above has not started. See §14.

⚠️ **A number already used on the consumer WhatsApp app cannot become a WABA sender** without first
being deleted from WhatsApp, and the move is one-way. Do not use a personal number or a property's
main line.

---

## 4. Modules

Single-responsibility, each independently testable. Only one file knows Twilio exists.

| File | Responsibility | Depends on |
|---|---|---|
| `lib/messaging/client.ts` | **The only Twilio-aware file.** `sendTemplate({to, templateSid, variables})`, `fetchMedia(url)`, `validateInboundSignature(req)` | Twilio SDK, env |
| `lib/messaging/dispatch.server.ts` | Orchestrates a send: build variables → mint link → send → write `JobDispatch` + `audit_log` + `notification_log` → set job `DISPATCHED` | client, job-links, db |
| `lib/messaging/attribution.ts` | **Pure.** Ranked resolver: inbound context → `{ jobId, confidence }` or `null` | — |
| `lib/messaging/ingest.server.ts` | Inbound side effects: append `JobUpdate`, media → R2, enqueue transcription | attribution, r2, stt |
| `lib/messaging/template-vars.ts` | **Pure.** Job + contractor → ordered template variable array, with the empty-variable guard (§6) | — |
| `lib/stt.ts` | `transcribe(audio)` → OpenAI; `translate(text, from, to)` → Claude | env |
| `lib/contractor-match.ts` | **Pure (T3).** Filter by property + trade + `active` + `onCall`, order contracted-first | — |
| `lib/job-links.ts` | **Pure-ish.** Mint + verify HMAC job-view tokens. Mirrors `lib/trusted-device.ts` | `JOB_LINK_SECRET` |
| `app/api/whatsapp/inbound/route.ts` | Webhook: validate signature → parse → delegate to ingest | client, ingest |
| `app/api/whatsapp/status/route.ts` | Delivery-receipt callback → `JobDispatch.status`, `phoneVerifiedAt` (Spec B) | db |
| `app/jobs/[token]/page.tsx` | **Public, no auth.** Contractor job view: problem, property, room, photos | job-links |

**Swap cost to Meta Cloud API later: one file** (`client.ts`). That is the point of the seam.

---

## 5. Data model

Additive migration. No existing table changes except one nullable column on `Photo` (already
specified by T2).

```prisma
enum DispatchStatus {
  SENT
  DELIVERED
  READ
  FAILED
  ACCEPTED
  DECLINED
}

enum JobUpdateKind {
  TEXT
  PHOTO
  VOICE
  SYSTEM       // dispatch sent, status changed, update re-attributed
}

enum AttributedBy {
  AUTO
  DISPATCHER
}

/// One row per contractor we messaged about a job. This IS the ladder's history:
/// "Orlando declined 14:02, Arlis dispatched 14:03."
model JobDispatch {
  id           String         @id @default(uuid()) @db.Uuid
  jobId        String         @map("job_id") @db.Uuid
  contractorId String         @map("contractor_id") @db.Uuid
  status       DispatchStatus @default(SENT)
  /// Twilio message SID — idempotency key for status callbacks.
  providerSid  String?        @unique @map("provider_sid")
  failureCode  String?        @map("failure_code")
  linkToken    String         @map("link_token")
  sentByUserId String         @map("sent_by_user_id") @db.Uuid
  sentAt       DateTime       @default(now()) @map("sent_at") @db.Timestamptz
  respondedAt  DateTime?      @map("responded_at") @db.Timestamptz

  job        ContractorJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  contractor Contractor    @relation(fields: [contractorId], references: [id])
  sentBy     User          @relation("JobDispatchSentBy", fields: [sentByUserId], references: [id])

  @@index([jobId, sentAt])
  @@index([contractorId, status])
  @@map("job_dispatches")
}

/// Append-only activity feed on a job. jobId is NULLABLE — an inbound message we
/// cannot confidently attribute is parked here rather than silently misfiled (§8).
model JobUpdate {
  id                 String        @id @default(uuid()) @db.Uuid
  jobId              String?       @map("job_id") @db.Uuid
  authorContractorId String?       @map("author_contractor_id") @db.Uuid
  authorUserId       String?       @map("author_user_id") @db.Uuid
  kind               JobUpdateKind
  /// Display text: inbound text, or the EN transcript of a voice note.
  body               String?
  /// Original-language transcript, kept per dispatch brief §4.2 ("auto-translate,
  /// keep original"). Null when body was already EN or no translation ran.
  bodyOriginal       String?       @map("body_original")
  bodyLang           Locale?       @map("body_lang")
  /// R2 key for a voice note. Present even when transcription failed (D6).
  audioKey           String?       @map("audio_key")
  audioSeconds       Int?          @map("audio_seconds")
  transcriptionError String?       @map("transcription_error")
  photoId            String?       @unique @map("photo_id") @db.Uuid
  /// e.g. COMPLETION_LIKELY | BLOCKED_LIKELY. Advisory only — never mutates status.
  suggestion         String?
  attributedBy       AttributedBy? @map("attributed_by")
  /// Twilio inbound SID — unique, so webhook retries cannot double-append.
  providerSid        String?       @unique @map("provider_sid")
  createdAt          DateTime      @default(now()) @map("created_at") @db.Timestamptz

  job              ContractorJob? @relation(fields: [jobId], references: [id], onDelete: Cascade)
  authorContractor Contractor?    @relation(fields: [authorContractorId], references: [id])
  authorUser       User?          @relation("JobUpdateAuthor", fields: [authorUserId], references: [id])
  photo            Photo?         @relation(fields: [photoId], references: [id], onDelete: SetNull)

  /// jobId-leading, so `WHERE job_id IS NULL` (the attribution tray) and
  /// `WHERE job_id = ?` (a job's feed) both use it — btree indexes NULLs.
  @@index([jobId, createdAt])
  @@index([authorContractorId, createdAt])
  @@map("job_updates")
}
```

**Photo linkage.** Inbound photos reuse T2's `Photo.contractorJobId` plus the existing R2 pipeline.
`JobUpdate.photoId` points **at** `Photo` — deliberately one-directional, so we do not add a fourth
owner FK to `Photo` and complicate the "exactly one owner" invariant.

Prisma requires both sides of a relation, so `Photo` also gains a back-relation field:

```prisma
model Photo {
  // ...
  jobUpdate JobUpdate?   // NEW — back-relation only; no new owner FK, no new column
}
```

This adds **no column** to `photos` (the FK lives on `job_updates`), so it does not affect the
"exactly one owner" invariant or T2's migration surface.

---

## 6. Outbound — the dispatch template

### A WhatsApp constraint that shapes the design

**Quick-reply buttons and call-to-action (URL) buttons are mutually exclusive** in a WhatsApp
template. We cannot have Accept/Decline buttons *and* a "View job" URL button.

**Resolution:** Accept/Decline as quick-reply buttons; the magic-link goes **in the body** as a
variable. WhatsApp auto-links it. (This is why "Embedded links" is the correct box to tick on the
Twilio message-contents form.)

### Template — ONE template, category UTILITY

Urgency is folded into variable `{{1}}` rather than becoming a second template. Deliberate: every
additional template is another item in Meta's approval queue.

**EN body**
```
New {{1}} job — {{2}} — {{3}}

Issue: {{4}}

Details and photos: {{5}}

Tap Accept if you can take it.
```

**ES body**
```
Nuevo trabajo de {{1}} — {{2}} — {{3}}

Problema: {{4}}

Detalles y fotos: {{5}}

Toca Aceptar si puedes tomarlo.
```

**Buttons (quick reply):** `Accept` / `Can't take it` — ES: `Aceptar` / `No puedo`

| Var | Content | Example |
|---|---|---|
| `{{1}}` | Trade, urgency-prefixed | `URGENT plumbing` · `plumbing` |
| `{{2}}` | Property short name | `Kissimmee East` |
| `{{3}}` | Room label | `Rm 212` |
| `{{4}}` | Problem, truncated to 220 chars | `Water leaking under sink, floor soaked` |
| `{{5}}` | Magic-link URL | `https://ops.rentstayable.com/jobs/aB3…` |

### ⚠️ The empty-variable guard

**Meta rejects a send whose variable resolves to an empty string.** `ContractorJob.roomLabel` is
nullable, so `{{3}}` will be empty for property-wide jobs and the send will fail at runtime.

`lib/messaging/template-vars.ts` must substitute a non-empty fallback — `"general area"` / `"área
general"` — and **this gets a unit test**, because it is a silent production failure otherwise.
Same guard on every variable: trim, collapse newlines and tabs (Meta rejects those in variables),
and enforce non-empty.

### Send flow

1. Dispatcher opens `/dispatch/[id]`, sees ranked contractors from T3 (contracted-first).
2. Taps **Dispatch** on one.
3. `dispatch.server.ts`: mint job link → build + validate variables → `sendTemplate()`.
4. On success: `JobDispatch(SENT)`, job → `DISPATCHED`, `audit_log`, `notification_log`.
5. On failure: **job stays `OPEN`**, `JobDispatch(FAILED)` with `failureCode`, error surfaced inline
   to the dispatcher. Never silently swallowed.

Delivery receipts (`DELIVERED` / `READ` / failed) arrive at `/api/whatsapp/status` and update
`JobDispatch`, keyed on `providerSid`.

---

## 7. Inbound — webhook

`POST /api/whatsapp/inbound`, Node runtime.

1. **Validate `X-Twilio-Signature`** against `TWILIO_AUTH_TOKEN` + the full request URL + params.
   Fail → `403`, logged, nothing written. Non-negotiable: this endpoint is public.
2. **Idempotency:** `providerSid` already present → `200`, no-op. Twilio retries.
3. **Resolve sender:** normalize `From` to E.164 → `Contractor.whatsapp`. Unknown → log to
   `notification_log`, `200`, create nothing. (Silence is correct; we must not leak whether a number
   is known.)
4. **Branch on payload:**
   - **Button payload** (`Accept` / `Can't take it`) → §7.1
   - **Media** (`NumMedia > 0`) → §7.2
   - **Text** → append `JobUpdate(TEXT)`

### 7.1 Accept / Decline

Resolve the target `JobDispatch` — the most recent `SENT`/`DELIVERED`/`READ` row for that
contractor. Then:

- **Accept** → `JobDispatch.ACCEPTED`, `respondedAt`, `JobUpdate(SYSTEM)`, job stays `DISPATCHED`
  with an accepted contractor. **Race guard:** if another contractor already accepted this job, do
  not overwrite — record the accept, flag the collision to the dispatcher.
- **Decline** → `JobDispatch.DECLINED`, `JobUpdate(SYSTEM)`, job returns to the dispatcher's
  attention with Orlando greyed out in the ranked list. **No auto-advance** (D4).

### 7.2 Media

1. `fetchMedia(url)` — Twilio media URLs require Twilio basic auth.
2. Branch on `MediaContentType0`:
   - `image/*` → `Photo` row via the existing R2 pipeline + `JobUpdate(PHOTO)`.
   - `audio/*` → R2 as `audioKey` + `JobUpdate(VOICE)`, then transcription (§9).
   - anything else → `JobUpdate(TEXT)` noting an unsupported attachment. Do not silently drop.

**⚠️ Inbound photos are not verified evidence.** Checklist photos carry client-captured GPS and a
geofence badge (ADR-015). WhatsApp supplies neither. These land `geofenceStatus = NO_GPS`,
`capturedAt = null`. **The UI must visually distinguish them** — "sent via WhatsApp, location
unverified" — and must never present them as equivalent to on-property capture. This matters the
first time a photo is used in a cost dispute.

---

## 8. Attribution — the ranked resolver

WhatsApp has no threading, so an inbound message carries no job reference. With four contractors
across eight properties, one contractor can easily have two open jobs.

`lib/messaging/attribution.ts` — **pure**, returns `{ jobId, confidence } | null`:

| Rank | Signal | Confidence |
|---|---|---|
| 1 | **Explicit job code** in the message body (`JOB-4645-12`) | `EXPLICIT` |
| 2 | **Exactly one job scheduled for this contractor today** *(requires T6 calendar — not built; slots in later with no rework)* | `SCHEDULE` |
| 3 | **Exactly one job they have accepted and not completed** | `SINGLE_OPEN` |
| 4 | Zero or multiple candidates | **`null` → park** |

**Rank 4 is the design's most important behaviour.** `JobUpdate.jobId` is nullable; unattributed
updates land in a tray on `/dispatch` — *"1 update needs a job"* — and the dispatcher one-taps it
onto the right job (`attributedBy = DISPATCHER`, written to `audit_log`).

Rationale: a voice note sitting in a tray for ten minutes is recoverable. A photo silently filed
against the wrong property is not. The same **"move this update"** action also repairs a bad
`AUTO` guess.

**v1 runs 1 → 3 → 4.** T6 inserts rank 2 and accuracy climbs.

---

## 9. Transcription + translation

Contractors report in Spanish; the back office reads English (dispatch brief §4.2).

1. Voice note → R2 (`audioKey`) — **always, first, before any STT attempt** (D6).
2. `transcribe(audio)` → OpenAI `gpt-4o-transcribe`, language hint from `Contractor.language`.
   → `bodyOriginal`, `bodyLang`.
3. If `bodyLang !== en` → `translate()` via Claude → `body` (EN).
4. Failure at 2 or 3: `JobUpdate` persists with `audioKey` playable, `body = null`,
   `transcriptionError` set, and a **Retry transcription** action on the update. Never blocks.

**Runs after the webhook returns.** Twilio expects a fast `200`; transcription is a multi-second
network call. v1 does this in a fire-and-forget post-response task. If that proves unreliable under
Vercel's function lifecycle, promote to Inngest (already a project dependency) — the interface does
not change.

### Suggestion engine (D3)

One cheap Claude call over the final text classifies `{ progress | completed | blocked | question }`.
`completed` → `suggestion = COMPLETION_LIKELY` → job detail shows *"Contractor may have finished —
mark complete?"* as a one-click dispatcher action.

**It writes `suggestion` and nothing else.** No status mutation, ever. Enforced by the action layer,
not by convention.

---

## 10. Error handling summary

| Failure | Behaviour |
|---|---|
| Twilio send fails | Job stays `OPEN`; `JobDispatch.FAILED` + code; inline dispatcher error |
| Bad webhook signature | `403`, logged, nothing written |
| Unknown sender | Logged, `200`, nothing created |
| Twilio webhook retry | Deduped on `providerSid` unique index |
| Media fetch fails | `JobUpdate` created noting the failure; retry action available |
| STT / translation fails | Update persists with playable audio + `transcriptionError` |
| Two contractors accept | Both recorded; collision flagged; first accept wins |
| Empty template variable | Caught pre-send by `template-vars.ts` guard + unit test |
| `roomLabel` null | Fallback string substituted (§6) |

---

## 11. Deliberately deferred

| Item | Why | Where it lands |
|---|---|---|
| Auto-escalation timer | Needs durable timers, idempotency, race guards. Ladder is 2 deep (D4) | Flip when roster deepens |
| Timeout **detection** | **Not deferred** — computed in-page from `JobDispatch.sentAt`. "No response, 11 min" surfaced loudly. **No cron needed** — a benefit of D4 |
| Broadcast-to-pool on urgent | Inverts contracted-first, which exists for contractual reasons | — |
| ETA capture | Multiplies templates awaiting Meta approval | Post-pilot |
| Dispatcher WhatsApp chat | Makes this an inbox | II.3 email desk |
| Daily schedule agenda message | Kyle's idea, good one. Needs T6 + a second template; changes dispatch from event- to digest-driven | T6 follow-on |
| SMS fallback | Pending §14 | `lib/messaging/` seam |

---

## 12. Environment variables

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM          # sandbox number → approved sender at cutover
TWILIO_TEMPLATE_SID_DISPATCH
OPENAI_API_KEY                # STT
ANTHROPIC_API_KEY             # translation + suggestion (Top-8 blocker F1)
JOB_LINK_SECRET               # dedicated, NOT AUTH_SECRET (D11)
```

---

## 13. Testing

**Pure unit tests (Vitest), mirroring `lib/contractors.ts`:**

- `contractor-match.ts` — property + trade filter, `active`/`onCall`, contracted-first ordering, empty result
- `template-vars.ts` — **empty-variable guard**, null `roomLabel` fallback, truncation at 220, newline/tab stripping, urgency prefix, ES/EN
- `attribution.ts` — all four ranks, zero-candidate and multi-candidate → `null`, explicit-code parsing
- `job-links.ts` — mint/verify round trip, tampered token, expiry, job-close invalidation
- Sender E.164 normalization — the `+1 407 …` / `(407) …` / `4075551234` collapse

**Mocked:** Twilio client, OpenAI, Claude. No network in unit tests.

**Manual (Sandbox):** full round trip — dispatch → Accept → text → photo → Spanish voice note →
transcript + translation → suggestion → dispatcher marks complete. Plus a deliberate
two-open-jobs case to confirm it parks rather than misfiles.

---

## 14. Open items

| # | Item | Owner | Blocks |
|---|---|---|---|
| O1 | **Is the A2P 10DLC / SMS registration deliberate?** Recommendation: **no** — WhatsApp-only per the 2026-07-08 decision. If deliberate, `lib/messaging/` takes a second transport, a second consent scope, and STOP-keyword handling | Kyle | Nothing — spec assumes WhatsApp-only |
| O2 | WhatsApp sender registration not started (§3) | Kyle | Production sending |
| O3 | Privacy policy lacks the required Twilio disclosures (§3.3). Claude can draft; someone must publish | Kyle | Registration review |
| O4 | prod/dev DB split | Kyle | Real contractor PII, go-live |
| O5 | Gerardo's emergency-classification rule still pending | Gerardo | Nothing — `urgent` stays a manual toggle |
| O6 | T6 separable-scheduling assumption unconfirmed | Crystal | Attribution rank 2 only |
| O7 | D9 reverses a recorded magic-link decision — **record as an ADR** | Kyle | — |

---

## 15. Definition of done

- Migration applies clean; `prisma generate` green.
- T3 ranking + template-var guard + attribution resolver unit-tested; full suite green; types + lint clean; build succeeds.
- Dispatch from `/dispatch/[id]` sends via Sandbox; `JobDispatch` row written; failure surfaced inline, job left `OPEN`.
- Accept and Decline both round-trip and update `JobDispatch`; decline does **not** auto-advance.
- Inbound text, photo, and Spanish voice note all append; audio playable; transcript + EN translation stored; `COMPLETION_LIKELY` offers a one-click status change that requires the click.
- Two-open-jobs case **parks** the update in the attribution tray; dispatcher can attach and re-attach, both audit-logged.
- Webhook rejects a bad signature and no-ops a duplicate `providerSid`.
- Inbound photos visibly marked location-unverified.
- **Not deployed.** Deploy is a separate call, gated on O2 + O4.
