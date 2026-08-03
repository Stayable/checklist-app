# Archived tracker — Tracks C, D and E

**Lifted verbatim out of `TODO.md` on 2026-08-03** when scope narrowed to
Checklist (A) + Network (B). See `README.md` in this directory for why, what
code was deleted, and how to recover it. **This is reference, not a backlog.**

State as of the last edit before archiving. Cross-references to `§Q` and
`§SPEC` point at the live tracker, where the C/D/E entries no longer exist —
the ones that mattered are reproduced at the bottom of this file.

---

# TRACK C — Maintenance / Ticketing · P1 · 🔴 NOT STARTED

Replaces the Smartsheet maintenance tracker **and** Zoho Desk. Intake → AI triage → human review → ticket vs. concern → work order → dispatch → close. Docs in `docs/component-ii/`. **No AI decides alone** — human review precedes every ticket.

**Intake reality (corrected 2026-07-08):** tenant requests arrive via **TurboTenant + Jotform**, consolidated in Smartsheet today. **Property managers** own triage/assignment/daily scheduling. The `admin@`/`blake@` email desk is an *additional* lane (maintenance emails get missed today), not the whole intake.

## C0 — Decide + spec ▶ **build is blocked until this closes** · P0

| Pri | Status | Item |
|---|---|---|
| P0 | [~] | **Design decided by Kyle + Kate** (Kate reconciled Part 1 already). Crystal remains the source of ops ground truth, not an approval gate | §Q6 |
| P0 | [ ] | **Draft the PM-facing intake brief** — recipient still undecided (§Q15) |
| P0 | [!] | Answer the **Top-8 blockers** in `docs/component-ii/MaintenanceTicketingScopingQuestions_RISE8_070726.md` | §Q6 |
| P0 | [ ] | Turn signed-off answers into a design spec → plan → build (**§SPEC-4**) |

## C1–C5 — Sequence once the gate clears (all `[ ]`, all need C0)

| Phase | Pri | What |
|---|---|---|
| C1 | P1 | **Unified `Ticket` model** + lifecycle (OPEN→TRIAGED→ASSIGNED→IN_PROGRESS→(BLOCKED)→RESOLVED→CLOSED) · ticket vs. **concern** (payments/refunds/extensions) · **migrate + retire the existing `/issues`** (recommended, pending §A2/A3 sign-off) · recurrence auto-flag (≥2× same room in 60 days) · SLA reuse |
| C2 | P1 | Tenant intake: TurboTenant + Jotform → queue; manual create |
| C3 | P1 | Email desk: MS Graph on `admin@` + `blake@` → sender filter → **Claude (Sonnet 5)** extraction/classification → human review queue → reply-as-`blake@` |
| C4 | P2 | Outlook sync (which emails became tickets/concerns/answered) + concerns view w/ promote-to-ticket |
| C5 | P2 | Cost-per-repair capture + maintenance reporting |

⚠️ **Port risk:** `MAINTENANCE_DESK_SPEC.md` marks `lib/maintenance/{filter,triage,graph,db}.js` + the sender-filter catalog as `[BUILT]`, but **they live outside this repo** and must be ported or rebuilt. The spec also names a model ID that doesn't exist (`claude-sonnet-4-6`) → use Sonnet 5.

---

# TRACK D — Contractor Dispatch + WhatsApp + Scheduling · P1 · 🟡 IN PROGRESS

Fastest, most independent slice: get emergencies to the right contractor fast. A module inside the platform, not a separate app. **Contractors use WhatsApp only** (phone is the emergency first touch to the one contracted plumber). Dispatchers reuse the `MANAGER` role — no new role.

**Ground truth:** Crystal/Shayla flag an emergency on Teams → Gerardo/Jesús reach contractors by WhatsApp. Contracted first: **Orlando Torres** (direct hire, plumbing). Common emergencies are plumbing + electrical. **Jesús Pérez is both the scheduler and an electrical contractor** — the data model already allows one person to be both.

