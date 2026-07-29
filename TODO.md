# RISE8 Operations Platform — Master Plan & Tracker

**Reorganized 2026-07-28.** Prior tracker preserved verbatim at `docs/archive/TODO_preReorg_RISE8_072826.md` (706 lines, organized by original build-week phases — kept for history and per-task commit detail).

**How to read this file**
- Work is grouped into **5 tracks (A–E)**. Each track has a priority, a state, and numbered phases.
- Phases are ordered. **A phase marked ▶ is the recommended entry point for that track.**
- `§Q` items are **open questions** — they live in one place (§Q) so nothing is answered twice or lost.
- `§SPEC` lists work that is **too vague to build** and needs a design pass first. Don't start these from the tracker line alone.

**Legend** — Priority: `P0` blocks go-live · `P1` must-have · `P2` should-have · `P3` nice-to-have
Status: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (blocker named) · `▶` start here

---

## 🎯 START HERE (2026-07-29)

**Everything is pushed and live.** Working tree clean, prod HEAD `5d5c866`.

| # | Action | Why it matters |
|---|---|---|
| 1 | 🧑 **Fix `UNIFI_API_KEY_2` in Vercel** — must be the 9-console key (SHA-256 starts `8bdfc0ae`) | THE blocker. Until then prod shows 12 devices, holds **9 open "monitoring blind" tickets**, and online-now only fills for KW. Once fixed: ~420 devices land across LL/KE/OR/DP/KW on the next 2-min tick and the blind tickets auto-resolve |
| 2 | 🧑 **Add the 7 remaining `STRIPE_SECRET_KEY_<CODE>`** | Revenue currently covers Jacksonville West only |
| 3 | **Build Kate's remaining requests** ▶ | Filters (property · console · device type), date range on the network dashboard, per-property monitoring breakdown, resolved-per-property, **ticket CSV export**. All pure DB work, no vendor dependency |
| 4 | 🧑 **Chase the third UniFi account** | JW + JN still unreachable — see §Q1 |
| 5 | 🧑 **Orlando: 46 of 92 cameras offline right now** | A real operational finding the monitoring surfaced. Independent of any build work |

**Who decides:** **Kyle develops, Kate reviews, both share every decision.** No sign-off chain, no approval gates. **Rob monitors the launched app only and gates nothing** — never add a "pending sign-off" state for anyone but Kyle or Kate. Crystal, Gerardo, Karla and Christopher supply ops ground truth or content: inputs, never approvals.

**⚠️ Schedule reality:** original cutover was Week 14 ≈ **21 Aug 2026**. A6 (content + geofences), A7, A8 and A11 are all outstanding and the 4-week parallel run has not started. **Week-14 cutover is not reachable.** A re-baselined date is owed (§Q7).

## 🗺️ Track map

| Track | Scope | Pri | State | Next phase |
|---|---|---|---|---|
| **A** | **Checklist App (StayCheck)** — the Connecteam replacement | **P0** | 🟢 Live in prod, ~60% of v1 | A6 (real content + geofences) |
| **B** | **Network Monitoring & IT Ticketing** | P1 | 🟢 Live · **5 of 8 properties registered** (420 devices) · lifecycle proven in prod | B3 hardening + Kate's filters |
| **C** | **Maintenance / Ticketing** (tenant + email desk) | P1 | 🔴 Nothing built, needs a spec | C0 (decide + spec) |
| **D** | **Contractor Dispatch + WhatsApp + Scheduling** | P1 | 🟢 **Live: directory + jobs + match/rank + one-tap WhatsApp/call + signed job link.** Cannot message anyone until real contractor numbers are entered | D5 emergency alert · D6 scheduling (§Q16) · D7 Twilio |
| **E** | **Construction Progress / Scheduling** | P3 | ⛔ Concept, not decided | E0 (go / no-go) |

Tracks share one codebase and one deploy (ADR-025) and reuse each other's infrastructure: auth, RBAC, audit log, notifications, R2 photo pipeline, SLA, geofence.

---

# TRACK A — Checklist App (StayCheck) · P0 · 🟢 LIVE

