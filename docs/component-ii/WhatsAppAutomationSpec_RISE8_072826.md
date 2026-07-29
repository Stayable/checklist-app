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

## 7. Plan — **vendor first, app second** (Kyle 2026-07-29)

**Priority set by Kyle: get Twilio talking to WhatsApp Business FIRST, then connect the app.** This replaces the earlier sandbox-first ordering. The consequence is honest and worth stating: nothing arrives in the app until Phase 1 clears, and Phase 1 contains **two separate Meta approvals** that are outside our control.

### Phase 1 — Twilio ↔ WhatsApp Business (🧑 Kyle) · **the whole critical path**

Do these in order; each one gates the next.

| # | Step | Where | Notes |
|---|---|---|---|
| 1.1 | Create the Twilio account | twilio.com | Minutes. Upgrade off trial before production sending |
| 1.2 | **Buy a phone number** | Console → Phone Numbers → Buy a number | Must be able to receive an SMS/voice verification code. **Must NOT already be on consumer WhatsApp** — if it ever was, delete the WhatsApp account on it first, or it cannot be registered |
| 1.3 | Create / connect a **Meta Business Portfolio** | business.facebook.com | **Owned by Kate** — step-by-step guide at `docs/component-ii/MetaBusinessPortfolioSetup_RISE8_072926.md`. Two decisions live there: which legal entity gets verified, and the display name contractors will see |
| 1.4 | **Register the WhatsApp sender** | Console → Messaging → Senders → WhatsApp senders → New | Twilio's embedded signup creates/links the WABA and registers the number |
| 1.5 | **Display name approval** ⚠ | Part of 1.4, decided by Meta | The name contractors will see. Must relate to the business ("Stayable", "Stayable Maintenance"). **Meta reviews and can reject it** — this is the step people don't expect |
| 1.6 | **Meta Business Verification** ⚠ | Meta Business Manager | **Kate** — same guide as 1.3, steps 5–6. Document-based: business registration, address, and a domain verified by DNS TXT. **Days to weeks.** Required to lift messaging limits and to send at all in some configurations |
| 1.7 | Confirm the sender is live | Console → Senders shows the number as active | End of Phase 1 |

**Two approvals, not one.** 1.5 (display name) and 1.6 (business verification) are independent Meta reviews. Either can bounce and ask for more evidence. **Have ready before starting:** business registration document, the business address, the RISE8 domain, and the exact display name you want.

**New senders start rate-limited** (a capped number of unique recipients per 24 h, which rises with quality rating). Irrelevant for four contractors; it would matter if this ever expanded to guests.

### Phase 2 — Templates (🧑 Kyle + me) · needs Phase 1

| # | Step | Notes |
|---|---|---|
| 2.1 | Build T-1…T-4 in Twilio's Content Template Builder, **EN + ES** = 8 templates | Text from §4.2. Category **UTILITY** — do not let them be filed as MARKETING |
| 2.2 | Submit for WhatsApp approval | Meta decides. Usually fast once the sender is live, but it is still a review |
| 2.3 | Record the approved `ContentSid` for each | These are what the app sends; they go in `lib/whatsapp/templates.ts` |

### Phase 3 — Connect the app (me) · needs 1.7, and 2.3 for live sends

| # | Step | Est. |
|---|---|---|
| 3.1 | `NotificationChannel` += `WHATSAPP`; `Contractor.whatsappOptInAt`; `ContractorJob.whatsappMessageId` (one additive migration) | small |
| 3.2 | `lib/whatsapp/client.server.ts` + `templates.ts` — Twilio Messages API, never throws, config-gated | ~1 session |
| 3.3 | `lib/whatsapp/deliver.server.ts` — the sweep, cloned from `teams-deliver.server.ts` (claim-before-send, settle SENT/FAILED) | small |
| 3.4 | `app/api/webhooks/whatsapp/route.ts` — inbound + status callbacks, `X-Twilio-Signature` validated via the SDK, fail-closed in production | ~1 session |
| 3.5 | Contractor opt-in capture in `/contractors` | small |
| 3.6 | Wire **T-1 job dispatched** as the first live event, from `/dispatch/[id]` | small |
| 3.7 | `SENT → DELIVERED` from status callbacks | small |
| 3.8 | Escalation ladder (T-4) | later |
| 3.9 | **T-2 schedule assigned** — Kyle's original example | **blocked on D6 scheduling existing at all** |

### What I need from you at the Phase 2→3 handover
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (as `whatsapp:+1…`) **set in Vercel Production — not pasted into chat**, plus the approved template SIDs. The auth token is a full-account credential: it can send messages and spend money, so it is treated like `AUTH_SECRET`.

### The trade-off this ordering accepts
Building against the **Sandbox** (still available, Console → Messaging → Try it out) would let Phase 3 be written and tested against real WhatsApp *during* Phase 1's approval waits, then go live with an env-var swap. Kyle's ordering is vendor-first, so Phase 3 simply starts later. If Phase 1 stalls on a Meta review, say so and I will start Phase 3 against the sandbox rather than sit idle — the code is identical either way.

## 8. Definition of done

- A job dispatched in the app produces a WhatsApp message the contractor receives, with no human pressing send
- A contractor reply lands on the job in the app within a minute
- Every attempt has a `NotificationLog` row that honestly reflects what happened, including failures
- No credential in the repo; unset creds degrade silently rather than erroring
- Pure layers (templates, inbound classification, phone normalisation) unit-tested; the client and sweep exercised against fixtures
