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

## 🎯 START HERE (2026-07-28)

**Immediate, in order:**

| # | Action | Why now |
|---|---|---|
| 1 | 🧑 **Run the contractor migration on prod**, then I push `e400698` + `4d572d0` | Two commits are held locally. The merge makes "Contractors" visible in the nav for every manager+; without the migration that link 500s |
| 2 | 🧑 **Set `TEAMS_WEBHOOK_URL` in Vercel Production** | Teams delivery is built and tested but inert without it (`9461c40`, already pushed) |
| 3 | **D2 — contractor job record** ▶ | The design spec already exists (`docs/superpowers/specs/2026-07-23-t2-contractor-job-design.md`). Unblocks D3→D4 (WhatsApp) and D6 (scheduling) |
| 4 | 🧑 **KW unplug test** (~7 min) | The ticket lifecycle has never fired in production. This is the difference between "code is right" and "system works" |

**The two decisions that unblock the most downstream work:** §Q1 (UniFi account access — 7 of 8 properties) and §Q7 (Component I vs II priority — see the schedule warning below).

**⚠️ Schedule reality:** original plan was cutover at Week 14 ≈ **21 Aug 2026**. We are ~10.5 weeks in with A6 (content + geofences), A7, A8 and A11 all outstanding, and a 4-week parallel run not started. **Week-14 cutover is not reachable.** Two new tracks (C, D) also appeared without Rob signing off the scope expansion. A re-baselined date is owed — see §Q7.

---

## 🗺️ Track map

| Track | Scope | Pri | State | Next phase |
|---|---|---|---|---|
| **A** | **Checklist App (StayCheck)** — the Connecteam replacement | **P0** | 🟢 Live in prod, ~60% of v1 | A6 (real content + geofences) |
| **B** | **Network Monitoring & IT Ticketing** | P1 | 🟢 Live pilot, 1 of 8 properties | B2 (prove lifecycle + widen access) |
| **C** | **Maintenance / Ticketing** (tenant + email desk) | P1 | 🔴 Nothing built, gated on sign-off | C0 (gate) |
| **D** | **Contractor Dispatch + WhatsApp + Scheduling** | P1 | 🟡 T1 directory built, not deployed | D2 (job record) ▶ |
| **E** | **Construction Progress / Scheduling** | P3 | ⛔ Concept, gated | E0 (greenlight) |

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
| P1 | [ ] | 🧑 **KW unplug test** — the whole lifecycle (PROBLEM → 5-min timer → ticket → Teams post → recovery → auto-close) has **never run in production**. ~7 min to verify |
| P1 | [!] | **7 of 8 properties unmonitored** — API key sees 5 of 19 consoles; account not invited to the rest | §Q1 |
| P1 | [ ] | Register the other consoles in `lib/network/unifi-hosts.ts` once access lands (one entry each, `monitored: true`) |
| P2 | [ ] | Registry admin UI (promote the code constant to a `UnifiHost` table) — only needed when a non-developer must edit it |
| P2 | [ ] | Verify Protect **camera-level** status (8 NVRs exist; none visible to this key yet) |

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
| P1 | [~] | Teams delivery via Power Automate webhook — **built, needs `TEAMS_WEBHOOK_URL`**. Send-only: no threading, no message id, T8 impossible | §Q5 |
| P2 | [!] | Guest WiFi (Spotipo) — scaffold only, renders "not configured" | §Q3 |
| P2 | [ ] | Decide at-rest encryption for `Property.spotipoApiKey` (plaintext column today) |
| P3 | [ ] | T8 — Teams reply → `TicketNote` (**requires Graph**, impossible on the webhook) |

---

# TRACK C — Maintenance / Ticketing · P1 · 🔴 NOT STARTED

Replaces the Smartsheet maintenance tracker **and** Zoho Desk. Intake → AI triage → human review → ticket vs. concern → work order → dispatch → close. Docs in `docs/component-ii/`. **No AI decides alone** — human review precedes every ticket.

**Intake reality (corrected 2026-07-08):** tenant requests arrive via **TurboTenant + Jotform**, consolidated in Smartsheet today. **Property managers** own triage/assignment/daily scheduling. The `admin@`/`blake@` email desk is an *additional* lane (maintenance emails get missed today), not the whole intake.

## C0 — Gate ▶ **build is blocked until this closes** · P0

| Pri | Status | Item |
|---|---|---|
| P0 | [~] | Staged sign-off **Kate ✅ → Crystal (owner) → Rob (budget)** | §Q6 |
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
| D2 | P1 | [ ] ▶ | **T2 — Contractor job record.** Property, room, trade, problem, photos (reuse R2 pipeline), `URGENT` flag, status. Dispatcher-created. Spec ready: `docs/superpowers/specs/2026-07-23-t2-contractor-job-design.md` |
| D3 | P1 | [ ] | **T3 — Match & rank** (pure, testable): filter by property + trade, order contracted-first |
| D4 | P1 | [ ] | **T4 — One-tap dispatch:** pre-filled bilingual `wa.me` deep link + `tel:` for the emergency first touch. Human sends; no auto-action. **Message carries a signed single-use magic link** so the contractor sees the job + photos with no account — shared with A10 |
| D5 | P1 | [ ] | **Emergency flag + fast alert** to the coordination group. MVP = manual URGENT toggle | §Q4 |
| D6 | P2 | [ ] | **Scheduling: contractor calendar** + auto-reschedule of jobs bumped by an emergency. **§SPEC-5** — and §Q16 must be answered first |
| D7 | P2 | [ ] | **L2 — WhatsApp Business API**: two-way Accept/Decline/ETA, auto-escalation ladder, broadcast-to-pool. Needs Meta Business verification + cost approval | §Q17 |