Live at **https://ops.rentstayable.com**. Prod DB is its own Neon project (`ep-summer-cloud`); Preview + local still share the old dev DB.

## A1–A5 — Shipped and live ✅

Condensed; per-task detail and commit hashes are in the archived tracker.

| Phase | What shipped |
|---|---|
| A1 Foundations | Next 15 + Vercel + Neon + Prisma + R2 + Resend + Sentry scaffold · PWA shell + install page · i18n EN/ES (`next-intl`) · ET datetime helper (ADR-013) · prod/dev DB split |
| A2 Auth & admin | Password + **email OTP w/ 30-day trusted device** (ADR-019, security-reviewed twice) · lockout 5/15/30 · RBAC (`lib/rbac.ts`, tested) · admin users CRUD + reset + set-password · `/profile` self-service · SLA editor · property picker |
| A3 Authoring & filling | Template builder w/ property scoping (ADR-020) · manual create · all 11 question types · conditional logic · **photos → R2 w/ GPS + server-computed geofence** (ADR-015) · signatures · IndexedDB drafts · mark-opened/resume · capture timestamps |
| A4 Review & issues | Review queue + three-column detail (ADR-011) · approve/flag/re-do · **auto-Issue from PASSFAIL fail** · issues list/detail + assignment + SLA · resolution photos (ADR-016) · **S1: verify+lock, admin unlock, completion check, checkout flags, notify toggle, free-text room** |
| A5 Recurrence & reporting | Recurrence engine (17 tests) + `/rules` + **5 AM ET cron (enabled)** · `/completed` w/ pagination · `/dashboard` (6 tiles) · `/reports/completeness` + `/reports/issues` · 3 PDF endpoints · Resend emails on 4 events |

## A6 — Real-world readiness ▶ **P0 — this is the true blocker set**

Everything here is *content and configuration*, not code. **The app cannot be used for real work until these are done**, and none of them are things I can do alone.

| Pri | Status | Item | Owner | Note |
|---|---|---|---|---|
| P0 | [!] | **Real checklist question content** for all 9 templates | Karla / Christopher | All 40 seeded questions are **PLACEHOLDER**. Hard blocker for training and cutover. Guide exists: `docs/component-i/ChecklistTeamInterviewGuide_RISE8_060526.md` |
| P0 | [!] | **Geofence polygons for 8 properties** | Kate | Until these exist every photo is stored `UNVERIFIED` — the verification feature is inert. See §Q9 |
| P0 | [ ] | Geofence polygon editor (Leaflet draw + save) | — | Code; needed to enter the polygons |
| P0 | [ ] | Backfill `UNVERIFIED` photos once polygons land (reuse `lib/geofence.ts`) | — | One-off job |
| P0 | [!] | **Recurring-rules matrix** — which template recurs how often at which property | Property Managers | `/rules` is built and empty. The 5 AM cron runs and generates nothing until rules exist |
| P1 | [ ] | Confirm SLA hours per priority (placeholders 4/24/72/168h live) | Christopher | Admin-editable, so non-blocking |

## A7 — Feature-complete gaps · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | Field-staff home dashboard (beyond today's list) |
| P1 | [ ] | Corporate portfolio dashboard (comparison, top issues, scorecards) |
| P1 | [ ] | Issues dashboard (open / SLA breach / repeats) |
| P1 | [ ] | In-app notification centre + unread badge (`IN_APP` rows are already being written, PENDING) |
| P1 | [ ] | Bulk create UI (template + property + date range + room list) |
| P1 | [ ] | **Invalidation flow (ADR-014)** — field requests w/ note → manager/admin approves; schema fields already exist |
| P1 | [ ] | 7:00 AM ET daily PM email digest (PRD §8) |
| P2 | [ ] | Custom report builder + CSV export |
| P2 | [ ] | Submit → manager email (net-new, not a `SKIPPED` flip) · activation-email flow · unassigned-queue digest |

