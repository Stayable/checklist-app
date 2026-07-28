# WhatsApp Automation — Design Spec (§SPEC-7 / Track D7)

**Date:** 2026-07-28
**Track:** D — Contractor Dispatch (Component II, ADR-025)
**Asked for by:** Kyle, 2026-07-28 — *"can the app/cron send an auto-message to WhatsApp depending on the need? e.g. someone creates a schedule, the assigned person on WhatsApp receives it"*
**Status:** Spec only. **Not started.**
**Revised 2026-07-29 (Kyle):** route via **Twilio** as the BSP rather than calling Meta's Cloud API directly. This changes the vendor, the number sourcing, and — importantly — **lets us build and test the whole pipeline before Meta verification completes** (§4.0). It does not change any Meta *policy* requirement.
**Depends on:** D2 contractor job ✅ · D4 human-send dispatch ✅ · D6 scheduling (not built)

---

## 1. The distinction that governs everything

| | Mechanism | Human presses send? | Meta approval? | Cost | State |
|---|---|---|---|---|---|
| **D4 (built)** | `wa.me` deep link | **Yes** | None | Free | ✅ Live |
| **D7 (this spec)** | WhatsApp Business Platform **via Twilio** | **No** | **Required** | Per message (Twilio + Meta) | Not started |

A `wa.me` link **cannot** send by itself — that is a deliberate property of the consumer surface, not a limitation to engineer around. Automated outbound requires the WhatsApp Business Platform. There is no third path.

## 2. What is already true (so this spec is smaller than it looks)

The delivery architecture is **already built and proven in production** — it was built for Teams on 2026-07-27 and is running now:

- `NotificationLog` with `PENDING → SENT / FAILED / SKIPPED`, indexed on `[channel, status]`
- Queue a `PENDING` row **inside** the originating transaction; deliver **post-commit** from the 1-minute Vercel Cron (`lib/network/teams-deliver.server.ts`)
- Rows are **claimed before sending** so overlapping cron ticks cannot double-send
- Never call a third-party API from inside a DB transaction (it holds the transaction open across a network round trip, and a rollback cannot unsend a message)

Also already present: `Contractor.whatsapp` (E.164), `Contractor.language` (`en` | `es`), `lib/dispatch-message.ts` (tested bilingual message builder), `lib/job-link.ts` (signed 72h no-account job links), and an HMAC webhook pattern with capture-before-trust.

**So D7 is: a vendor account, approved templates, a client, and one delivery sweep.** Not a new architecture.

## 3. Scope

### 3.1 In scope — business-initiated (needs templates)
1. **Job dispatched** → contractor: property, room, trade, problem, job link
2. **Schedule assigned / changed** → contractor: the case Kyle asked for; depends on D6
3. **Reminder** → contractor, N hours before a scheduled job
4. **Escalation** → next contractor in the ranked list when the first hasn't accepted within N minutes (the D7 ladder)

### 3.2 In scope — inbound + auto-reply (no template needed)
5. **Contractor replies** → webhook → append to the job, and if the reply matches an accept/decline pattern, advance status
6. Free-form replies are allowed for **24 hours** after the contractor's last inbound message (the customer-service window). This is why auto-**reply** is easy and auto-**message** is not.

### 3.3 Explicitly OUT of scope
- **Internal staff notifications over WhatsApp.** HK/PA/MT are app users: in-app + push + email costs nothing, needs no Meta approval, and is already partly built. Messaging employees is *still* business-initiated under Meta policy, so WhatsApp buys nothing here except cost and approval risk. **Contractors → WhatsApp; staff → in-app/push.**
- Guest/tenant WhatsApp intake — that is Track C (II.6), a different queue and a different consent story.
- Voice notes, media receipt from contractors (v2).

## 4. Vendor: Twilio (decided 2026-07-29)

### 4.0 What Twilio does and does not solve

Twilio is a Meta **Business Solution Provider**. It wraps the same WhatsApp Business Platform, so it changes the *onboarding and plumbing*, never the *policy*.

**What it genuinely solves:**