---

# TRACK E — Construction Progress / Scheduling · P3 · ⛔ GATED

Brief: `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`. Shares the ingestion engine with Track C. **No build until greenlight.**

| Phase | Pri | Status | What |
|---|---|---|---|
| E0 | P0 | [!] | **Greenlight** — moved from Rob to **Crystal's ops input** (design-review §2.3); Rob is budget-only now. ⚠ Record as an ADR when it closes | §Q18 |
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
| **Q1** | **UniFi account access** — key sees 5 of 19 consoles; account not invited to the rest. Who owns the other 14? | B2, 7 of 8 properties | Get a key from the owning account, or have that owner grant access and reissue. Success = ~19 hosts returned. In progress internally |
| **Q2** | **Is there any Aruba hardware at all?** | B4 | If no: delete the route and enum path. Don't ship a dead code path |
| **Q3** | **Is Spotipo actually in use?** | B5 | If no: hide `/network/wifi` rather than ship a permanently "not configured" section |
| **Q7** | **Component I to cutover, or Component II?** Doing both is what put us behind | Everything, and the re-baselined date | Finish A6 + A7 to get Track A usable, and run D2–D4 alongside (small, independent). Pause Track C until C0 closes |
| **Q16** | **Is contractor scheduling separable** from the internal daily maintenance schedule (in Connecteam, which Track A replaces)? | D6 | Assume separable and build D6 as the permanent home for contractor scheduling. If entangled, D6 must either coexist with Connecteam during parallel run or absorb internal scheduling too |
| **Q19** | On-device PWA + iOS GPS check | A11 confidence, Capacitor fallback | 20 minutes with one iPhone closes a Week-1 risk that is still open in Week 11 |

## Kate

| # | Question | Blocks | My recommendation |
|---|---|---|---|
| **Q5** | **Teams: accept the send-only webhook, or hold for Graph?** Webhook = no threading, no message id, T8 impossible. Her DevSpec §5.3–5.4 requires Graph | B5, A8 Teams digest | Ship the webhook now, keep the Graph seam. But this is a documented deviation from her spec and hers to accept |
| **Q9** | **Geofence polygons** for 8 properties | A6 — every photo is `UNVERIFIED` until then | Draw them once the editor exists; then backfill |
| **Q10** | **Branding kit** — logo, palette, wordmark | A8 design pass | Structural work can proceed; polish can't |
| **Q11** | **Teams channel inventory** — 1 corporate + 8 property webhook URLs | A8 digest | Same webhook mechanism now proven working |
| **Q12** | **Cloudbeds per-property read-only API keys** | A9/S3 | — |
| **Q13** | Final CONTRACTOR-audience template list | A10 | — |
| **Q14** | **Who reviews the Spanish?** Karla / Christopher / external | A11 — gates field training | Machine-drafted ES keeps shipping meanwhile (ADR-014) |
| **Q20** | Confirm the CORPORATE→"Manager" display-label interpretation (role stays in DB) | Cosmetic, low | Working interpretation already applied |

## Crystal (Head of Ops — owns Track C design)

| # | Question | Blocks | Note |
|---|---|---|---|
| **Q6** | **Sign-off on Track C design** + the Top-8 blockers (esp. issues→Ticketing, Graph consent, DB split) | All of Track C | Kate reconciled Part 1 and routed to her |
| **Q15** | **Who receives the PM-facing intake brief?** | C0 | Brief can be drafted recipient-agnostic and held |
| **Q18** | **Construction greenlight** (moved from Rob to her ops input) | All of Track E | Rob is budget-only now |

## Rob (sponsor)

| # | Question | Blocks | Note |
|---|---|---|---|
| **Q8** | **Scope + budget sign-off** — deferred since 2026-05-21. Tracks C, D, E are all a scope expansion beyond the checklist v1 he was asked about | Legitimacy of C/D/E; the re-baselined timeline | Alpha demo for him was never recorded either |
| **Q17** | WhatsApp Business API cost + Meta verification timeline | D7 | Not "which channel" — WhatsApp is settled |

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

---

# Done — reference

Closed decisions worth not re-litigating (full ADRs in `docs/DECISIONS.md`): PWA not native · no Smartsheet write-through · email+password + OTP for all users · 8 properties w/ 2-letter short codes · photos kept forever · all datetimes displayed in ET · bilingual field surfaces only · contractor magic-links instead of accounts · bonus logic scrapped · UniFi integration is **pull, not push** · dispatchers reuse `MANAGER` · WhatsApp is the only contractor channel.

---

*Update this file as work lands. Mirror significant decisions into `docs/DECISIONS.md` as ADRs. Historical per-task detail lives in `docs/archive/TODO_preReorg_RISE8_072826.md`.*