## A8 — UX, brand, accessibility · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [!] | **Stayable/StayCheck branding kit** — logo, palette, wordmark | Kate (§Q10) |
| P1 | [ ] | Phase-7 design pass: visual system, then field → manager → admin screens |
| P1 | [ ] | Empty / error / loading / offline states for every screen |
| P1 | [ ] | Accessibility pass (keyboard, contrast, screen-reader basics) |
| P1 | [ ] | **Daily Teams digest (ADR-010)** — 7 AM ET, 1 corporate + 8 property channels. See §Q11 (channel inventory) and note the Graph-vs-webhook question in §Q5 |
| P2 | [ ] | Lock the visual system into Tailwind + shadcn theme |
| P2 | [ ] | Adobe Urbane Rounded authorization (Nunito is the stand-in) |

## A9 — StayCheck v1.1 remaining (S2–S9) · P2 · **needs specs, see §SPEC**

| Phase | Status | What | Note |
|---|---|---|---|
| S2 | [ ] | Room lifecycle (9 states) + **Room Status Board** + **Checkout Queue** + OOO wiring | §SPEC-1 |
| S3 | [!] | Cloudbeds sync adapter (ADR-022) | Blocked: per-property API keys (§Q12) |
| S4 | [ ] | Preventive maintenance: `Asset` registry, interval-from-last-completion, `CONDITION` type, PM compliance | §SPEC-2 |
| S5 | [ ] | Staff performance: Quality Score, completion rate, leaderboard, outliers | §SPEC-3 |
| S6 | [ ] | Insights engine: recurring issues, failure patterns, timing anomalies | §SPEC-3 |
| S8 | [ ] | Report suite, Smartsheet-parity CSV export, before/after compare, per-room photo gallery |
| S9 | [ ] | Full offline sync + conflict notice · push notifications · template version snapshots · starter library |

## A10 — Deferred v1 modules (ADR-012) · P2

| Pri | Status | Item |
|---|---|---|
| P2 | [ ] | **Contractor checklists** — magic-link (signed, single-use, 72h), CONTRACTOR-audience templates, contractor review lane. **Note: D4 pulls the magic-link forward — build it once, here or there, not twice** |
| P2 | [ ] | **Quick Tasks** — lightweight ad-hoc tasks, no recurrence/review/PDF |
| P2 | [!] | Final CONTRACTOR template list | Kate (§Q13) |

## A11 — Launch · P0 (last)

| Pri | Status | Item |
|---|---|---|
| P0 | [!] | **Spanish translation review + sign-off** before field training (ADR-014) | Reviewer unnamed — §Q14 |
| P0 | [ ] | Provision real staff accounts; activation emails |
| P0 | [ ] | Training per property (1 hr, recorded) + manager training (1.5 hr) |
| P0 | [ ] | Quick-reference card (PDF + printed) |
| P0 | [ ] | Prod DB seeded with real users, templates, rules |
| P0 | [ ] | 4-week parallel run vs Connecteam + daily parity monitoring |
| P0 | [ ] | Cutover: Connecteam → read-only, Karla stops manual uploads, Smartsheet archived |
| P0 | [ ] | Rotate temp admin password before real staff onboard |

---

# TRACK B — Network Monitoring & IT Ticketing · P1 · 🟢 LIVE PILOT

Live for **Kissimmee West only** (12 devices: 9 switches, 2 APs, 1 gateway). ADR-026. Docs in `docs/network/`.

## B1 — Built and deployed ✅

Schema (6 tables, 7 enums, `NETWORK_TECH` role) · pure helpers (event mapping, ticket numbering, mass-outage window) · HMAC webhook receivers · 1-min timer cron (5-min auto-ticket, recovery-close) · mass-outage clustering (120s → 1 ticket, advisory lock, 10-min split, cascade close) · `/network` (7 pages) · **T11 UniFi poller** (2-min cron, pull-based, N2/N3/N4 enforced) · Teams webhook delivery (queued in-transaction, delivered post-commit).