| Phase | Pri | Status | What |
|---|---|---|---|
| D1 | P1 | [x] | **T1 — Contractor directory.** `Contractor` + `ContractorProperty` + `Trade`, `Contractor.userId` unique link to `User`, `/contractors` CRUD (property-scoped, audited), `lib/contractors.ts` + tests. **Merged to main 2026-07-28; migration NOT yet on prod** |
| D2 | P1 | [x] | **T2 — Contractor job record — DONE 2026-07-28** (`dafbaf1`). `ContractorJob` + `JobStatus` + third photo owner on `Photo`; `/dispatch` queue (urgent-first, URL filters) + `/dispatch/new` + `/dispatch/[id]`; photos reuse the R2 pipeline unchanged; nav gains Dispatch. Terminal jobs immutable; COMPLETED/CANCELLED need a note; DISPATCHED needs a contractor. **Migration `20260728120000` NOT yet on prod** |
| D3 | P1 | [x] | **T3 — Match & rank — DONE 2026-07-28** (`dafbaf1`, shipped with D2 since both need the same eligibility predicate). `canAssignContractor` + `rankContractorsForJob` in `lib/contractor-jobs.ts`, 37 tests. Eligible = active ∧ has trade ∧ covers property; **`onCall` ranks but never excludes** (a hard availability filter could leave a property with nobody eligible mid-emergency). Order: contracted → on-call → reachable → name (stable). Re-validated server-side in `assignContractor` — the action doesn't trust the UI |
| D4 | P1 | [x] | **T4 — One-tap dispatch — DONE 2026-07-28.** Pre-filled bilingual `wa.me` deep link (language from `Contractor.language`) + `tel:` first touch + copy-link, on `/dispatch/[id]`. **Signed no-account job link** `/j/[token]` (72h, HMAC, key **derived** from `AUTH_SECRET` for domain separation rather than reusing it raw) renders property/address/Maps link/problem/photos read-only. **Deviation from Phase 9: the link is reusable, not single-use** — it is read-only, and a contractor re-opening it while standing in the room is normal; single-use would break it exactly when needed. A write path (A10 contractor checklists) still gets single-use consumption. Human presses send; nothing auto-sends |
| D5 | P1 | [ ] | **Emergency flag + fast alert** to the coordination group. MVP = manual URGENT toggle | §Q4 |
| D6 | P2 | [ ] | **Scheduling: contractor calendar** + auto-reschedule of jobs bumped by an emergency. **§SPEC-5** — and §Q16 must be answered first |
| D8 | P1 | [~] | **Account creation + messaging consent (Spec B)** — `docs/superpowers/specs/2026-07-29-account-creation-and-consent-design.md`. **Builds BEFORE D7 Phase 3: without a consent artifact there is nothing legitimising a send.** BUILT (branch-local, migration NOT on prod): `InviteToken` + append-only `ConsentRecord` (verbatim text, policy version, phone, locale, IP, UA; revocation = new row) · `lib/consent-copy.ts` (EN/ES, `POLICY_VERSION 2026-07-29.1`, test-pinned) · `lib/consent.ts hasLiveConsent` (the send-time hard stop) · `/invite/[token]` bilingual opt-in, box unchecked and **non-blocking** · public `/legal/messaging` · admin "Send invite" + "Send consent invite" · consent state on `/contractors` · **`/legal/opt-in` public screenshotable proof replica (2026-07-30, `509be11`)** sharing `ConsentBlock` with the real form so the evidence cannot drift. 532/532 tests, clean types+lint, build 48 routes | §Q27 |
| D7 | P2 | [~] | **L2 — Automated WhatsApp via Twilio.** Spec: `docs/component-ii/WhatsAppAutomationSpec_RISE8_072826.md` (§SPEC-7), **re-planned 2026-07-29 as vendor-first per Kyle**. **Phase 1 (🧑 Kyle, the critical path):** Twilio account → buy a number (must not already be on consumer WhatsApp) → Meta Business Portfolio → register WhatsApp sender → **display-name approval** → **Meta Business Verification**. ⚠ **Two independent Meta approvals**, either can bounce; have the business registration, address, domain and exact display name ready. **Phase 2:** 8 UTILITY templates (T-1…T-4 × EN/ES) → approval → record ContentSids. **Phase 3 (me):** `NotificationChannel += WHATSAPP`, Twilio client, delivery sweep cloned from the working Teams pattern, signature-validated inbound + status webhook, opt-in capture, then wire T-1. T-2 *schedule assigned* — Kyle's original ask — additionally needs **D6 scheduling to exist**. Sandbox fallback available if a Meta review stalls | §Q17 |