| Problem | How Twilio helps |
|---|---|
| **We need a dedicated number** not already on consumer WhatsApp | Buy a fresh Twilio number and register it as the WhatsApp sender — the clean answer to the dedicated-line requirement. Nobody surrenders a personal number |
| **We can't test anything until Meta approves** | **The Twilio WhatsApp Sandbox works immediately.** Recipients opt in with a join phrase to a shared Twilio number; we send and receive real WhatsApp messages the same day. The integration can be built and verified while verification is still pending |
| WABA creation is fiddly | Twilio's embedded signup drives the Meta side |
| We only ever learn "accepted", never "delivered" | Twilio posts **status callbacks** (queued → sent → delivered → read). Strictly better than the Teams webhook, where 202 is all we get — we can honestly settle `SENT` → `DELIVERED` |
| Template submission | Twilio Content Templates are submitted to Meta on our behalf |

**What it does NOT remove — do not plan around these disappearing:**
- **Meta Business Verification is still required.** Twilio streamlines it; Meta still verifies RISE8. Twilio cannot approve on Meta's behalf.
- **Templates still need Meta approval.** Twilio submits; Meta decides.
- **The 24-hour customer-service window still applies.** Outside it, template-only. Meta policy, not Twilio's.
- **Opt-in is still required.**
- **Cost is additive:** Twilio's per-message fee **on top of** Meta's. Rates unverified — check both before committing budget.

### 4.1 Account prerequisites (Kyle)
1. **Twilio account + a purchased number** — minutes, not weeks. A US local number is the normal choice. *(Toll-free may carry extra WhatsApp restrictions — verify before buying one.)*
2. **Twilio WhatsApp Sandbox** — usable immediately, no approval. This is what unblocks building.
3. **Meta Business Verification via Twilio's embedded signup** — still document-based, still **days to weeks**, still the long pole for going *live*. It no longer blocks *development*.
4. **Opt-in on record** for every contractor before the first business-initiated message. Verbal agreement is not evidence; capture it in the contractor record (see §6 schema note).

> ⚠️ I could not verify current per-message rates or verification timelines — Meta changes both, and I will not quote numbers I cannot confirm. Both must be checked before committing budget.

### 4.2 Templates (the part that surprises people)
Any message **we** initiate outside the 24-hour window must use a template **approved in advance**. Free text is rejected. Templates are categorised; ours are all **UTILITY** (transactional, tied to an existing relationship) rather than MARKETING — the cheap, readily-approved tier.

Each template needs an EN and an ES version, selected by `Contractor.language`.

**T-1 · `job_dispatched` (UTILITY)**
> `{{1}}` — new job at `{{2}}`, `{{3}}`. Trade: `{{4}}`. Problem: `{{5}}`. Details and photos: `{{6}}`

**T-2 · `schedule_assigned` (UTILITY)** — Kyle's example
> `{{1}}` — you are scheduled for `{{2}}` at `{{3}}` on `{{4}}` at `{{5}}`. Details: `{{6}}`

**T-3 · `job_reminder` (UTILITY)**
> Reminder: `{{1}}` at `{{2}}` is scheduled for `{{3}}`. Details: `{{4}}`

**T-4 · `job_escalation` (UTILITY)**
> Urgent — `{{1}}` at `{{2}}` still needs a contractor. Trade: `{{3}}`. Can you take it? `{{4}}`

Template **text is immutable once approved**; only variables change. Any wording change is a re-approval, so `lib/whatsapp/templates.ts` must be the single source of truth and must never be edited casually. Keep the human-send copy in `lib/dispatch-message.ts` aligned with it so the two channels don't diverge in tone.

## 5. Architecture

```
schedule/job mutation (transaction)
  └─ NotificationLog { channel: WHATSAPP, status: PENDING, target: <e164>, ... }
                                    │  (post-commit)
Vercel Cron (1 min) ────────────────┴─ deliverPendingWhatsApp()
                                         claim row → POST Cloud API → settle SENT/FAILED

Meta ──POST /api/webhooks/whatsapp──► verify X-Hub-Signature-256 (HMAC-SHA256)
                                       capture raw payload BEFORE trusting it
                                       → append reply to job / advance status
```