## B2 — Prove it and widen it ▶ P1

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | **Lifecycle PROVEN IN PRODUCTION 2026-07-28** — no unplug test needed, it fired on real events: 6 tickets, all auto-resolved. 4 standard (switch offline → 5-min timer → ticket → recovery → close, `downDurationMin` 6) + **2 monitoring-blind** (SS-KISSWEST console dropped its cloud link twice and self-cleared). Teams delivery confirmed: TKT-006 create + resolve both `SENT` |
| P1 | [~] | **5 of 8 properties now registered** (2026-07-29, `d720313`): KW, LL, KE, OR, DP — 420 devices (319 CAMERA, 55 AP, 37 SWITCH, 5 NVR, 4 GATEWAY), classifier verified against the real fleet. **Still unreachable by any key: Jacksonville West + Jacksonville North**, plus a live St. Augustine console | §Q1 |
| P1 | [x] | **9 consoles registered** across LL/KE/OR/DP (`d720313`). Two corrections the evidence forced: **host ids are ACCOUNT-SCOPED** (same Orlando console yields two ids sharing a MAC prefix), and the four excluded entries are **stale account views, not decommissioned hardware** — Orlando reports disconnected via one account and connected via the other |
| P1 | [ ] | 🧑 **Vercel `UNIFI_API_KEY_2` is the WRONG key** — prod therefore holds 9 open monitoring-blind tickets and 12 devices. Needs the key with SHA-256 `8bdfc0ae…` |
| P2 | [ ] | Registry admin UI (promote the code constant to a `UnifiHost` table) — only needed when a non-developer must edit it |
| P2 | [ ] | Verify Protect **camera-level** status (8 NVRs exist; none visible to this key yet) |

## B2b — Kate's review requests (2026-07-28/29) ▶ **next build** · P1

All pure DB work — no vendor dependency, no credentials needed.

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | "Resolved (30d)" tile + "Recently resolved & closed" table on `/network` (`de420bb`, `1adce30`) |
| P1 | [x] | Revenue per property on the WiFi page (`5d5c866`) |
| P1 | [x] | Date range for revenue (`5d5c866`). ⚠ Guest counts **cannot** be date-filtered — Spotipo ignores date params entirely |
| P1 | [ ] | **Filters: property · console · device type** — Kyle's call: separate filters, not console-name-only (`SS-ORLANDO` exists twice; `Lakeland` vs `Lakeland-NVR` means nothing to a manager) |
| P1 | [ ] | **Date range on the network dashboard** (tickets/resolved), distinct from the WiFi revenue range |
| P1 | [ ] | **Overall + per-property monitoring breakdown** on the dashboard |
| P1 | [ ] | **Resolved count per property** |
| P1 | [ ] | **Export tickets list (CSV)** |
| P2 | [ ] | Kate: AP counts look too low — investigated, see §Q2. Likely non-UniFi APs, not a reporting defect |

## B3 — Hardening before webhooks are public · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | **Webhook write-amplification guard** (body-size cap + rate limit). `RawWebhookPayload` is written *before* signature checking, so an unauthenticated POST already writes a row — demonstrated 2026-07-27 |
| P1 | [ ] | Cron job-claim `FOR UPDATE SKIP LOCKED` |
| P2 | [ ] | Brand-new-cluster crash-window reconciliation sweep |
| P2 | [ ] | Real UniFi/Aruba HMAC scheme + payloads **if** the push path is ever used (the poller made it optional) |

## B4 — Aruba · P2 · **decision, not code**

| Pri | Status | Item |
|---|---|---|
| P2 | [!] | **Does Aruba exist in the estate at all?** Parser, event mapping and route are built but unconfigured and fail-closed. All 8 properties appear UniFi-covered | §Q2 |
| P2 | [ ] | If not: delete `/api/webhooks/aruba` + the `ARUBA` enum path rather than ship a dead route |

