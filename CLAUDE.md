# CLAUDE.md

This file gives Claude Code the persistent context it needs for the RISE8 Operations Platform project. Read this first in every session.

---

## What This Project Is

**RISE8 Operations Platform** — a custom web application that replaces the operational checklist functionality of Connecteam for RISE8 Companies / Stayable, while integrating with the existing Smartsheet ecosystem during transition (and archiving Smartsheet on cutover).

It serves field staff (Housekeeping, Property Attendants, Maintenance Technicians) and management (Property Managers, Corporate, Asset Management) across 7 Stayable extended-stay properties in Florida.

**As of 2026-08-03 (ADR-028), the project is TWO tracks, one codebase, both live in production:**
- **A. Checklist App (StayCheck)** — the Connecteam replacement (this doc's original scope + StayCheck v1.1). `P0`.
- **B. Network Monitoring & IT Ticketing** — UniFi pull-poller across 16 consoles / 8 properties, ticket lifecycle, per-channel Teams notifications + escalation + 9 AM ET digest, Spotipo guest WiFi, Stripe revenue. `P1`. Docs in `docs/network/`.

**Everything else is archived and out of scope.** Tracks C (Maintenance/Ticketing), D (Contractor Dispatch + WhatsApp) and E (Construction) were archived 2026-08-03 — Kyle is building that capability as a separate system outside this repo. Track D's shipped code was **deleted, not frozen** (`94ce338`), and its tables dropped. Reference material, the verbatim C/D/E tracker sections, their open questions and the decisions worth not re-deriving live at **`docs/archive/tracks-cde/`**. **Do not restart that work from the archive** — if any of it returns, it returns through a fresh decision. ADR-025's three-component structure is superseded for scope.

**`TODO.md`** carries the two tracks with priorities and ordered phases, a START-HERE block, a consolidated `§Q` open-questions register grouped by owner, and a `§SPEC` list of work needing a design pass before code. The pre-2026-07-28 week-phase tracker is preserved at `docs/archive/TODO_preReorg_RISE8_072826.md`.

**Why it exists:** Field staff currently fill out checklists in Connecteam (a mobile app), then Karla and Christopher manually download the completed PDFs and re-upload them as Smartsheet row attachments while typing metadata. This consumes 1–2 hours/day of corporate staff time and loses photo/structured-response fidelity. The new platform is the single source of truth.

---

## Critical Project Decisions (DO NOT QUESTION OR RE-DEBATE)

These were settled during scoping. If a request seems to conflict with these, ask for clarification before proceeding — do not silently change direction.

### Scope
- **In:** Operational checklists, recurring schedules, bulk creation, photo capture with geofence verification, manager review/approval, issues pipeline, dashboards, PDF export on demand, email notifications, **Quick Tasks** (ADR-012); plus **Track B** network monitoring / IT ticketing (ADR-026, ADR-027)
- **Out:** Time clock / time tracking (handled by Paycom), payroll/HR (handled by Paycom), shift scheduling (handled by Paycom), chat/messaging, hiring/onboarding, training, knowledge base, surveys, guest-facing features, native iOS/Android apps — **and, since ADR-028, maintenance/tenant ticketing, contractor dispatch and construction PM** (a separate system Kyle is building)
- **In question:** **Contractor Checklists** (ADR-012) — see §Q31

**v1 build was scoped at 10 weeks** (extended from 8 per ADR-012) + 4-week parallel run, **cutover Week 14 ≈ 21 Aug 2026 — not reachable.** A re-baselined date is owed and is gated on A6's content, not on code (§Q7).

### Architecture
- **PWA, not native.** Single Next.js app, responsive, installable to home screen. Offline support via service worker + IndexedDB for short outages (not multi-day offline use). Properties have 2Gbps fiber + AP buildout, so offline is an edge case.
- **No Capacitor wrapper in v1** unless Week 1 iOS PWA testing reveals showstoppers.

### Stack (decided, not exploratory)
- Next.js 15 (App Router) + TypeScript
- Vercel hosting (existing free tier, upgrade to Pro if needed)
- Neon Postgres (existing free tier → Pro at $19/mo when needed)
- Prisma ORM (or Drizzle — developer's call, but pick one and stick with it)
- Cloudflare R2 for photos and PDFs (~$5/mo at scale)
- Resend for transactional email (existing free tier)
- Auth.js v5 (NextAuth) — Credentials provider for v1
- shadcn/ui + Tailwind CSS
- Workbox for service worker / PWA
- Inngest for background jobs (free tier)
- Vercel Cron for scheduled jobs
- @react-pdf/renderer for PDF exports
- Sentry for error tracking (free tier)

### Auth
- **Email + password for ALL users** (field staff, managers, corporate, admin). No Microsoft 365 SSO in v1.
- Admin-initiated password reset (one-click action) is a must-have feature, not nice-to-have.
- MFA: optional for field staff (off by default), on by default for managers/corporate (TOTP via authenticator app, NOT SMS).
- Account lockout after 5 failed attempts in 15 min for 30 min.
- Sessions: JWT-based, 30-day rolling expiry.

### Smartsheet
- **No write-through during transition.** Smartsheet sheets become read-only historical archive on cutover. Do not build dual-write logic.

### Properties (active = 8, addresses + short codes confirmed 2026-05-27)
| Property | ID | Short Code | Street Address |
|---|---|---|---|
| Jacksonville North | 812 | JN | 812 Dunn Avenue, Jacksonville, FL 32218 |
| Jacksonville West | 6802 | JW | 910 Suemac Road, Jacksonville, FL 32254 |
| Kissimmee East | 2295 | KE | 2295 E. Irlo Bronson Memorial Hwy, Kissimmee, FL 34744 |
| Kissimmee West | 5399 | KW | 5399 W. Irlo Bronson Memorial Hwy, Kissimmee, FL 34746 |
| Lakeland | 4645 | LL | 4645 N. Socrum Loop Road, Lakeland, FL 33809 |
| Orlando OBT | 8700 | OR | 8700 S. Orange Blossom Trail, Orlando, FL 32809 |
| St. Augustine | 2535 | SA | 2535 State Road 16, St. Augustine, FL 32092 |
| Davenport | 44199 | DP | 44199 US Hwy 27, Davenport, FL 33897 |

**Notes:**
- Property IDs are internal identifiers, not street numbers. The previous PRD draft had Jacksonville West at "6802 Commonwealth Ave" — incorrect; the actual address is 910 Suemac Road. Corrected 2026-05-27.
- **2-letter short codes are canonical across the platform** (UI labels, dashboards, Teams digest, email subjects). They mirror the codes already used by corporate in the manual Teams digest. Long names ("Jacksonville West", "Lakeland") only used in admin / settings detail pages.

### Checklist Templates (9, migrated from Connecteam)
1. Arrival Checklist (HK/PA, daily, per room)
2. DueOut / Departure (HK, daily, per room)
3. HK Review (HK Lead/Manager, weekly, per property)
4. PA Review (Manager, weekly, per property)
5. Manager Review (Manager, weekly, per property)
6. Maintenance Report (MT, daily, per task/area)
7. Pressure Washing (MT, monthly, per property)
8. Roof Preventive Maintenance (MT, quarterly, per property)
9. Room Inspection (Manager/Corp, ad-hoc, per room)

### Roles (6)
1. **HK** (Housekeeping) — fill own assignments
2. **PA** (Property Attendant) — fill own assignments
3. **MT** (Maintenance Technician) — fill own assignments + handle assigned issues
4. **MANAGER** — full access to their property only
5. **CORPORATE** — read-write across all properties
6. **ADMIN** — full system access including user provisioning

### Photo Verification
- Native camera only (no gallery upload — prevents stale photos)
- Compress client-side to max 1920px long edge, JPEG quality 85, ~500KB target
- Capture GPS via `navigator.geolocation` (separate from EXIF — iOS strips EXIF)
- Geofence check on upload using polygon from `properties.geofence`
- Status: `VERIFIED` / `OFF_PROPERTY` / `NO_GPS` — informational badge, NOT enforcement
- 50-meter buffer on geofence for GPS drift

### Recurring Rules & Auto-Creation (ADR-009)

**Who controls recurring rules**
- **ADMIN** — create / edit / pause / delete at any property
- **MANAGER** — own property only; all mutations written to `audit_log`
- **CORPORATE** — read-write across all properties
- **HK / PA / MT** — no rule access

**Per-rule knobs**
- Template + Property (locked after create)
- Pattern: `daily` / `weekly` (DOW) / `monthly` (DOM) / `quarterly` / `on-demand`
- Scope: `per-room` (filter: occupied / vacant / room list / room range) · `per-property` · `per-area`
- Assignment policy: specific user · role pool · unassigned
- Effective date range (default indefinite); Active toggle (pause); Skip days list

**Generation**
- One global Vercel Cron at **5:00 AM ET** (`America/New_York`, auto EDT/EST). No per-rule time override in v1.
- Room occupancy source: manual `rooms.status` field. **No PMS integration in v1.**
- No holiday/blackout calendar in v1 — use "Skip today" or pause the rule.

**Override paths**
- Bulk create (template + property + date(s) + room range/list)
- "Force-create today" from a paused rule
- "Skip today" on an active rule
- Manual reassign / invalidate after generation

### Localization (ADR-013)
- **Field-staff surfaces bilingual EN + ES** (login, password reset, "Today" home, checklist filling, photo / signature capture, submission confirmation, notifications targeting field staff). **Admin / Manager / Corporate stay English-only in v1.**
- Translation scope follows recipient, not screen — a notification or email sent to a field-staff user is translated regardless of which surface generated it.
- Library: **`next-intl`** (App Router-native). Locale routing via middleware (no URL prefix).
- `users.locale` enum (`en` | `es`); default `en` for managers/corp/admin, prompted on first login for field staff. Admin can override.
- Spanish review owner: TBD — likely Karla or Christopher. **Review pass deferred to Phase 8 per ADR-014** (machine-drafted ES acceptable through alpha/demo).

### Multi-Property User Assignment (ADR-013)
- `user_properties` is many-to-many. **Each user has one global role** (`users.role`) that applies at every property they're tied to.
- RBAC: a user can access property X iff role ∈ {CORPORATE, ADMIN} OR `(user_id, property_id=X)` exists in `user_properties`.
- UI: header property picker for users with >1 property; auto-select for single-property users; hidden for CORPORATE/ADMIN (portfolio default).
- **Per-property role overrides not supported in v1.** Edge case ("MT at LL, Manager at OR") handled via two user records.

### Photo Retention (ADR-013)
- **Keep all photos forever in v1.** No scheduled deletion job.
- **No R2 versioning — R2 doesn't offer it** (confirmed against live bucket 2026-06-05). Deletion protection = keep-forever policy + object-scoped tokens; evaluate Bucket Lock for the prod bucket at Phase 8 (RUNBOOK §Backup).
- Cost projection: ~80 GB/year added at full operation; ~$1.20/mo additional storage per year of accumulation.
- Trigger to revisit: R2 bill > $50/mo, or legal/privacy mandate.
- Audit log + notification log follow same "keep forever" policy.

### Datetime Display — Always Eastern Time (ADR-013)
- All timestamps stored as **UTC** in Postgres.
- All user-facing datetime display formatted in **`America/New_York`** (auto EDT/EST) — every user, regardless of browser locale.
- "Today" / "Yesterday" / "This Week" anchored to ET.
- All time labels include `ET` suffix in UI (e.g., "Submitted 5:23 AM ET").
- Library: `date-fns-tz`. All formatting through `lib/datetime.ts` — never call `toLocaleString` directly. ESLint rule to enforce.

### Contractor Checklists (ADR-012) — ⚠ **in question, see `TODO.md` §Q31**
**Never built, and its foundation is gone.** ADR-028 deleted the `contractors` table and `lib/job-link.ts` (the signed-link helper) with Track D, so this module would now have to carry its own contractor identity. Recommendation on record: **drop it from v1.** The original design is kept below only so the decision is made with the design in view.
- **No contractor accounts.** Manager creates a `contractors` record; system issues a **signed, single-use, 72h-TTL magic-link URL** per checklist instance.
- Contractor opens link → fills checklist → captures photos (same flow as employee) → signs → submits. Token consumed on submit.
- `checklist_templates.audience` enum: `EMPLOYEE` | `CONTRACTOR`. `checklist_instances.contractor_id` (nullable FK).
- Review flow identical to employee submissions; submitter column shows contractor name + company. Flag → Issue tagged to contractor record.
- Initial templates (Kate to finalize Phase 9): Roof PM (contractor variant), Pest Control, HVAC Service, Pressure Washing (contractor variant), Lawn / Landscaping.

### Quick Tasks (ADR-012, Phase 10 = Week 10)
- Lightweight ad-hoc tasks. **No question set, no recurrence, no review queue, no PDF.**
- `quick_tasks` table: `id`, `title`, `description`, `property_id`, `assigned_user_id` (nullable), `assigned_role` (nullable), `created_by_user_id`, `due_date`, `priority` (LOW/MED/HIGH/URGENT, default MED), `status` (OPEN/IN_PROGRESS/COMPLETED/CANCELLED), `completion_note`, photos (max 5), timestamps.
- Field staff surface: "My Tasks" in home, sorted by due date asc → priority desc.
- Manager surface: open tasks at their property with assignee/priority/status filters.
- Corporate dashboard shows portfolio rollup of open / overdue Quick Tasks per property.
- **Not integrated with Issues pipeline** — Issues come from failed checklist questions or manager flags; Quick Tasks are manually-created.

### Manager Review UI (ADR-011)
- **Single-submission review** — three-column layout (left: status + manager note; center: responses + photos + signatures + time-to-complete; right: activity timeline w/ actor + timestamp). Ships in Phase 4, refined in Phase 7 redesign.
- **Submission queue** — table view, one row per submission. Columns: Status · User · Date · Unit# · Time-to-complete · inline photo thumbnails (one per required photo question) · row-level actions (Approve / Flag / Request Re-do). Ships in Phase 4, refined in Phase 7.

### Branding & Product Name (ADR-010)
- **Internal / dev / repo name:** "RISE8 Operations Platform"
- **End-user product name:** **"Stayable Operations"** — used in UI, emails, Teams posts, PDFs
- Phase 7 design pass uses **Stayable branding** (logo, colors, wordmark) — sourced from Kate

### Daily Teams Digest (ADR-010, Phase 7 — lower priority than P0)
- **Delivery:** Auto-posted 7:00 AM ET each morning to (a) one master RISE8 corporate Teams channel covering all 8 properties, AND (b) per-property Teams channels scoped to that property only
- **Per-property block:** 2-letter short code header (JN, JW, KE, KW, LL, OR, SA, DP), Misses (template + room#s), Flagged issues (room + 1-line), Photo verification anomaly count; each line links to source instance
- **Tone:** Terse, factual auto-gen — **not** the empathetic prose of the current human-typed digest. Managers/corporate may reply with custom prose.
- **Mechanism:** Teams Incoming Webhooks (1 corporate + 8 property), Inngest cron at 7:00 AM ET (`America/New_York`), runs after the 5 AM checklist-gen cron
- Failure on one channel never blocks others; all attempts logged to `notification_log`
- **Replaces** Karla/Christopher's ~30–60 min/day manual Teams typing
- This is **in addition to** the P0 daily PM email digest in Phase 6 (PRD §8)

### Checklist Instance Naming (ADR-009)

**System ID (immutable, used for joins, audit, URLs):**
`CL-{propertyID}-{templateCode}-{YYYYMMDD}-{seq}`
- `templateCode`: `ARR` Arrival · `DEP` DueOut/Departure · `HKR` HK Review · `PAR` PA Review · `MGR` Manager Review · `MNT` Maintenance Report · `PWR` Pressure Washing · `RPM` Roof PM · `RIN` Room Inspection
- `YYYYMMDD` = scheduled date in `America/New_York` (current ET date at generation time)
- `seq` = zero-padded 3-digit, **restarts at 001 each ET day**

Examples: `CL-4645-ARR-20260526-012`, `CL-6802-PWR-20260526-001`

**Human label (UI, dashboards, email subject lines):**
`{Template} — {Short Code} — {Scope} — {Date}`
- `Arrival Checklist — LL — Rm 312 — May 26, 2026`
- `Pressure Washing — JW — May 2026`
- `HK Review — KE — Wk of May 25, 2026`

**PDF filename (per project convention `Title_PropertyID_MMDDYY.ext`):**
- `Arrival_4645_052626_Rm312.pdf`
- `PressureWashing_6802_052626.pdf`
- `MaintenanceReport_5399_052626_012.pdf`
- `HKReview_2295_WkOf052526.pdf`

---

## File Naming Convention (mandatory for any output file)

Format: `Title_PropertyID_MMDDYY.ext`

- Title in PascalCase
- PropertyID = property number (6802, 4645, etc.), short code (LAKE, SAUG), or `RISE8` for portfolio-level
- Date in MMDDYY format
- This is a project-level repo (multi-property), so docs use `RISE8`

Examples:
- `OperationsPlatformPRD_RISE8_051526.docx`
- `MaintenanceReport_5399_051526.pdf`

---

## Tone, Style, and Communication Preferences

Kate prefers:
- **Direct, no preamble.** Don't open with "Great question" or "Certainly". Just answer.
- **Match her energy** — short, directive, dense.
- **Acknowledge uncertainty honestly.** "I don't know," "verify this," and "I'm not certain" are required when applicable. Never fabricate.
- **Push back when something is wrong.** If a plan has flaws, name them. If numbers are bad, say they're bad.
- **Concise outputs.** Most caveats and disclaimers can be skipped.
- **Targeted iteration over rewrites.** When she gives feedback, change the specific thing — don't rewrite the whole document.

She is an engineer by background (Texas Instruments, process engineer + PM) and works as Director of Asset Management at RISE8. She is technical enough to read code, schemas, and architecture without hand-holding.

---

## Project Roles & People

**Decision model (updated 2026-07-28, Kyle):** **Kyle develops, Kate reviews, and the two of them share every decision.** There is **no sign-off chain and no approval gate** — do not block work waiting on one, and do not add "pending sign-off" states to the tracker. Everyone else supplies **ops ground truth or content**, which is an input, never an approval.

- **Kyle** (`bke@rise8companies.com`) — **develops** (executes the build with Claude Code) and **co-owns every decision with Kate**. Cannot cleanly copy multiline text out of a terminal — push anything copyable to the clipboard for him.
- **Kate** — Director of Asset Management. **Reviews** the app and co-owns every decision with Kyle. Based in Sablan, Benguet, Philippines (UTC+8). Engineer by background (Texas Instruments, process engineer + PM) — reads code, schemas and architecture without hand-holding.
- **Rob Beyer** — CEO of RISE8. **Monitors the launched app only. NOT in the decision path** (changed 2026-07-28). No budget/scope sign-off is required from him, the old "alpha demo for Rob" gate is dropped, and nothing in `TODO.md` is blocked on him.
- **Christopher Acoy Jr.** (`christopher@rentstayable.com`) — Operations support; owes SLA confirmation + real Maintenance Report question content.
- **Karla Ysabelle Dugayo** (`karla@rentstayable.com`) — Operations support; owes real checklist question content. Her manual Connecteam→Smartsheet uploads go away post-cutover.
- **Gerardo** — named contact on Network escalations (Teams-only, no email — ADR-027). Owes nothing else here; his emergency-classification question went out with Track D.

**No longer in scope for this repo** (their work moved to Kyle's separate system, ADR-028): **Crystal Johnson** (Head of Operations — was the source of ops ground truth for maintenance/dispatch and construction), **Jesús Pérez** (contractor scheduler and electrical contractor), and **Blake** (owner of the `blake@rentstayable.com` maintenance inbox). Their briefs are archived at `docs/archive/tracks-cde/`.

---

## Repo Conventions

### Branching
- `main` — production, auto-deploys to Vercel production
- `develop` — staging, auto-deploys to staging environment
- Feature branches: `feat/short-name`, `fix/short-name`, `chore/short-name`

### Commits
- Conventional Commits format: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Subject line under 72 chars
- Body explains *why*, not *what*

### Pull Requests
- Title matches commit subject style
- Description has: What changed, Why, How to test
- Link to relevant section of PRD or sprint plan
- At least one self-review pass before requesting review

### Code Style
- TypeScript strict mode
- ESLint + Prettier with project defaults
- No `any` types unless documented why
- Server actions over REST routes when feasible
- Zod for all input validation at API boundaries
- Prisma client used through a singleton (`lib/db.ts`)

### Testing
- Unit tests for utility functions (Vitest)
- Integration tests for critical API routes
- Playwright for end-to-end on critical user flows (login, submit checklist, review)
- No coverage target enforced; focus on critical paths

### Environment Variables
Required across environments:
```
DATABASE_URL
AUTH_SECRET
AUTH_URL
RESEND_API_KEY
RESEND_FROM_EMAIL
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
INNGEST_SIGNING_KEY
INNGEST_EVENT_KEY
SENTRY_DSN
NEXT_PUBLIC_APP_URL
```

Local: `.env.local` (gitignored).
Production/staging/preview: Vercel environment variables.

---

## Working Documents (in this repo)

- `docs/PRD.md` — Product Requirements Document. Source of truth for what to build.
- `docs/ARCHITECTURE.md` — Technical Architecture. Source of truth for how to build.
- `docs/SPRINT_PLAN.md` — 10-week sprint plan (extended per ADR-012). Source of truth for when and in what order.
- `docs/DECISIONS.md` — Architecture Decision Records (ADRs). Append-only log of significant decisions and their reasoning.
- `docs/RUNBOOK.md` — Operational runbook. How to fix common issues, rotate secrets, restore from backup, etc. Built up over time.
- `docs/CHANGELOG.md` — User-facing change history.
- `docs/ContractorUpdateFanout_Contract_081226.md` — **MIRROR, do not edit here.** Wire contract for contractor WhatsApp updates arriving from Kyle's separate voice-pipeline project (`Stayable/contractors-update-whatsapp`) directly into `/maintenance/schedule`. **That repo owns it and it governs both sides.** Scope is fixed by Kyle 2026-08-12: **updates into the calendar, nothing more** — no contractor reminders, no auto-replies, and **no send path in this repo** (ADR-028/030 removals stand). **Blast radius fixed 2026-08-13: contractor scheduling and the calendar, no more no less** — `Contractor*` models, `/maintenance/*`, the Smartsheet plan loader. It **may affect checklists later; until Kyle says so it does not.** So `lib/network/hmac.ts` is reused in place (do not promote it to `lib/hmac.ts` — that edits two live network receivers) and `RawWebhookPayload` is untouched. App-side review + build order: `docs/ContractorUpdateFanout_AppSideReadiness_RISE8_081326.md`. Supersedes the manual Smartsheet snapshot sync (§Q36); needs **ADR-031** when built. Not built on either side as of 2026-08-12.

**Repo layout (reorganized 2026-07-20):** root holds only `README.md`, `CLAUDE.md`, `TODO.md` + config/code dirs. All docs live under `docs/`:
- `docs/` (top level) — cross-component sources of truth: PRD, ARCHITECTURE, SPRINT_PLAN, DECISIONS, RUNBOOK, CHANGELOG.
- `docs/component-i/` — StayCheck / checklist-app docs (`StayCheckPRD_RISE8_070126.md`, `ChecklistTeamInterviewGuide_RISE8_060526.md`).
- `docs/archive/tracks-cde/` — **archived Tracks C/D/E** (ADR-028): the former `component-ii/` + `component-iii/` directories, the verbatim C/D/E tracker sections, their open §Q rows, and a `README.md` explaining what was deleted and how to recover it. Reference only.
- `docs/network/` — NETWORK epic (device monitoring + IT ticketing): Kate's `DevSpec_NetworkMonitoringTicketing_RISE8_072426.md` + `ITTicketingPlan_RISE8_072426.md`. **Kept separate from `component-ii/`** — network/IT tickets are deliberately not the maintenance pipeline (different assets, responders, and urgency model). Added 2026-07-28 when the merge revealed both docs sitting outside the convention (one at repo root).
- `docs/archive/StatusLog_RISE8_082526.md` — **the dated session blocks for 2026-07-13 → 2026-08-21**, moved out of
  this file's Current Status section on 2026-08-25 when it hit the 150 KB context limit. History, not a backlog.
- `docs/archive/` — superseded status docs (`CurrentUpdate`/`ProjectPhases`/`StatusSummary_RISE8_051826.md`).
- `docs/assets/` — screenshots + `connecteam-snapshots/` reference images.
- `docs/superpowers/{specs,plans}/` — epic specs + execution plans.

When changing scope or architecture: update the relevant doc and add an entry to `DECISIONS.md`.

---

## Current Status (update this section as work progresses)

**Keep this section small.** It is loaded into context every session, and this file has a **150 KB hard limit**
— it blew past it on 2026-08-25 at 171 KB and stopped loading. Rule: **the newest block in full, plus the
carry-forward of what is still open.** When you add a block, move the one it supersedes into
`docs/archive/StatusLog_RISE8_082526.md` (newest first) and fold anything still live into the carry-forward.

**As of:** September 3, 2026 (Eastern, derived — the harness clock runs ~12h ahead on this machine)

**🟢 DEPLOYED TO PRODUCTION. 33 commits pushed `0362798..bf8c564`, five migrations applied, the template
library filled from the real Connecteam forms, test data cleared.** 956 tests, clean typecheck + lint.
The single largest shipping day this project has had.

**📋 THE TEMPLATE LIBRARY IS REAL CONTENT NOW — 27 templates, 669 questions, extracted not typed.**
Every completed Connecteam checklist is auto-filed into Smartsheet as a PDF row attachment, and those PDFs
carry the full ordered question list. Three agents pulled 2–3 samples per template across different days and
submitters, unioned them, and the result was generated into `prisma/data/connecteam-questions.ts` by
`scripts/build-connecteam-questions.ts`. **Prompts are the operators' own wording and already bilingual
`English / Español`** — that is ADR-013 field-staff Spanish satisfied for free and better than machine
translation. **Do not send it for translation review.**
- **All 27 are `Draft (filled)`, none published.** Filling a template deliberately does NOT publish it: a
  Property Manager reviews the question set and publishes it themselves. That flow is the reason
  `publishedAt` exists (see below).
- ⚠ **Every question TYPE is INFERRED** from PDF rendering — Connecteam's real field definitions were never
  visible. 56 bare task lines became `PASSFAIL` (Kyle's call — it unlocks `failFlagsIssue`, so a missed task
  raises an Issue instead of sitting invisible). A question no sample ever answered seeded `required: false`;
  photos and signatures are exempt.
- **Checkpoints are THREE questions, not one three-photo question** — confirmed against a live Connecteam
  screenshot. Same prompt three times, separated only by a time sub-label, so each round carries its own
  `capturedAt` and geofence stamp. That sub-label needed somewhere to live → `Question.hint`.

**🔴 FOUR CORRECTIONS THAT OVERTURNED THINGS THIS FILE USED TO SAY:**
1. **"HK Review" and "Maintenance Report" are Smartsheet SHEET names, not Connecteam templates.** Global
   attachment search returns ZERO for both. The real forms are `Housekeeping Checklist` and
   `Maintenance Checklist`. Kyle said this on day one and was argued with using `prisma/templates.ts` seed
   data — which was itself a guess. **The seed was never evidence about Connecteam.**
2. **`812 PM PA Checklist` does not exist.** 110 attachments enumerated, zero Smartsheet-wide. Jacksonville
   North files the shared `AM PA Checklist` and has no PM PA form. Seeded as a **copy of 8700** on Kyle's
   instruction — so every question in it is a guess about what JN should do. **4645 was deliberately NOT the
   source: it genuinely omits the whole "Transforming Spaces" section (19 questions vs 22), which is the
   proof that keeping 28 separate templates was right rather than one template scoped to 8 properties.**
3. **`MAX_ROOMS_PER_CREATE` was 60 with a comment claiming that exceeded the biggest property.** False —
   measured: `KE 167 · KW 160 · LL 157 · DP 153 · SA 140 · OR 135 · JW 133 · JN 127`, 1,172 rooms, largest
   single zone **80**. At 60 it blocked a whole-property create *and* a single building. Now 200.
4. **The `n/NN` markers in those PDFs are PAGE numbers, not question numbers.** Anything sized from them is
   wrong; a template renders a different NN each day because photo questions accept multiple images.

**🏗 WHAT SHIPPED (all on `main`, all live):**
- **Two-axis template scope** — `TemplateScope` (what it is about) × new `InstanceMultiplicity`
  (`ONE`/`PER_ASSIGNEE`/`PER_TASK`). `subjectKindFor()` collapses them and **REJECTS** per-room + per-person
  rather than picking an axis. `PER_ZONE` was considered and **dropped** on Kyle's call, which removed a
  34-site audit. The old `perRoom` boolean is gone.
- **Batch create wizard** (`/checklists/new`) — N batches, subjects × dates, live name preview, confirm
  dialog, Save as Draft. The preview runs the **same** `planBatches`/`buildInstanceName` the server action
  runs, so what is approved is what is written. **`createInstanceManually` was DELETED** — an exported server
  action is a live HTTP endpoint, so a dead one is attack surface.
- **Naming (amends ADR-009)** — `{Template} {ShortCode} {ScopeToken} {MMDDYY}`, six digits so a checklist and
  its exported PDF agree. `systemId` untouched.
- **Publish state** — `publishedAt` null = draft (empty or filled), set + active = published, set + inactive
  = retired. Managers may **publish**, editing questions stays ADMIN-only.
- **Property picker** gained `All properties` / `All my properties`; **Issues** lost its duplicate "Open" chip
  and `WONT_FIX` as a settable status (enum value kept).
- **Network:** a re-arm sweep for OFFLINE devices with no ticket and no pending timer (creates timer *jobs*,
  not tickets, so the cron stays the only ticketing authority), an "offline with no open ticket" dashboard
  figure, and **device suppression** with an Acknowledge button on the ticket page.

**⚠ THE THING THAT MATTERS MOST: NOTHING HAS BEEN OPENED IN A BROWSER.** Not the wizard, not the 167-room
picker, not the confirm dialog, not the Publish button, not the Acknowledge panel, not a 38-question PM PA
form on a phone. 956 tests, clean types and lint are the **entire** evidence base for a day of UI work.
**The next real signal is somebody filling one checklist end to end on a real device.**


### Carry-forward — still live from earlier sessions (full history: `docs/archive/StatusLog_RISE8_082526.md`)

The dated session blocks for **2026-07-13 → 2026-08-21** were moved to
**`docs/archive/StatusLog_RISE8_082526.md`** on 2026-08-25 because this file had grown to
171 KB and stopped loading. Read that file before re-deriving anything about how a feature
got the way it is. Only the items below are still **open** — everything else there is history.

**Blocking the soft launch (content/config, not code):**
- **27 templates are `Draft (filled)` and NONE are published.** Nothing is usable by field staff until a
  Property Manager reviews and publishes each one. Review was ongoing as of 09-03.
- **0 recurring rules exist**, so the 5 AM cron generates nothing and every checklist must be hand-created
  through the wizard. `/rules` is built and empty. **`checklist_instances = 0`** — the test round's 9 were
  deleted 09-03 along with their 23 responses and 5 photos (the R2 objects are orphaned, deliberately).
- **4 templates have no Connecteam source and must be written by hand** — `Property Task Checklist`
  (seeded, empty) plus `Lock Installation`, `Stayable Renovation Completion` and `Daily Contractor`
  (parked under D22, not seeded, frequency/scope still Kyle's to set). Zero attachments anywhere for any
  of them. Note the last one cannot be contractor-*filled* — ADR-028 deleted contractor identity.
- **Four templates are stale or thin and should not be published without asking Ops:** `Monthly Pressure
  Washing` last filed **01 Jun 2026**, `Roof Preventive Maintenance` **01 May 2026**, `44199 Manager
  Checklist` **10 Apr 2026** (and on an archived "Copy of" sheet), `Due Out Room Walk` **8 PDFs all from
  the single day 07 Apr 2026** — an abandoned trial. Publishing a lapsed monthly puts work back on
  someone's schedule.
- **`812 PM PA Checklist` is a copy of 8700**, not JN's process. Wants a JN manager's eyes before publish.
- **`Unit #` extracted as `PHOTO`** on Arrival and Due Out — the PDF format implies photo, the semantics
  read like a text field. Two lines to change, on the two most-filled checklists in the estate. Unverified.
- **The 08/17–08/21 contractor week was never loaded** and its 2 files are still uncommitted (`scripts/sync-contractor-schedule-from-smartsheet.ts` + the snapshot). The reworked loader is in **no deploy**. Kyle runs the dry run: `pnpm dotenv -e .env.production.local -- tsx scripts/sync-contractor-schedule-from-smartsheet.ts`
- **Nobody owns the Monday contractor load and nothing alerts when it is missed** (§Q43).

**Decisions owed (Kyle/Kate):**
- **ADR-031 is double-claimed** — the close-out/stayover work and the Instant On uplink-flap branch both took the number. Settle it before either ADR is written.
- **Lockout disclosure** — five failures now confirms an address is a real account. My read is that it is acceptable here; reversible if Kyle disagrees.
- **Offshore reviewers can never read `VERIFIED`** — geofencing assumes on-property Florida staff, so this tester group cannot validate photo verification at all. No code fixes that.
- **Backfill the 92 null-duration MASS_OUTAGE tickets?** Deliberately not done — it moves the dashboard's average-downtime tile, which is a data decision.
- **Bea's `Export PDF` ask** — `/review/[id]` already HAS the button (`page.tsx:180`); only bulk/zip export is missing. Ask whether she means filled or blank printable PDFs before building.
- **`reviewLevel` on the new templates was a guess** — `MANAGER` for field-staff templates, `CORPORATE` for the 8 Manager Checklists, on the reasoning that a manager should not approve their own checklist.
- **Managers can PUBLISH but not EDIT templates** — the narrow reading of "PMs check the template and publish it themselves". If they should also edit the questions they review, it is a one-line change in `lib/template-access.ts`.
- **W7 contradicts CLAUDE.md's own ADR-013 line** — "hidden for CORPORATE/ADMIN (portfolio default)" is no longer true; portfolio roles now see the picker. Kyle asked for it; **the ADR-013 line above needs updating or the change reverting.**
- **`WONT_FIX` issues are unreachable from the list** — the chip is gone, so nothing surfaces them. Folding them into `Resolved` is one line.
- **§Q32–34 (UniFi reconciliation)** — devices that vanish from UniFi stay `OFFLINE` forever holding a ticket · Lakeland's console UI and API disagree · ONLINE-WINS hides 44 Orlando cameras a retired recorder calls offline. **None were "fixed"** on purpose.

**Security / ops debt:**
- **No session-revocation path.** `authorize()` re-reads the DB but the `session()` callback reads only the JWT, so deactivating a signed-in user leaves their 30-day cookie valid until expiry.
- **Starting passwords are derivable from the repo** — `rosterPassword()` = `"Ops"` + capitalised mailbox letters (`bea@` → `OpsBea`), in committed code. `mustChangePassword` + the new-device OTP are the only barriers. P1. **There is no `Stayable<Name>!` scheme; that memory is the admin password `StayableCheck`.** Three schemes exist: admin `StayableCheck`, corporate baseline `ChangeMe!2026`, everyone else `rosterPassword()`. `scripts/print-roster-credentials.ts` prints the real list.
- **`prisma/seed.ts:64` RESETS the admin password on every run** — `passwordHash` is in the *update* branch, so a seed silently un-rotates it. The corporate loop three lines below deliberately omits it with a comment saying why; the admin branch never got the same treatment. Raised 09-03, Kyle said "no worries" — recorded, not fixed.
- **Neon: autosuspend 5 min → 1 min and autoscale max → 0.25 CU are STILL not set** on `stayable-ops-prod`. The deployed cron change saves nothing until autosuspend is shorter than the poll gap ($19.35/mo → ~$10.15/mo). Plan changes happen at console.neon.tech under the **"Stayable"** org, not through Vercel.
- **Dev DB `ep-falling-moon` has been down since early August** — 0 users, 0 properties, no `contractor_update*` tables — so Preview is unusable and migrations are hand-authored.
- **`feat/instant-on-uplink-flaps` is not pushed** (~1,776 lines, 17 files, one machine) and its migration is unapplied. Zero flap tickets have ever been created; guest WiFi at JW/OR/KE/KW is unmonitored.
- **Write-amplification guard (B3)** — an unsigned probe still writes a row on both webhook receivers.

**Facts worth not re-deriving:**
- **The harness date is UTC-derived and runs a day ahead every evening.** Derive ET before dating anything. Migration directories keep their original stamp once applied to prod — renaming one manufactures drift.
- **The Vercel CLI IS installed** (54.18.3); the session-start hook claiming otherwise is wrong.
- **Prisma `in:` lists silently EXCLUDE a new enum value and `notIn:` lists silently INCLUDE it** — pinned by a test. This is why the stayover work added no new `InstanceStatus`.
- **Rollback is code-only** for the recent deploys (`vercel promote <url>`); the 08/22 migration is additive and nullable, so it stays.
- **Prisma's default interactive-transaction timeout is FIVE SECONDS**, and Neon autosuspends — so the first query in a script pays a cold start. A ~19-round-trip transaction died on `P2028` in production on 09-03. Batch the writes *and* raise `timeout`/`maxWait`; `maxWait` is what covers acquiring the connection at all.
- **The Connecteam question content lives in Smartsheet as PDF row attachments**, filed automatically on every completed checklist, and `pdftotext -layout` (already installed at `/mingw64/bin`) extracts it cleanly. That is how the library was built and how to re-check any prompt. Snapshots: `scripts/data/ConnecteamTemplates_*_RISE8_090126.json`.
- **There is no Connecteam MCP** and the Cloudbeds/Stayable Dashboard connectors have **no room-inventory tool** — room-level detail exists only for blocked rooms (`get_ooo_rooms`). The 1,172-room inventory already came from Cloudbeds via a one-time export on 2026-08-12. **§Q12 is stale** — the per-property keys exist, in the `dashboard.rentstayable.com` project.
- **An exported server action is a live HTTP endpoint.** A dead one is attack surface, not clutter — which is why `createInstanceManually` was deleted rather than left.

### Open questions awaiting answer
1. **Final list of recurring rules per template per property** — Owner: Property Managers. **Now the single biggest gap between "deployed" and "usable":** the templates exist and are filled, but nothing generates a checklist without rules, so every one has to be hand-created. The cadence per template IS known (Kyle's list: daily / monthly, and the per-property families are per-PA / per-PM), so this is mostly a matter of deciding which properties and confirming after publish — not a discovery exercise
2. SLA defaults per issue priority — Owner: Christopher — Needed by Week 4
3. ~~**Spanish translation reviewer**~~ — **largely moot for checklist content as of 2026-09-03.** Every extracted prompt is already bilingual in the operators' own wording (`English / Español`), so the 27 templates need no translation pass. Still open for UI strings the app itself renders
4. **Teams workspace inventory** — 1 corporate + 8 property channels w/ Incoming Webhook URLs — Owner: Kate — Needed by Week 7
5. **Stayable branding kit** — logo, palette, wordmark "Stayable Operations" — Owner: Kate — Needed by Week 7
6. ~~**Final CONTRACTOR-audience template list**~~ — Owner: Kate — **on hold**: contractor checklists themselves are in question (§Q31, ADR-028)
7. **Final geofence polygons per property** — Owner: Kate — Needed by Week 6

### Recently resolved decisions
- **Photo pipeline design locked** (ADR-015, decided 2026-06-05) — upload-at-submit via presigned PUTs (not at capture); GPS captured per photo batch at capture time; `GeofenceStatus.UNVERIFIED` for GPS-present/polygon-absent (Phase-6 backfill); **R2 has no object versioning** — keep-forever + scoped tokens are the deletion protection, Bucket Lock eval at Phase 8
- **Three open questions closed** (ADR-014, decided 2026-06-02) — (1) self-invalidation: field user can request w/ required note → **manager/admin approval** (pending state, both events audit-logged; shapes Phase 5 invalidation flow); (2) **bonus calc logic SCRAPPED from v1** — no Bonus field/logic anywhere; (3) **Spanish human review moved to Phase 8** (pre-training gate) — keep building/shipping machine-drafted ES per ADR-013 meanwhile
- **Auth v1 = login-only** (decided 2026-05-30) — no public `/signup`; admin-initiated provisioning lands Phase 2. Temp admin login `admin@rentstayable.com` / `StayableCheck` (rotate before prod). Resend wiring deferred.
- **Vercel ops default to Production** unless Kate explicitly says Preview (standing instruction, 2026-05-30)
- **Platform foundation decisions locked** (ADR-013, decided 2026-05-27) — bilingual EN+ES for field-staff surfaces only (admin/manager stay EN); multi-property users via `user_properties` w/ single global role; photos kept forever in v1; all UI datetimes display in ET regardless of user locale
- **Scope expansion: Contractor Checklists + Quick Tasks added to v1** (ADR-012, decided 2026-05-27). Build extends from 8 → 10 weeks; cutover slips from Week 12 → Week 14. Contractor auth via signed magic links (no accounts); Quick Tasks are lightweight ad-hoc, no review queue. Supersedes ADR-006 for these two modules only.
- Manager review UI patterns + 2-letter property short codes locked (ADR-011, decided 2026-05-27) — three-column single-submission review + table-with-thumbnails queue ship Phase 4, refined Phase 7; 2-letter codes (JN/JW/KE/KW/LL/OR/SA/DP) canonical everywhere
- Product name + Teams digest locked (ADR-010, decided 2026-05-27) — end-user name is **"Stayable Operations"**; auto-posted daily 7 AM ET digest to master corporate Teams channel + per-property channels; terse factual tone; Phase 7 priority (post-P0)
- All 8 property street addresses confirmed by Kate (2026-05-27); previous PRD address for Jacksonville West (6802 Commonwealth) was wrong — actual is 910 Suemac Road
- Recurring-rule control model + checklist instance naming locked (ADR-009, decided 2026-05-26) — Manager can create rules at own property w/ audit log; manual `rooms.status` for occupancy; no holiday calendar; one global 5 AM ET cron; ET-anchored daily sequence; system ID `CL-{propID}-{tmplCode}-{YYYYMMDD}-{seq}`
- Jacksonville North (812) is **in scope** as the 8th property — seed and geofence work plan for 8 (decided 2026-05-21)
- MFA: **on by default for managers/corporate**; optional/off-by-default for field staff; TOTP via authenticator app (no SMS) (decided 2026-05-21)
- ~~Rob sign-off on scope + budget: deferred (2026-05-21)~~ — **SUPERSEDED 2026-07-28: no Rob sign-off is required at all.** Kyle+Kate share decisions; Rob monitors the launched app only
- Subdomain: **ops.rentstayable.com** (decided 2026-05-20) — added to Vercel project, DNS records added, propagation pending
- Frontend version pinned: **Next.js 15.5.18** (held the line against just-released Next 16) (decided 2026-05-20)
- Phase 7 retitled "UI Redesign + Hardening" — Claude Design pass is milestone 1 (decided 2026-05-18)
- Auth approach: **Email + password for all users** (decided 2026-05-15)
- Smartsheet sync: **None during transition** (decided 2026-05-15)
- App naming: **TBD placeholder; subdomain decision deferred** (decided 2026-05-15)
- Stack: **Next.js + Vercel + Neon + R2 + Resend** (decided 2026-05-15)

---

## How To Work With Me (Claude Code) On This Project

1. **Start every session by re-reading this CLAUDE.md and `docs/SPRINT_PLAN.md`.** The current week section tells you what to focus on.
2. **Before writing code, verify which document is being implemented.** Cite the PRD section number in commit messages where applicable.
3. **When you complete a meaningful chunk of work, update the "Current Status" section above** with the date and what was completed.
4. **Flag scope creep aggressively.** If a request goes beyond the v1 scope in this file, say so and ask Kate to confirm before building it.
5. **Honesty over agreement.** If a request will cause problems, name them. Kate values pushback over rubber-stamping.
6. **Do not invent facts.** If you don't know something (a real number, a real person's title, a real API contract), say so. Verify before stating.
7. **Use the file naming convention** for any artifact written to disk that will be shared externally.
8. **Append to `docs/DECISIONS.md`** when making any architecture or scope decision worth remembering.

---

## Useful References

- **Connecteam Smartsheet workspace** (current source of truth, pre-cutover): https://app.smartsheet.com/browse/workspaces/WX7G4WxHVmh29m25qqF24WxGXv25FMrF2pqJ8421
- **Paycom** — handles HR, time tracking, payroll, shift scheduling
- **Microsoft 365** — Kate has admin access; available for future SSO expansion
- **Existing tech footprint:** Vercel free tier, Neon free tier, Resend free tier, rentstayable.com + rise8companies.com domains

---

*This file is a living document. Update it as the project evolves.*