---

# TRACK E — Construction Progress / Scheduling · P3 · ⛔ NOT DECIDED

Brief: `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`. Shares the ingestion engine with Track C. **No build until Kyle+Kate say go.**

| Phase | Pri | Status | What |
|---|---|---|---|
| E0 | P0 | [ ] | **Go / no-go** — a Kyle+Kate call informed by Crystal's ops input (design-review §2.3). ⚠ Record as an ADR when it closes | §Q18 |
| E1 | P1 | [ ] | Progress % / milestones per project; punch-list tracking |
| E2 | P1 | [ ] | Project/task scheduling; blocker & delay alerts |
| E3 | P2 | [ ] | Draw / billing documentation (photo-verified progress) |

---
---

# Archived §Q rows (C/D/E only)

Reproduced verbatim; removed from the live tracker. Owners were never chased once scope narrowed.

| # | Question | Blocks | Note |
|---|---|---|---|
| **Q6** | Track C ops reality + the Top-8 technical blockers (issues→Ticketing, Graph consent, DB split) | Quality of the C1 spec | Kate reconciled Part 1; the technical blockers are Kyle's to settle |
| **Q15** | **Who receives the PM-facing intake brief?** | C0 | Brief can be drafted recipient-agnostic and held |
| **Q16** | **Is contractor scheduling separable** from the internal daily maintenance schedule (in Connecteam, which Track A replaces)? | D6 | Assume separable and build D6 as the permanent home for contractor scheduling. If entangled, D6 must either coexist with Connecteam during parallel run or absorb internal scheduling too |
| **Q17** | WhatsApp Business API cost + Meta verification timeline | D7 | Not "which channel" — WhatsApp is settled. Cost call is Kyle+Kate |
| **Q18** | Construction ops input (scope: renovation contractors vs. in-house vs. both, #1 pain) | Quality of the E0 decision | The go/no-go itself is Kyle+Kate |
| **Q23** | **Who classifies an issue as an emergency, and how?** | Gerardo | D5 auto-notify rule (MVP uses a manual toggle) |
| **Q27** | **Does the live Twilio A2P submission say consent is REQUIRED to submit the form?** Spec §5's requirement table says *"submit blocked until ticked"*; §5.1 reversed that on non-coercion grounds and **the shipped form does not block**. If an earlier submission described the old behaviour, the form and its description no longer match | The A2P campaign — a described-vs-actual mismatch is a rejection reason | Correct the submission to match the built form. Ready-to-paste opt-in description is in §8 of `PrivacyPolicyMessagingAmendment_RISE8_073026.md`. Also amend spec §5's table so the next reader isn't misled by it |

# Archived §SPEC rows (C/D only)

| # | Item | Why it needed a spec first |
|---|---|---|
| **SPEC-4** | **C1 unified ticket model** | The big one. It absorbs `/issues`, spans 4 intake channels, and has to model ticket-vs-concern. Getting this wrong means migrating live maintenance data twice. **Blocked on C0 answers** |
| **SPEC-5** | **D6 contractor scheduling** | Depends entirely on §Q16. A shared calendar and a contractor-only calendar are different data models |
| **SPEC-7** | **D7 automated WhatsApp** | ✅ **Written 2026-07-28** — `docs/component-ii/WhatsAppAutomationSpec_RISE8_072826.md`. Covers the wa.me-vs-Cloud-API distinction, Meta prerequisites, the 4 UTILITY templates, the 24-hour window rule, schema delta, and why staff stay off WhatsApp |

⚠ `SPEC-7` cites `docs/component-ii/WhatsAppAutomationSpec_RISE8_072826.md` —
that file now lives beside this one at `component-ii/WhatsAppAutomationSpec_RISE8_072826.md`.