## B5 — Teams & Guest WiFi · P2

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | Teams delivery via Power Automate webhook — **built + configured in prod** (verified `teams.configured: true`). Delivery is post-commit off the 1-min cron. **Untested end-to-end** only because no ticket has ever been created; the first KW outage exercises it. Send-only as configured: no message id back, so no threading | §Q5 |
| P1 | [ ] | **Ticket close should REPLY to the created-ticket message, not post separately** (Kyle 2026-07-28). Schema is already ready (`Ticket.teamsMessageId` / `teamsMessageUrl`, unused). Two paths — see §Q25. Wanted because an outage generates several posts and a loose "resolved" message makes the channel unreadable exactly when someone is reconstructing what happened |
| P1 | [x] | **Guest WiFi LIVE 2026-07-29** (`a3b2de6`, `1493983`, `5d5c866`). Credentials resolve **env-first** (`SPOTIPO_API_KEY` + `SPOTIPO_SITE_ID_<CODE>`); real guest counts for **8/8 sites (669 total)**. WiFi page now reads **three sources**: guests ← Spotipo · **online-now ← UniFi site statistics** · **revenue ← Stripe per property**. Date range (7d/30d/MTD/90d/12m) applies to revenue only |
| P2 | [x] | ~~At-rest encryption for `Property.spotipoApiKey`~~ — **moot**: keys now live in env, never in the DB, so they are absent from backups, query logs and every `Property` read. Closes open decision D6 |
| P2 | [ ] | 7 of 8 properties still need `STRIPE_SECRET_KEY_<CODE>` — revenue shows JW only |
| P3 | [ ] | T8 — Teams reply → `TicketNote` (**requires Graph**, impossible on the webhook) |

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

# CROSS-CUTTING — Ops, security, quality

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | **CI: GitHub Actions** — lint + typecheck + tests on PR. Everything is verified locally today; nothing stops a bad push |
| P1 | [ ] | Playwright e2e on login → submit → review |
| P1 | [ ] | Rotate temp admin password before real staff onboard |
| P1 | [ ] | **`AUTH_SECRET` is triple-purpose** (NextAuth secret + OTP pepper + trusted-device HMAC). Splitting rotates live secrets → coordinated change, deferred to A11 |
| P2 | [ ] | Nightly `pg_dump` → R2 backup bucket |
| P2 | [ ] | Sentry alerts wired per RUNBOOK §Monitoring |
| P2 | [ ] | Weekly orphaned-photo cleanup cron (re-do resubmits orphan prior R2 objects; must be prefix-restricted — R2 has no undelete) |
| P2 | [ ] | Clean **prod R2 bucket** (still `rise8-ops-staging`) + evaluate Bucket Lock |
| P2 | [ ] | Preview environment still points at the **dev DB**; add `R2_*` + `AUTH_SECRET` to Preview if branch previews are wanted |
| P3 | [ ] | OTP attempt-cap resets on resend — reclassified negligible (each resend mails a fresh unseen code). Real fix is account-level lockout on OTP failures |
| P3 | [ ] | M365 SSO · Web Push · Capacitor wrapper (only if iOS PWA fails) |
| P0 | [!] | **On-device verification never done**: iPhone/Android PWA install + iOS GPS in standalone mode. `/ios-spike` is deployed and awaiting a real device | §Q19 |

---

# §Q — Open questions & decisions needed

Grouped by owner. Each says what it blocks and my recommendation, so it can be answered in one pass.

## Kyle