**Files**
- `lib/whatsapp/templates.ts` — approved template names + variable ordering (pure, tested)
- `lib/whatsapp/client.server.ts` — Twilio Messages API; `From: whatsapp:+…`, `To: whatsapp:+…`; never throws; returns `{ok, messageSid}`
- `lib/whatsapp/deliver.server.ts` — the sweep, modelled on `teams-deliver.server.ts` including claim-before-send
- `app/api/webhooks/whatsapp/route.ts` — inbound messages **and** status callbacks. ⚠ Twilio posts **form-encoded, not JSON**, and signs with **`X-Twilio-Signature` (HMAC-SHA1 over the full URL + sorted params)** — a different scheme from Meta's `X-Hub-Signature-256`, so `lib/network/hmac.ts` does **not** apply. Use the `twilio` SDK's `validateRequest`; hand-rolling this is a classic way to ship a webhook that accepts forged requests.
- `lib/whatsapp/inbound.ts` — pure: map a reply body to `ACCEPT | DECLINE | ETA | OTHER` (never trust a fuzzy match to change state without a human-visible record)

**Schema delta (all additive)**
- `NotificationChannel` += `WHATSAPP`
- `Contractor.whatsappOptInAt DateTime?` — the opt-in evidence Meta policy requires
- `ContractorJob.whatsappMessageId String?` — so an inbound reply can be correlated to the job it answers

**Env**
```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN            # also the webhook-signature key
TWILIO_WHATSAPP_FROM         # "whatsapp:+1..." - sandbox number first, production sender later
```
Sandbox → production is a change of `TWILIO_WHATSAPP_FROM` and the template SIDs. **No code change.** That is the main reason to build against the sandbox first.
Unset ⇒ `configured: false`, rows settle `SKIPPED`, no network call. Same degrade posture as Teams and Spotipo.

**Cron: Vercel, not GitHub Actions.** Vercel Cron already runs every minute, shares the runtime and the database connection, and needs no duplicated secrets or public trigger endpoint. GitHub Actions would add a second secret store and a second thing to keep in sync for zero gain.

## 6. Honest constraints

1. **A 202/200 from the API is not proof of delivery.** Cloud API returns a message id; delivery/read status arrives later via webhook. Until we consume status callbacks, `SENT` means *accepted by Meta* — the same care we took with the Teams webhook.
2. **The 24-hour window is a hard rule.** Outside it, no free text, no exceptions. Any "just send them a quick note" feature request is really a template request.
3. **Auto-advancing a job from a text reply is a guess.** "ok" might mean "on my way" or "got it, will look later". Recommendation: an inbound match **proposes** the status change and records the raw text; a human confirms unless the reply is an exact keyword. Silent state changes from fuzzy parsing will be wrong at the worst moment.
4. **Template approval is a gate on every new message type**, not a one-time cost. Budget approval latency into any future notification.
5. **Alternative vendors** (Twilio, 360dialog, MessageBird) wrap this same Meta API and still require the WABA, verification and template approval. They buy easier onboarding and a test sandbox, not fewer Meta requirements.

## 7. Sequence

| Step | Owner | Blocking? |
|---|---|---|
| 1. Twilio account + buy a number + enable the **Sandbox** | 🧑 Kyle | Minutes. Unblocks everything below |
| 2. `lib/whatsapp/*` + delivery sweep + inbound/status webhook, **tested live against the Sandbox** | me | Needs only step 1 |
| 3. Contractor opt-in capture (UI + `whatsappOptInAt`) | me | No — buildable now |
| 4. Twilio embedded signup → **Meta Business Verification** | 🧑 Kyle | Days–weeks, runs in parallel with 2–3 |
| 5. Submit T-1…T-4 as Content Templates (EN + ES) | me + 🧑 Kyle | After 4 |
| 6. Swap `TWILIO_WHATSAPP_FROM` + template SIDs → live | me | After 5. No code change |
| 7. T-2 `schedule_assigned` | me | **Needs D6 scheduling to exist** |
| 8. Escalation ladder (T-4) | me | After 6 |

**Why the order changed:** previously everything waited on Meta verification. With the Twilio Sandbox, steps 2–3 can be built and *actually tested against real WhatsApp* while verification is pending — so when Meta clears, going live is an env-var change rather than the start of a build.

## 8. Definition of done

- A job dispatched in the app produces a WhatsApp message the contractor receives, with no human pressing send
- A contractor reply lands on the job in the app within a minute
- Every attempt has a `NotificationLog` row that honestly reflects what happened, including failures
- No credential in the repo; unset creds degrade silently rather than erroring
- Pure layers (templates, inbound classification, phone normalisation) unit-tested; the client and sweep exercised against fixtures