| # | Question | Blocks | My recommendation |
|---|---|---|---|
| **Q1** | **UniFi account access — mostly SOLVED 2026-07-29.** A third key reached a **second account** and added 9 consoles → 5 of 8 properties now monitored. Three keys tested in total; two saw the same 5, the third saw 9. **Still unreachable: Jacksonville West, Jacksonville North, and a live St. Augustine console** — so a THIRD account exists. Who owns it? | B2, and 7 of 8 properties | Either (a) the owner of those consoles invites this account (per console: Settings → Admins), or (b) a key is created **from** the owning account. ⚠ (a) may not suffice: the Site Manager shows an org/"Fabrics" structure (Stayable Central / North / Independent Sites) and API v1 may only return directly-associated hosts, not org-managed ones. Decisive test either way: re-run the host probe with a key from the owning account — success is **~19 hosts, not 5**. Multi-key support is already built, so a second *account's* key just slots into `UNIFI_API_KEY_2` |
| **Q2** | **Is there any Aruba hardware?** — **now likely YES, and it matters.** Kate flagged the AP counts as too low; investigation confirmed she is right about the physical count but the cause is not our monitoring. The consoles' OWN statistics match what we ingest, so nothing is truncated: KW reports **2 UniFi APs against 236 guest clients and 9 PoE switches**; DP reports **0 APs against 280 wired clients**. LL (39) and SA (40) show the real per-room pattern. A non-UniFi AP plugged into a UniFi PoE switch appears as an ordinary *wired client* — exactly the signature seen. **Decisive check: physically look at one AP at KW or DP and read the brand** (2 minutes). If Aruba, that lane is the missing half of AP monitoring, not dead code to delete | B4, and AP coverage at 4 properties | Check the hardware before writing any more code either way |
| **Q3** | ~~Is Spotipo in use?~~ **ANSWERED: yes.** 8/8 sites live, 669 registered guests. API surface is **only** `/api/v1/guest/` — no revenue, no online-now, no date filtering (21 other paths 404, and date params are silently ignored). Revenue comes from Stripe instead; online-now from UniFi | — | Closed |
| **Q7** | **Component I to cutover, or Component II?** Doing both is what put us behind | Everything, and the re-baselined date | Finish A6 + A7 to get Track A usable, and run D2–D4 alongside (small, independent). Pause Track C until C0 closes |
| **Q16** | **Is contractor scheduling separable** from the internal daily maintenance schedule (in Connecteam, which Track A replaces)? | D6 | Assume separable and build D6 as the permanent home for contractor scheduling. If entangled, D6 must either coexist with Connecteam during parallel run or absorb internal scheduling too |
| **Q19** | On-device PWA + iOS GPS check | A11 confidence, Capacitor fallback | 20 minutes with one iPhone closes a Week-1 risk that is still open in Week 11 |

## Kate

| # | Question | Blocks | My recommendation |
|---|---|---|---|
| **Q26** | **Date-ranged guest counts: "active in the window" or "acquired in the window"?** Spotipo ignores date params, so the only route is paginating every guest and filtering `last_seen_at` locally — which answers *active*, not *acquired*. Different questions | A date-ranged guest figure | Decide which she means before I build it; the two need different data and only one is cheap |
| **Q5** | **Teams: accept the send-only webhook, or hold for Graph?** Webhook = no threading, no message id, T8 impossible. Her DevSpec §5.3–5.4 requires Graph | B5, A8 Teams digest | Ship the webhook now, keep the Graph seam. But this is a documented deviation from her spec and hers to accept |
| **Q9** | **Geofence polygons** for 8 properties | A6 — every photo is `UNVERIFIED` until then | Draw them once the editor exists; then backfill |
| **Q10** | **Branding kit** — logo, palette, wordmark | A8 design pass | Structural work can proceed; polish can't |
| **Q11** | **Teams channel inventory** — 1 corporate + 8 property webhook URLs | A8 digest | Same webhook mechanism now proven working |
| **Q12** | **Cloudbeds per-property read-only API keys** | A9/S3 | — |
| **Q13** | Final CONTRACTOR-audience template list | A10 | — |
| **Q14** | **Who reviews the Spanish?** Karla / Christopher / external | A11 — gates field training | Machine-drafted ES keeps shipping meanwhile (ADR-014) |
| **Q20** | Confirm the CORPORATE→"Manager" display-label interpretation (role stays in DB) | Cosmetic, low | Working interpretation already applied |
| **Q25** | **Threaded ticket notifications** — reply-on-close needs a parent message id, which the current flow doesn't return. Two ways: **(a)** edit the Power Automate flow to respond with the created message id and to accept a `replyToId` (then we store it and send it on close — small change on our side, needs the flow edited and possibly a premium action); **(b)** switch to Microsoft Graph, which returns the message and supports replies natively, and also unlocks reply-ingestion (T8) | B5 threading, and A8's Teams digest formatting | Try (a) first — it's cheap and keeps today's working path. If the flow can't return the id, (b) is the honest answer and Graph was Kate's original spec anyway |

## Crystal (Head of Ops) — **ops ground truth, not an approval gate**

Her answers are inputs Kyle+Kate decide with; they do not gate a merge.

| # | Question | Blocks | Note |
|---|---|---|---|
| **Q6** | Track C ops reality + the Top-8 technical blockers (issues→Ticketing, Graph consent, DB split) | Quality of the C1 spec | Kate reconciled Part 1; the technical blockers are Kyle's to settle |
| **Q15** | **Who receives the PM-facing intake brief?** | C0 | Brief can be drafted recipient-agnostic and held |
| **Q18** | Construction ops input (scope: renovation contractors vs. in-house vs. both, #1 pain) | Quality of the E0 decision | The go/no-go itself is Kyle+Kate |
| **Q17** | WhatsApp Business API cost + Meta verification timeline | D7 | Not "which channel" — WhatsApp is settled. Cost call is Kyle+Kate |

## Others

| # | Question | Owner | Blocks |
|---|---|---|---|
| **Q21** | **Real question content for 9 templates** | Karla / Christopher | A6 — hard cutover blocker |
| **Q22** | **Recurring-rules matrix** per template per property | Property Managers | A6 |
| **Q23** | **Who classifies an issue as an emergency, and how?** | Gerardo | D5 auto-notify rule (MVP uses a manual toggle) |
| **Q24** | SLA hours per priority — confirm or correct the placeholders | Christopher | A6, non-blocking |

---

# §SPEC — Plan before building

These are in the tracker as one-liners but are **not buildable from that line**. Each needs a design pass — data model, states, and UI decided — before code. Attempting them straight from the backlog is how you get a half-model that has to be migrated later.

| # | Item | Why it needs a spec first |
|---|---|---|
| **SPEC-1** | **S2 room lifecycle + checkout queue** | 9 derived states, and it interacts with Cloudbeds (S3), OOO flags from checklists, and the checkout flags S1 already ships. Get the state machine on paper first |
| **SPEC-2** | **S4 preventive maintenance** | Introduces an `Asset` registry and interval-from-last-completion scheduling — a second scheduling engine alongside recurrence. Decide whether they share code before writing either |
| **SPEC-3** | **S5 performance + S6 insights** | Both are metric-definition problems, not code problems. "Quality Score = pass ÷ verified" needs agreement on what counts before anything is computed, or the numbers get argued with instead of used |
| **SPEC-4** | **C1 unified ticket model** | The big one. It absorbs `/issues`, spans 4 intake channels, and has to model ticket-vs-concern. Getting this wrong means migrating live maintenance data twice. **Blocked on C0 answers** |
| **SPEC-5** | **D6 contractor scheduling** | Depends entirely on §Q16. A shared calendar and a contractor-only calendar are different data models |
| **SPEC-6** | **A7 invalidation flow (ADR-014)** | Request → pending → approve/reject with an audit chain, touching instance state that S1's lock now also governs. Two features both claiming instance immutability need reconciling |
| **SPEC-7** | **D7 automated WhatsApp** | ✅ **Written 2026-07-28** — `docs/component-ii/WhatsAppAutomationSpec_RISE8_072826.md`. Covers the wa.me-vs-Cloud-API distinction, Meta prerequisites, the 4 UTILITY templates, the 24-hour window rule, schema delta, and why staff stay off WhatsApp |

---

# Done — reference

Closed decisions worth not re-litigating (full ADRs in `docs/DECISIONS.md`): PWA not native · no Smartsheet write-through · email+password + OTP for all users · 8 properties w/ 2-letter short codes · photos kept forever · all datetimes displayed in ET · bilingual field surfaces only · contractor magic-links instead of accounts · bonus logic scrapped · UniFi integration is **pull, not push** · dispatchers reuse `MANAGER` · WhatsApp is the only contractor channel.

---

*Update this file as work lands. Mirror significant decisions into `docs/DECISIONS.md` as ADRs. Historical per-task detail lives in `docs/archive/TODO_preReorg_RISE8_072826.md`.*
