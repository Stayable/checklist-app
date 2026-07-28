# CLAUDE.md

This file gives Claude Code the persistent context it needs for the RISE8 Operations Platform project. Read this first in every session.

---

## What This Project Is

**RISE8 Operations Platform** — a custom web application that replaces the operational checklist functionality of Connecteam for RISE8 Companies / Stayable, while integrating with the existing Smartsheet ecosystem during transition (and archiving Smartsheet on cutover).

It serves field staff (Housekeeping, Property Attendants, Maintenance Technicians) and management (Property Managers, Corporate, Asset Management) across 7 Stayable extended-stay properties in Florida.

**As of 2026-07-07 (ADR-025), the project is three components, one codebase, built in parallel:**
- **I. Checklist App (StayCheck)** — the live Connecteam replacement (this doc's original scope + StayCheck v1.1).
- **II. Maintenance / Ticketing System** — intake (web form + `blake@rentstayable.com` email AI-ingestion; urgent/contractor WhatsApp front door) → human review → ticket vs. "concern" → work-order lifecycle → dispatch → close; Outlook sync. Absorbs the old "S7."
- **III. Construction Progress / Scheduling** — buildout/renovation PM (`docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`); **concept, gated on Rob's greenlight.**

`TODO.md` is now organized under `# COMPONENT I/II/III`. Building II and III is a scope expansion beyond the original checklist-replacement v1 — a budget/scope matter for Rob.

**Why it exists:** Field staff currently fill out checklists in Connecteam (a mobile app), then Karla and Christopher manually download the completed PDFs and re-upload them as Smartsheet row attachments while typing metadata. This consumes 1–2 hours/day of corporate staff time and loses photo/structured-response fidelity. The new platform is the single source of truth.

---

## Critical Project Decisions (DO NOT QUESTION OR RE-DEBATE)

These were settled during scoping. If a request seems to conflict with these, ask for clarification before proceeding — do not silently change direction.

### Scope
- **In:** Operational checklists, recurring schedules, bulk creation, photo capture with geofence verification, manager review/approval, issues pipeline, dashboards, PDF export on demand, email notifications, **Contractor Checklists** (ADR-012), **Quick Tasks** (ADR-012)
- **Out:** Time clock / time tracking (handled by Paycom), payroll/HR (handled by Paycom), shift scheduling (handled by Paycom), chat/messaging, hiring/onboarding, training, knowledge base, surveys, guest-facing features, native iOS/Android apps

**v1 build is 10 weeks** (extended from 8 per ADR-012) + 4-week parallel run. **Cutover target: Week 14.**

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

### Contractor Checklists (ADR-012, Phase 9 = Week 9)
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

- **Kate** — Director of Asset Management, product owner, project lead. Based in Sablan, Benguet, Philippines (UTC+8). Primary decision-maker on scope, UX, and product calls.
- **Rob Beyer** — CEO of RISE8. Sponsor and final approver on budget/scope changes.
- **Christopher Acoy Jr.** (`christopher@rentstayable.com`) — Operations support; backup for project decisions; currently uploads Maintenance Report data.
- **Karla Ysabelle Dugayo** (`karla@rentstayable.com`) — Operations support; currently does manual Connecteam-to-Smartsheet uploads. This burden goes away post-cutover.
- **Crystal Johnson** — Head of Operations. Owns the Maintenance Dispatch brief (`docs/component-ii/ProjectBrief_MaintenanceDispatch_062226.docx`) and **Component II (Ticketing/Dispatch) design** (ADR-025). Signs off ops/dispatch features before Rob.
- **Blake** — owner of the `blake@rentstayable.com` maintenance inbox (Component II email intake).
- **Primary developer** — Person executing the build using Claude Code.

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

**Repo layout (reorganized 2026-07-20):** root holds only `README.md`, `CLAUDE.md`, `TODO.md` + config/code dirs. All docs live under `docs/`:
- `docs/` (top level) — cross-component sources of truth: PRD, ARCHITECTURE, SPRINT_PLAN, DECISIONS, RUNBOOK, CHANGELOG.
- `docs/component-i/` — StayCheck / checklist-app docs (`StayCheckPRD_RISE8_070126.md`, `ChecklistTeamInterviewGuide_RISE8_060526.md`).
- `docs/component-ii/` — Maintenance/Ticketing docs (`MAINTENANCE_DESK_SPEC.md`, `MaintenanceTicketing{DesignReview,ScopingQuestions}_RISE8_070726.md`, `TicketingBriefDispatch_RISE8_070826.md`, `ProjectBrief_MaintenanceDispatch_062226.docx`, `IngestionEngineSketch_RISE8_070726.png`).
- `docs/component-iii/` — Construction docs (`ConstructionAgentBrief_RISE8_062026.md`).
- `docs/network/` — NETWORK epic (device monitoring + IT ticketing): Kate's `DevSpec_NetworkMonitoringTicketing_RISE8_072426.md` + `ITTicketingPlan_RISE8_072426.md`. **Kept separate from `component-ii/`** — network/IT tickets are deliberately not the maintenance pipeline (different assets, responders, and urgency model). Added 2026-07-28 when the merge revealed both docs sitting outside the convention (one at repo root).
- `docs/archive/` — superseded status docs (`CurrentUpdate`/`ProjectPhases`/`StatusSummary_RISE8_051826.md`).
- `docs/assets/` — screenshots + `connecteam-snapshots/` reference images.
- `docs/superpowers/{specs,plans}/` — epic specs + execution plans.

When changing scope or architecture: update the relevant doc and add an entry to `DECISIONS.md`.

---

## Current Status (update this section as work progresses)

**As of:** July 27, 2026
**🆕 NETWORK EPIC MERGED + DEPLOYED TO PROD; UniFi go-live scoped to KISSIMMEE WEST (2026-07-27, latest session):**
- **MERGED** `feat/network-monitoring` → `main` (`748fb37`, true merge, no conflicts) + docs commit `7f33da4`. Post-merge verification: **267/267 tests, typecheck clean, lint clean, prod build OK.** Migration `20260724184114_add_network_monitoring` **applied to the prod DB `ep-summer-cloud` by Kyle** (additive only — 6 tables, 7 enums, `ALTER TYPE` for `NETWORK_TECH`, no drops; DB first, then code, since new code reads the new tables). Prod deploy off `7f33da4`. **Rollback candidate: `vercel promote https://checklist-cevtb8h76-stayable-admins-projects.vercel.app`** (`ab6e736`, the pre-NETWORK prod HEAD).
- **ADR numbering reconciled:** ADR-025 (three-component restructure) ported from the contractor branch into `main`'s DECISIONS.md, so it reads 024→025→026. Closes pre-prod hardening item (g).
- **⚠ `/network` renders EMPTY in prod** — no devices/tickets exist and the poller isn't built. The deploy makes the section *exist*, not *show data*.
- **UniFi integration is PULL, not PUSH (decided 2026-07-27).** Kyle's `UNIFI_API_KEY` is a **Site Manager cloud key** — `GET https://api.ui.com/v1/hosts` → **200**, so Vercel can reach it; key is in `.env.local` + Vercel Production. This removes three unknowns the webhook design carried (payload shape, HMAC scheme, property routing). **Aruba deferred** (Kyle): `ARUBA_WEBHOOK_SECRET` stays unset → `/api/webhooks/aruba` deployed but fail-closed. Latency trade-off accepted: ~7 min worst case to ticket (poll interval + 5-min timer).
- **Live pilot scope = Kissimmee West (5399 / KW) only** — the one production console the current key can read (`state=connected`, 12 devices, all online).
- **Fleet ground truth** (unifi.ui.com screenshot + API): **19 consoles, 11 Network + 8 Protect NVRs, 15 online / 4 offline; all 8 properties covered. Cameras ARE on UniFi Protect** → closes `ITTicketingPlan` §7 Q3; camera monitoring comes free. Per-property ISP visible (Spectrum/Comcast/Frontier/Summit) → free ISP attribution later. Full property↔console table in `TODO.md`.
- **🚩 SIX PROBLEMS FLAGGED (N1–N6 in `TODO.md`):** **N1 (P0, blocking portfolio scope)** the API key sees only **5 of 19 consoles** — 4 "Invited" legacy + 1 owned hosted controller; no pagination, so it's account scope. **Confirmed: the account is not invited to the other sites; Kyle is chasing internally** (success = ~19 hosts). **N2** 4 decommissioned consoles still cloud-registered (SS-JAXWEST, SS-ORLANDO dupe, SS-StAugustine, hosting admin) → need an explicit exclusion list or they become permanent false outages. **N3** properties have multiple consoles (Network UDM + 1–2 NVRs) → mapping must be one-property-to-many-hosts. **N4 (P0)** stale-data trap: a disconnected console reports every device `offline`, so a naive status→PROBLEM map would have opened **~63 bogus tickets** — need a console-reachability gate (`UNKNOWN` not `OFFLINE`, one "monitoring blind" condition per property). **N5** Jacksonville North has NO Network console (2 NVRs only) — the real coverage gap. **N6** is there any Aruba in the estate at all? If not, delete the dead route.
- **✅ T11 UNIFI POLLER BUILT + DEPLOYED (2026-07-27, commit `5717397`).** Pull-based monitoring: `/api/cron/unifi-poll` (every 2 min) → `fetchUnifiSnapshot` → pure `decidePoll` → inventory upsert + transition events through the **existing `ingestWebhook` pipeline** (tickets/5-min timers/mass-outage/recovery-close untouched) + blind-console gate. Files: `lib/network/{unifi-hosts,unifi-poll,unifi-api,unifi-poll.server}.ts`. Migration `20260727150000_add_device_types_for_unifi_poll` **applied to prod by Kyle**. **317/317 tests (50 new), clean types+lint, build 31 routes.**
  - **N2/N3/N4 enforced in code, not deferred:** registry = explicit opt-in (4 dead consoles listed `monitored:false` with documented reasons; unknown hosts never monitored implicitly) · registry keyed by host so one property → many consoles · disconnected-OR-absent console ⇒ devices `UNKNOWN` not `OFFLINE`, no events, **one** auto-resolving monitoring-blind ticket, plus an "Unverifiable" dashboard tile and an explicit "empty state, not an all-clear" banner.
  - **Live dry run (no writes) before deploy:** KW → 9 SWITCH + 2 AP + 1 GATEWAY recorded, **0 events, 0 tickets**; the 63 stale-offline devices on dead consoles produced nothing.
  - **Judgement calls:** `DeviceType` widened (`SWITCH`/`GATEWAY`/`NVR`) since the fleet is mostly switches; **device identity = MAC** via optional `ParsedWebhook.deviceIdent` (rename-safe; webhook paths unchanged).
  - 🧑 **Follow-ups:** registry has no admin UI (code constant by design) · Protect NVR camera-level status unverified (no NVR host visible to this key) · webhook write-amplification guard still open (a probe POST to `/api/webhooks/aruba` does write a `RawWebhookPayload` row even when it 401s).

**🆕 NETWORK EPIC BUILT — FULL DEMOABLE CORE (2026-07-25, prior session):**
- **NETWORK monitoring + IT ticketing — Tasks 1–10 (minus deferred T8) DONE on branch `feat/network-monitoring` (HEAD `0f13dfc`, 12 commits, PUSHED to origin; NOT merged to main, NOT deployed).** Subagent-driven per the plan; every task spec+quality reviewed; **final Opus whole-branch review = READY (no Critical).** 267/267 tests, build 30 routes. Per-task detail in gitignored `.superpowers/sdd/progress.md`.
  - **Demoable core (no creds) T1–6:** schema/migration (`add_network_monitoring`, dev-applied, NOT on prod); pure event-mapping/ticket-number/mass-outage helpers; HMAC webhook receivers `/api/webhooks/{unifi,aruba}` (capture-before-trust, prod fail-closed); DB-cron `/api/cron/network-timers` (1-min) → 5-min auto-ticket + recovery-close; mass-outage (120s cluster→1 ticket, `pg_advisory_xact_lock` per-property, 10-min split→child tickets, cascade parent-close); `/network` UI (RBAC `canAccessNetwork`={NETWORK_TECH,ADMIN,CORPORATE}, nav group, portfolio dashboard, ticket list/detail+edit+audit, per-property, device history w/ recurring flag).
  - **Scaffold+degrade (creds-blocked) T7 Teams + T9 Spotipo WiFi:** message templates + config gate + honest SKIPPED/"not configured" (no fake calls); marked FUTURE seams. **T8 (Teams reply ingest) DEFERRED.**
  - **2 review-caught correctness bugs fixed mid-build** (P2002 ticket-number retry across poisoned tx; 3 mass-outage concurrency/atomicity gaps) + final-review cascade-close fix. **ADR-026** recorded (⚠ contractor branch holds ADR-025 — reconcile at merge).
  - 🧑 **NEXT / pending Kyle:** (a) **NETWORK demo-seed** — dashboards render EMPTY until sample devices/tickets seeded (offered); (b) open PR / decide merge; (c) PRE-PROD hardening before webhooks go public: write-amplification guard, cron `FOR UPDATE SKIP LOCKED`, crash-window reconciliation sweep, real UniFi/Aruba HMAC+payloads, Azure Graph + Spotipo creds; (d) confirm migration applied to the demo DB.
- **PROD ADMIN PASSWORD RESET (2026-07-25):** admin@rentstayable.com rotated to a known value via `scripts/set-admin-password.ts` against the prod DB (`ep-summer-cloud`) — the DB-split re-seed had reset it to `StayableCheck` and the earlier `StayableAdmin` rotation was on the OLD shared DB only. Login still requires the email OTP to admin@ inbox. 🧑 rotate to a memorable pw via `/profile`.

**🆕 S1 SHIPPED TO PROD + NETWORK EPIC STARTED (2026-07-25, later session):**
- **S1 (Review Workflow Upgrade) — DONE + LIVE IN PROD.** `main` `29abd81` (S1, 7 tasks) + `ab6e736` (review fix-wave); pushed; prod deploy **`checklist-cqkps9rrw` Ready/live** on ops.rentstayable.com (fix-wave `checklist-cevtb8h76` built after). Migration **`add_s1_review_upgrade` authored OFFLINE** via `prisma migrate diff` (dev DB has un-merged contractor drift from the `claude/rise8-...rv9B6` branch → `migrate dev` wanted a reset; sidestepped by diffing schema files, applying to dev out-of-band, and `migrate deploy` to the **prod DB `ep-summer-cloud` FIRST**, then pushing code). Built: `lib/review-lock.ts` (immutability in every mutation + submit), verify + admin-unlock, internal/staff **notify toggle** (approve off / flag on w/ dialog checkbox / verify off / re-do always), `review_verified` copy EN+ES, manual completion-check + `lib/completion-check.ts` hint, **checkout flags** (staff-capture bilingual `Checkout` ns → draft → submit gated by `collectsCheckoutFlags` → manager confirm/edit → lock-at-verify), `lib/room-label.ts` free-text room fallback everywhere. **Independent code review: NO criticals**; 2 minor fixed (gate `saveCheckoutFlags` on template; verify note→`managerNote`). 161/161 tests, build 32 routes. **Rollback:** `vercel promote https://checklist-oxril8x27-stayable-admins-projects.vercel.app`. 🧑 **Authed smoke-check owed:** login → open a checkout/Departure submission → flag block + verify/lock + admin unlock.
- **NETWORK epic (network monitoring + IT ticketing) STARTED** — Kate's `docs/network/DevSpec_NetworkMonitoringTicketing_RISE8_072426.md` **ported** onto the StayCheck stack (plan `docs/superpowers/plans/2026-07-25-network-monitoring-ticketing.md`; DevSpec was written standalone — own DB/Redis/JWT — all diverging tooling flagged, `Property` reused not duplicated). New `/network` section, sibling of ADMIN. **Decisions locked:** new `NETWORK_TECH` role; DB-`NetworkJob`+1-min-cron timers (no Redis). **Task 1 (schema+migration) DONE on branch `feat/network-monitoring` `a22407c`** (7 enums, Property Teams/Spotipo fields, Device/NetworkEvent/RawWebhookPayload/Ticket/TicketNote/NetworkJob; migration `add_network_monitoring` offline+dev-applied; `role-display` maps NETWORK_TECH→Admin). **NOT merged, NOT deployed.** NEXT: Task 2 (pure event-mapping + ticket-number + tests). Tasks 1–6 need no creds (demoable core); 7–9 cred-blocked (Graph/Spotipo). Open decisions: Graph-vs-ADR-010, Zoho-dropped ADR, Spotipo key encryption, `Ticket.assignedTo` free-text-vs-FK.
- **⚠ Dev DB (`ep-falling-moon`, shared local+Preview) carries un-merged drift:** the contractor-directory migration (`20260713164200`) from branch `claude/rise8-...rv9B6` + now S1 + NETWORK columns applied out-of-band. `prisma migrate dev` will keep wanting a reset — **author future migrations offline via `migrate diff`** (do NOT reset — it wipes the shared dev DB). Prod DB `ep-summer-cloud` is clean (S1 applied; no contractor, no NETWORK yet).

**🆕 PROD/DEV DB SPLIT DONE + S1 DESIGN LOCKED (2026-07-25, earlier session):**
- **PROD DB SPLIT — LIVE.** Production now runs on its OWN Neon project **`ep-summer-cloud-axmco63q`** (us-east-2, `neondb`); **Preview + local stay on the old shared dev DB `ep-falling-moon`**. Did: `prisma migrate deploy` (11 migrations) + core seed (**8 properties, admin + kate@ + bke@ CORPORATE, 9 placeholder templates, SLA, 0 instances, no demo data**) against the new DB; Vercel **Production** `DATABASE_URL`/`DIRECT_URL` repointed (Preview re-added w/ the dev value — ⚠ **removing a var from one environment drops ALL its bindings**, re-add each explicitly); redeploy `checklist-elgpiqjdp` aliased to ops.rentstayable.com, verified `/login` 200 + `/review` 307 + `/api/auth/session` 200. **`CRON_SECRET` added by user + redeployed → 5 AM cron now ENABLED but a no-op until recurring rules exist.** Prod conn strings live in gitignored **`.env.production.local`** (future prod migrations: `prisma migrate deploy` sourcing it). **Rollback:** `vercel promote https://checklist-4gwsbzke8-stayable-admins-projects.vercel.app`. Runbook updated (§Splitting the Production DB). **🧑 POST-CUTOVER TODO:** re-rotate admin pw (seeded `StayableCheck` again on the new DB); kate/bke rotate `ChangeMe!2026` via `/profile`; **OTP emails go to the `@rentstayable.com` inboxes**; old prod sessions invalid → re-login; **user to verify login** (admin@ / StayableCheck + OTP → sees 8 props + kate/bke).
- **SEED HARDENED** (`98ea68c`): demo users/rooms/instances gated behind `SEED_DEMO=1` (default seed = safe baseline only; no longer resurrects the deleted Lakeland users); kate@/bke@ added as CORPORATE baseline (upsert never clobbers a rotated password).
- **S1 (Review Workflow Upgrade) DESIGN LOCKED** — Kate answered the design queries (`docs/StayCheckS1DesignQueries_RISE8_072426_reviewed.md`): **Q1** completion-check = manager-manual; **Q2** flags = **staff-capture-at-fill → manager-confirms** (⚠ bigger build: flags become field-facing → **bilingual EN+ES** + new template flag `collectsCheckoutFlags` to scope where they appear); **Q3** = dedicated columns; **Q4** = admin-only unlock (audited); + **internal-note toggle** (not all review notes notify staff; Re-do always does). Plan LOCKED at `docs/superpowers/plans/2026-07-24-s1-review-workflow-upgrade.md` (7 tasks, subagent-driven). **NEXT: S1 Task 1 = schema + migration `add_s1_review_upgrade`.**
- **ADRs 018–021 recorded** (`6bfb1eb`, DECISIONS.md — AppShell / email-OTP+trusted-device / template authoring / dashboard+reports+PDF; shipped earlier, were undocumented). **`lib/rbac.test.ts` added** (`78ec971`, 9 cases — authz core: role predicates + property-scope). **IT Ticketing plan** (`docs/network/ITTicketingPlan_RISE8_072426.md`) — **ON HOLD**, Zoho Desk backend deferred, **UniFi API confirmed**, Kate to send a spec `.md`; kept separate from S7 maintenance ticketing.
- **Commits on `main` (NOT pushed):** `98ea68c` seed · `78ec971` rbac test · `6bfb1eb` docs. Prod cutover was via `vercel redeploy` (not a git push), so `main` is ahead of the deployed code by these 3 doc/test/seed commits (no runtime impact). Next session: `/resume`, then S1 Task 1.
**🆕 REVIEW-FINDING FIXES + PASSWORD FEATURES + TEST-USER BASELINE — ALL DEPLOYED TO PROD 2026-07-24:** Two prod deploys off `main` this session (both READY on ops.rentstayable.com; verified `/login` 200 + authed routes 307, no 500s).
- **Deploy 1 (`79db4e8`, `dpl_9Br7chEv2…`):** cleared 9 "Deferred-minor" review findings from Plans 2–5 — template builder stable `_uid` keys (was `key={i}`); `set-admin-password.ts` reads pw from env/arg (no hardcoded literal; **⚠ old literal still in git history — the live pw rotation is separate**); `/completed` real pagination (was silent 200-cap); issues report bounds `createdAt` by ET day starts (`etDayStartUtc`/`nextYMD` in `lib/datetime.ts`); dashboard **"Checklists with issues"** tile (6th); PER_ROOM client guard (server already rejected); `/review` rows `title ?? template.name`; PhotoFigure `!= null` guard + alt; IssuesPdf cell truncation. Cherry-picked onto `main` (T1 contractor dir stayed on branch, NOT shipped). **Deferred w/ rationale:** AUTH_SECRET split (Phase 8), OTP resend-cap (negligible risk).
- **Deploy 2 (`c8f4ae2`, `dpl_86PyQ5kG…`):** **admin Set-Password** (`setUserPassword` in `app/admin/users/actions.ts` + inline "Set PW" in `/admin/users`; `validatePasswordStrength` min-8 in `lib/password.ts`, tested) + **self-service `/profile`** (view name/email + change own password, `changeOwnPassword` verify-current→validate→set, audit `change_password`; **bilingual EN+ES** `Profile` namespace w/ client error-code mapping per ADR-013; User-icon link in shell sidebar + mobile bar). 133/133 tests, build 32 routes.
- **Admin password ROTATED by user** (via `/admin/users` reset) — the old `StayableAdmin` is retired.
- **User baseline set on the shared prod DB:** deleted `manager.lakeland`; **wiped+deleted `hk.lakeland` (8 seeded demo checklists + responses/photos gone)**; created `kate@rentstayable.com` + `bke@rentstayable.com` as **CORPORATE** (temp pw `Test-0xzYTtuG`, shared — rotate via `/profile`). **⚠ `db:seed` still re-creates the Lakeland users** — update `prisma/seed.ts` or split the DB so deletions stick.
- **`main` == origin == prod HEAD `c8f4ae2`.** Feature branch `claude/rise8-operations-platform-rv9B6` still holds Component II T1 (contractor dir), NOT deployed, ahead of main on that work.
**As of:** July 13, 2026
**🆕 COMPONENT II — T1 CONTRACTOR DIRECTORY BUILT (2026-07-13, commit `0f86b2b`, branch only, NOT deployed):** First code of Phase II.A. **Kyle decided to build ahead of the sign-off chain** (start now, deploy is a separate call). Shipped **T1 — L0 Contractor directory**: `Contractor` + `ContractorProperty` + `Trade` enum; `Contractor.userId` nullable-unique link to `User` so one person is BOTH staff and contractor (Jesús Pérez). `/contractors` route (manager-or-above, property-scoped, mirrors `/templates`): list + create/edit + archive, nav between Issues & Rules. Actions Zod+audit+scope-enforced (scoped mgrs limited to own props; req ≥1 trade, ≥1 property, WhatsApp-or-phone). `lib/contractors.ts` labels/order + tests. Seed = 4-contractor roster w/ **PLACEHOLDER** numbers (real PII held until DB split; enter via UI). Migration `20260713164200` additive (safe for live reads on shared Neon DB). **134/134 tests, clean types+lint, build 31 routes.** **Decisions (Kyle 2026-07-13):** dispatchers **reuse `MANAGER`** (no new role); **T4 dispatch message includes a magic-link** (pull Phase-9 signed single-use link fwd). **Next: T2** — lean contractor job record (property/room/trade/problem/photos/URGENT/status; reuse R2 photo pipeline; manual-create by dispatcher). **Still open (non-blocking T1–T3):** separable-scheduling assumption (T6) + Gerardo's emergency-classification rule (T5 auto-notify; MVP = manual URGENT toggle). Sign-off chain (Kate→Crystal→Rob) + Top-8 still outstanding but no longer blocking the branch build.
**🆕 COMPONENT II — KATE RECONCILED, ROUTING TO CRYSTAL (2026-07-08):** Kate completed **Part 1** of `MaintenanceTicketingDesignReview_RISE8_070726.md` (design reconciliation). Settled: issues/work-orders lifecycle lives in **Ticketing** (checklist app *emits*, Ticketing *owns*; migrate+retire `/issues`); recurrence = **≥2× same room+similar in 60 days**; completion-check stays (feeds bonuses) but bonus field stays dead (ADR-014); OOO/deposit/replacement flags stay in checklist dashboard (only maintenance→tickets); tenant-form photos may be normal uploads; checkout = queue-then-schedule. **Two Kate micro-decisions open:** (1.2) I/II ownership → routed to Crystal; (1.3) "remove corporate–admin" → working interpretation **CORPORATE→"Manager"** display (role stays in DB; Corporate = portfolio manager w/o sysadmin, per `lib/rbac.ts`: ADMIN-only = `/admin` console + user provisioning + all-property templates) — confirm w/ Kate. **Intake expanded to TWO mailboxes:** `admin@` + `blake@` (Graph consent needed on both; `admin@` is also the app admin login). **Construction (III) greenlight MOVED to Crystal's ops input** (design-review §2.3 + brief §4.3) — was gated on Rob's `ConstructionAgentBrief §5`; Rob now budget-only. ⚠ Record as ADR when the chain closes. **🔧 WORKFLOW CORRECTED (Kyle 2026-07-08) — intake model in the spec was wrong:** tenant maintenance comes via **TurboTenant + Jotform → Smartsheet** (current tracker), NOT the email desk. **Property managers** own triage/assignment/daily scheduling (Connecteam today, urgency order; emergencies → that day's checklist). **Gerardo & Jesus schedule CONTRACTORS** downstream only — NOT maintenance triage. The `admin@`/`blake@` email desk is an **additional** channel (catches often-missed maintenance emails) — one lane, not the whole intake. Component II consolidates TT + Jotform + email + checklist issues into one queue (replaces the Smartsheet maintenance tracker). Property emergencies needing a contractor → Teams chat (Shayla Shane, Shay Harper, Kyle, Gerardo, Jesus). Docs corrected: design-review Background/§2.1 + desk-spec top note. **Emergency-contractor process + seed roster captured in TODO II.5** (2026-07-08): Crystal/Shayla flag on Teams → Gerardo/Jesus reach contractors via WhatsApp/phone; call contracted first (**Orlando Torres, direct hire, plumbing**); common emergencies = plumbing (Orlando Torres, Arlis Velázquez) + electrical (Jesús Pérez, Cristina de León). **⏳ PENDING (Gerardo): who judges + how an issue is classified emergency** (drives URGENT-flag/auto-notify). My emergency-dispatch design rec (Layer 0 directory → 1 one-tap WhatsApp/SMS deep-link → 2 two-way API + escalation → 3 auto-reschedule) in TODO II.5.
**Ops input SPLIT into two briefs:** (a) **`TicketingBriefDispatch_RISE8_070826.md` — RE-SCOPED 2026-07-08** to contractor scheduling + construction + emergency-contractor flow (Gerardo & Jesus); §0 self-serve claude.ai → `TicketingAnswersDispatch_…md`; **ready to send, NOT sent** (caught the wrong-scope version before it went out). (b) **PM-facing maintenance-intake brief — TO DRAFT** (recipient TBD, Q2 open): TT + Jotform + email → triage → assign → daily schedule → emergency-to-checklist. **Crystal oversees/signs off Stage 2**; both reconcile up to her → Rob (budget-only).
**🆕 COMPONENT II RE-SEQUENCED (Kyle 2026-07-08) — Contractor Dispatch MVP FIRST:** ship the contractor side first (most-independent, sharpest pain) as a **module in the existing platform** (not a separate app — ADR-025). New **Phase II.A** in TODO: L0 contractor directory (seed roster; a person can be staff+contractor — Jesús) → minimal contractor job → L1 one-tap pre-filled WhatsApp/SMS/tel dispatch (contracted-first) → emergency flag+alert → contractor calendar w/ auto-reschedule → L2 WhatsApp Business API two-way + escalation (needs Meta verification + Rob cost decision). **Channel confirmed (Kyle 2026-07-08): contractors use WhatsApp ONLY** (WhatsApp is the rail, no SMS; phone = emergency first-touch to contracted Orlando Torres). **Internal MTs get maintenance info on Smartsheet** (PM/intake side + Smartsheet-retirement concern, not the contractor MVP). Then II.1 ticket model → II.2 tenant intake (TT+Jotform) → II.3/4 email desk+triage → II.5 dispatch loop. **⚠ Assumption to confirm:** contractor scheduling is separable from the internal daily maintenance schedule (in Connecteam, which Component I already replaces). **ai-codex-starter (FieldOps WhatsApp agent) is NOT in this repo** — reference-only Python prototype (construction brief); to reuse its design, point me at that repo. **Still nothing built** — blocked on the sign-off chain + Top-8 + the separable-scheduling + Gerardo's emergency-classification answers.
**🆕 PROJECT RESTRUCTURED INTO 3 COMPONENTS (2026-07-07, ADR-025):** I. Checklist App (StayCheck) · II. Maintenance/Ticketing · III. Construction Progress/Scheduling. All parallel; III gated on Rob. `TODO.md` reorganized under `# COMPONENT I/II/III`; old StayCheck "S7 — Maintenance Ticketing" moved to Component II (II.1). Component II intake confirmed: web form + `blake@` email AI-ingestion + urgent/contractor WhatsApp → human review queue → ticket vs. concern (payments/refunds/extensions = concerns). Building II/III = scope expansion beyond checklist v1 (Rob's call). **Component II build must open with a brainstorming/spec pass before code.**
**🆕 COMPONENT II SPEC PASS COMMITTED (2026-07-07, commit `447d542`):** the restructure + 3 ticketing docs (uncommitted from a prior session) analyzed, reconciled into `TODO.md`, and committed. Docs: **`MAINTENANCE_DESK_SPEC.md`** (MS Graph email/form desk → Claude triage → `maintenance_tickets`/`maintenance_messages` → reply-as-`blake@`; **replaces Zoho Desk**), **`MaintenanceTicketingDesignReview_RISE8_070726.md`** (staged Kate→Crystal→Rob sign-off GATE), **`MaintenanceTicketingScopingQuestions_RISE8_070726.md`** (§A–§M + Top-8 blockers), `IngestionEngineSketch_RISE8_070726.png`. TODO Component II now carries Phase II.0 sign-off gate + the **migrate+retire-`/issues`-into-Ticketing** decision (recommended, pending §A2/A3 sign-off). **⚠ Prototype `lib/maintenance/{filter,triage,graph,db}.js` + `SENDER_CATALOG.md`/`SenderFilter_Blake_070226.xlsx` are marked `[BUILT]` but live OUTSIDE this repo — must be ported.** Spec's model `claude-sonnet-4-6` isn't real → use Sonnet 5. **New people:** Crystal Johnson (Head of Ops, Component II design owner) + Blake (`blake@` inbox) added to People. **Nothing built yet — blocked on the sign-off chain + Top-8 (esp. Graph consent + prod/dev DB split).**
**🆕 STAYCHECK v1.1 S0 STARTED (2026-07-02) — foundations + Resend wiring committed (NOT deployed):** New epic `StayCheck v1.1` (spec `docs/superpowers/specs/2026-07-02-staycheck-v1.1-adaptation.md`, 10 phases S0–S9). **S0 code DONE + committed** (`ee31c09`): ADRs **022** (Cloudbeds manual-first adapter) / **023** (keep 6-role DB enum + 3-role display grouping) / **024** (rename **Stayable Operations → StayCheck**, supersedes ADR-010 naming) now in DECISIONS.md; `lib/role-display.ts` (6→3-role display map, tested, label-only never-for-authz); **StayCheck rename** across all user-facing surfaces (message catalogs EN/ES, page titles, `app.webmanifest`, apple-web-app title, offline page, icon aria-labels, shell wordmark; throwaway `/ios-spike` left alone); **`ChecklistInstance.bonusEligible` dropped** from schema (ADR-014, dead everywhere). **Resend delivery wired** (`0130c3b`): the 4 events that had `SKIPPED`/`resend_deferred` rows now actually send — `review_approved/flagged/redo`→submitter + `issue_assigned`→assignee, via `lib/email.ts sendEmail()` + bilingual `lib/notify-copy.ts` (ADR-013) + `lib/notify.server.ts` (delivery is post-commit and never fails the user action; EMAIL row settles SENT/FAILED/SKIPPED). **129/129 tests, clean types+lint, build 30 routes. ✅ DEPLOYED TO PROD 2026-07-02:** FF `main` `9015c34→ddf1ac5`, prod deploy `dpl_HURDNW5Z…` READY on ops.rentstayable.com (`/login` 200, `/review`+`/issues` 307, no 500s). Migration `20260702221150_drop_bonus_eligible` **applied to the shared prod DB** (deployed new code FIRST so live `SELECT`s didn't break on the dropped column). Rollback candidate `dpl_CSpBWxS…` (`9015c34`). **🧑 STILL BLOCKING (needs you):** **prod/dev DB split** — hard-block for Cloudbeds cron / S3 + real go-live; runbook written at `docs/RUNBOOK.md §Splitting the Production DB` (needs Neon console + Vercel Production env write — not doable from Claude Code here). **Scope note:** submit→manager email, activation email, unassigned-digest are **net-new** (not `SKIPPED`-flip), deferred.
**Phase:** **Phases 4–5 + Plans 1–5 ALL LIVE IN PRODUCTION** at **https://ops.rentstayable.com**. **Plans 2–5 (auth/OTP, template builder, completed view, dashboard/reports/PDF) MERGED + DEPLOYED 2026-06-27** — `main` FF `2a55336 → 75e6cc1`, prod deploy `dpl_ucHh8…` READY. **✅ Email-OTP validated live in prod 2026-06-27** (`RESEND_API_KEY` + `RESEND_FROM_EMAIL` set in Vercel Production by user; admin login attempt → `notification_log` `otp_login`=**SENT** + code received in inbox). Untrusted-device OTP path round-trips. Rollback candidate `dpl_D1uttknKL5…` if needed.
**Current week:** Week 5 (Recurrence). Phase 4 remaining: alpha demo for Rob.
**🆕 BIG EPIC SCOPED + STARTED (2026-06-23) — "Shell + Auth/OTP + Checklist Authoring":** Kate requested a desktop/responsive redesign + a large feature set. **Spec:** `docs/superpowers/specs/2026-06-22-ops-shell-and-checklist-authoring-design.md` (introduces ADR-018 shell / ADR-019 email-OTP+30d-trusted-device / ADR-020 template authoring+property-scoped templates / ADR-021 reports+dashboard+PDF — **none recorded in DECISIONS.md yet**). Decomposed into **7 sequential plans** (build order in spec §8). **Locked decisions:** left-sidebar desktop + bottom-bar mobile shell; password + **email OTP for ALL users w/ 30-day trusted-device** (needs Resend key); template builder **ADMIN + MANAGER** (mgr scoped to own properties); manual-create = immediate (no cron), auto-create stays 5 AM ET; templates declare which properties (specific list OR "All"); property scope = global header filter; mark-opened stamps `openedAt`+IN_PROGRESS (resume = same-device, already works); photos need reliable client-capture timestamp (geo already captured); **hard-delete 9 placeholder templates LAST, row-count-confirmed**.
**🟢 PLAN 1 DONE (2026-06-23) — Unified AppShell + property scope:** plan `docs/superpowers/plans/2026-06-23-plan1-appshell-and-property-scope.md`; executed subagent-driven (8 tasks, each spec+quality reviewed, final whole-branch review on Opus = READY TO MERGE). Built: `lib/nav.ts` (role-aware nav, tested) + `lib/property-scope.ts` (`resolveScopedPropertyIds`, tested); `components/shell/{AppShell,ShellChrome,PageHeader}.tsx`; mounted in root layout; Home/admin/review/issues/rules migrated into the shell; review/issues queries narrowed by active property; **retired `components/AppNav.tsx`+`BottomNav.tsx` (deleted)**. **73/73 tests, clean types+lint, build 19 routes. Pushed to branch (HEAD `c8d88bf`).** NOT merged to main.
**⛔ PLAN 1 MERGE GATE (in progress):** Kate wants to review the shell on a **branch Preview** before merge. Preview scope lacks the app env vars, so the authed shell can't render there. **Waiting on Kate to add to Vercel PREVIEW scope:** `AUTH_SECRET`/`DATABASE_URL`/`DIRECT_URL` (min — shell on Today/Rules/Admin) + 4× `R2_*` (so /review+/issues don't 500). Once added → re-trigger branch Preview build → Kate visual sign-off → merge. Branch alias: `checklist-app-git-claude-rise8-1ced42-stayable-admins-projects.vercel.app`.
**🟢 PLAN 2 DONE (2026-06-25) — Auth/OTP + trusted device + user hard-delete + admin pw:** Resend creds set by user → built subagent-driven (7 tasks; **two Opus security reviews** — Task 4 crux + final whole-branch — both: end-to-end **invariants HOLD**, no session-bypass, no code/password leak; two fix waves incl. the I-2 lockout-metering regression). plan `docs/superpowers/plans/2026-06-25-plan2-auth-otp-userdelete.md`. Built: `resend` + `lib/email.ts` (bilingual OTP); `login_otps`; pure `lib/otp.ts` (sha256+pepper, attempt-cap, TTL) + `lib/trusted-device.ts` (HMAC token, 30d); `authorize` enforces password + (trusted-device token OR verified+consumed OTP) with no bypass + fail-closed on empty AUTH_SECRET + `registerSuccess` only post-2FA; `app/login/actions.ts` (requestLogin/submitOtp/resendOtp, both session paths via `signIn`, lockout metered in pre-check, generic errors); two-step bilingual login UI; `deleteUser` **block-if-history** (decision 2026-06-25, no audit_log FK change) + Delete button; **admin pw rotated `StayableCheck`→`StayableAdmin`** on shared DB. **119/119 tests, clean types+lint, build 30 routes. Branch HEAD `24d073c`. Pushed. NOT merged.** **⚠ MERGE GATE:** validate a REAL OTP email send on a branch **Preview** (needs `RESEND_API_KEY`+verified-from in Vercel **Preview** scope) before flipping prod — the untrusted-device path is unexercised until a live send round-trips. **Deferred-minor:** AUTH_SECRET triple-purpose (Phase 8); OTP cap resets on resend (needs correct pw); `set-admin-password.ts` has plaintext in git (rotate after first login).
**🟢 PLAN 3 DONE (2026-06-24) — Template builder + manual create:** plan `docs/superpowers/plans/2026-06-24-plan3-template-builder-and-manual-create.md`; subagent-driven (7 tasks, each spec+quality reviewed; final whole-branch review on Opus = READY w/ fixes; fix wave applied). Built: schema `TemplateProperty` join + `ChecklistTemplate.allProperties` + `ChecklistInstance.title` (additive migration `…template_properties_and_instance_title`, applied to shared DB; 9 placeholders set `allProperties=true`); pure helpers `lib/template-code.ts` (unique ≤8-char code) + `lib/template-access.ts` (ADR-020 `canManageTemplate`/`templateAppliesToProperty`, tested); template CRUD actions w/ dual-state RBAC + audit (`app/templates/actions.ts`); `/templates` editable builder + list (property-scoped, role-aware) + `/templates/new` + `/templates/[id]` + `/admin/templates`→redirect; `/checklists/new` immediate manual create mirroring ADR-009 seq (P2002 retry); nav: Templates moved into manager nav; instance label `title ?? buildHumanLabel`. **95/95 tests, clean types+lint, build 23 routes. Branch HEAD `2222048`. Pushed. NOT merged** (held with Plan 1 for Kate Preview sign-off). **⚠ Two Kate decisions:** (a) manager template edit-scope is CONSERVATIVE — managers cannot edit All-properties or cross-property templates (only ones fully within their own props); (b) CORPORATE template-authoring is broad (any non-all-props template) — **record both in ADR-020** (ADRs 018–021 still not in DECISIONS.md). **Deferred to Plan 4 builder polish:** question-row `key={i}`→`_uid`; PER_ROOM client empty-room guard; custom title in Today/queue list rows.
**🟢 PLAN 4 DONE (2026-06-24) — Completed view + Home revamp + mark-opened/resume + photo timestamp/geo:** plan `docs/superpowers/plans/2026-06-24-plan4-completed-home-resume-photometa.md`; subagent-driven (7 tasks, each spec+quality reviewed; final Opus review = READY, no Critical/Important; 2 fixes incl. an ADR-013 i18n regression caught+fixed). Built: additive `Photo.capturedAt`; `lib/mark-opened.ts` + `markOpened` action (race-safe conditional `updateMany`, server-side assignee check) wired into the fill client mount → stamps `openedAt`+IN_PROGRESS on first open (no conflict with submit's `openedAt ?? now`); client photo capture-timestamp threaded capture→draft(`photoTimestamps`)→submit→`Photo.capturedAt` (legacy-safe, index-aligned); shared `components/review/PhotoFigure.tsx` shows ET capture time + coords + geofence badge on review detail; `/completed` MANAGER+ browser (property/date/assignee filters, rows→`/review/[id]`); Home revamped (To-do/Done today + Recently-completed + Resume CTA, all i18n EN+ES); nav Completed. **102/102 tests, clean types+lint, build 24 routes (verified). Branch HEAD `fe87603`. Pushed. NOT merged** (held with Plans 1+3 for Kate Preview sign-off). **Deferred-minor:** PhotoFigure `!==null` coord guard + positional alt; CompletedFilters `key={params}`; `/completed` 200-row cap (no pagination).
**🟢 PLAN 5 DONE (2026-06-25) — Manager dashboard + reports + PDF:** plan `docs/superpowers/plans/2026-06-25-plan5-dashboard-reports-pdf.md`; subagent-driven (7 tasks; Tasks 1–3 individually reviewed, Tasks 4–7 built in a time-boxed burst then covered by a final Opus whole-branch review = READY w/ fixes; fix wave applied). Built: **`@react-pdf/renderer@4.5.1`** added (de-risk-gated Task 1: React-19/Turbopack-clean, `serverExternalPackages`); `lib/reports.ts summarizeCompleteness` (tested); `/dashboard` (5 property-scoped alert tiles: completion% / incomplete / overdue / unassigned / open issues); `/reports/completeness` + `/reports/issues` (property/date/status/priority filters, `ReportsNav`/`ReportFilters`/`ParamSelect`); single-checklist PDF `/api/checklists/[id]/pdf` (responses, photos w/ ET capture-time+geo, signatures, start/complete; Node runtime, `auth()`+401/403, `Uint8Array` body) + report PDFs `/api/reports/{completeness,issues}/pdf` (query-parity w/ screens); nav Dashboard + Reports. **109/109 tests, clean types+lint, build 30 routes. Branch HEAD `24b4585`. Pushed. NOT merged** (held with Plans 1+3+4 for Kate Preview sign-off; branch now **31 commits ahead of main**). **Deferred-minor:** PDF table cell truncation; ET-exact issues `createdAt` bound (currently UTC-day inclusive).
**⏭ PLANS 6–7 (next):** 6 = recurrence polish (after Kate reviews `/rules`); 7 = template hard-delete (LAST, row-count-confirmed). **PDF infra (`lib/pdf/*`, `renderPdfToBuffer`) now exists for reuse.**
**🔀 Branch state (2026-06-27):** branch `claude/rise8-operations-platform-rv9B6` == `main` == prod HEAD `75e6cc1`. Plans 2–5 FF-merged to `main` and deployed 2026-06-27 (only CLAUDE.md/TODO.md conflicts on the back-merge, resolved). Plan 1 (AppShell) + Phase 5 recurrence had already been in prod since 2026-06-23 (`b55e073..9cf069d`). **Enabling-gate CLEARED:** `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set in Vercel Production by user; live OTP send validated (SENT + received). Start next work fresh off `main` or keep using the branch (they're even).
**🟢 Phase 5 progress (2026-06-20):** DONE — pure recurrence engine (`lib/recurrence.ts`, 17 tests: patterns + scope + ADR-009 ID/label); additive migration `20260620133914` (scope/effective-window/skip-days/creator on `recurring_rules`, applied to shared DB); `lib/recurrence.server.ts generateForDate()` (idempotent per template/property/room/date, smoke-tested live); `/api/cron/generate-checklists` + `vercel.json` cron `0 9 * * *`; `/rules` management UI (list + create form + Pause/Activate/Force-create/Delete, all audit-logged, RBAC via `canAccessProperty`). NOT DONE — bulk-create UI; ADR-014 invalidation/approval flow; unassigned digest (Resend-blocked). **Build green: 18 routes, 61/61 tests, clean types+lint.**
**⚠ Phase 5 cron — now in prod but INERT (safe).** Merge brought `/api/cron/generate-checklists` + `/rules` to prod. The cron route is **fail-closed in production** (commit `9cf069d`): unset `CRON_SECRET` → rejects every request (was "open when unset" — fixed). So nothing auto-generates yet. 🧑 **To actually enable 5 AM generation:** set `CRON_SECRET` in Vercel Production — but FIRST split prod/dev DB (prod still shares the dev Neon DB w/ placeholder content; you don't want auto-gen firing against that). Cron schedule `0 9 * * *` UTC = 5 AM EDT / 4 AM ET winter.
**🔴 PROD/OPS NOTES (read before deploying again):**
- **DB:** Production uses the **same Neon DB** as local dev (`ep-falling-moon-apwovbb3`) — seeded test users + PLACEHOLDER question content. Fine for review, NOT go-live. Because prod shares the DB, **migrations applied locally hit prod's schema too**.
- **R2 envs:** the 4 `R2_*` vars (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`) are **in Vercel Production** (added 2026-06-19, all Encrypted; piped from `.env.local` via `vercel env add`; **re-verified present 2026-06-20** via `vercel env ls production`). NOT in Preview — if branch-preview testing of `/review`/`/issues` is ever wanted, add them to Preview too. Bucket is still `rise8-ops-staging` (no clean prod bucket yet — fine for alpha, revisit before real go-live).
- **Login outage fix (2026-05-30):** prod `DATABASE_URL`/`DIRECT_URL` were empty → Prisma threw → NextAuth `Configuration` error. Set via `vercel env add ... production --force`. Sensitive vars read back as `""` — normal.
- **Verify via Vercel deploys, not `pnpm dev`** (standing preference 2026-06-15). Push → feature branch = Preview, `main` = Production.
- **Build runs `prisma generate` (fixed 2026-06-15, commit `8e64cfa`):** Vercel restores a stale build cache and won't regenerate the Prisma client on its own, so builds type-checked against an outdated client and failed (`_count.rooms`, and would have broken `Photo.issueId` at runtime). `build` script now prefixes `prisma generate`. Don't remove it.
- **Temp admin `admin@rentstayable.com` / `StayableCheck` is LIVE on the public domain.** Rotation **consciously deferred 2026-06-19** (Kate's call — acceptable for the alpha demo). MUST rotate before onboarding real staff; easiest path is the admin UI one-click reset after first login.
- Vercel team `team_Z3BElgYbbdVXocdCUDBwjD9F`, project `prj_XffrGVTq0KRSwWi36Wav6Sr3KkZt`.
- **Brand foundation (commit `1555776`):** palette tokens navy `#041E42` / blue `#0091F5` / sky `#91D1FA` / gold `#FDDA24` in `globals.css @theme`; Nunito font (free stand-in for domain-locked Adobe Urbane Rounded; swap if Adobe kit `dsq0zcq` authorized).
**Last milestone:** **Phase 4 + photo pipeline + UI shell shipped to PRODUCTION 2026-06-19** — added 4 `R2_*` vars to Vercel Production, local prod build verified (16 routes), FF-merged `claude/rise8-operations-platform-rv9B6` → `main` (`d274e1e..26cdc36`), prod deploy Ready; live domain `/login` 200, `/review`+`/issues` 307 auth-redirect (no 500s). Temp admin password rotation consciously deferred. *Prior:* **R2 live + end-to-end photo pipeline 2026-06-05 (commits `1bd52ff`, `f50271e`; ADR-015)** — Cloudflare R2 bucket `rise8-ops-staging` provisioned by Kyle (object-scoped token, CORS for localhost/ops.rentstayable.com/*.vercel.app; browser round-trip verified on `/photo-test`); `lib/r2.ts` (presigned PUT 15-min / GET 1-hr, key builders); `/api/photos/presign` `test`+`response` scopes (assignee/manager-gated, photoMax-capped); **upload-at-submit**: FillClient captures GPS per photo batch (10s timeout, never blocks preview), blobs+positions ride the IndexedDB draft, presigned PUTs at submit, answer = `{count, photos:[{key,lat,lng,accuracy,sizeBytes}]}` (legacy `{count,pendingUpload}` still accepted); submit action strictly validates key prefixes + computes geofence server-side + writes `photos` rows in-transaction; `lib/geofence.ts` pure PIP+50m buffer (11 tests); **`GeofenceStatus.UNVERIFIED` added** (migration `20260604171417`) = GPS present but no polygon yet — every photo lands UNVERIFIED until Phase-6 polygons, then backfill; review queue real thumbnails + detail photo grid w/ geofence badges. **Also this session:** login show/hide password toggle (`4f59f9a`); docs corrected — **R2 has NO object versioning** (RUNBOOK restore-a-photo = impossible; prevention is the control; Bucket Lock eval at Phase 8) (`99105d8`); `R2_PUBLIC_URL` dropped (private bucket, presigned-only); admin password `StayableCheck` verified live against DB (still must rotate before prod); `ChecklistTeamInterviewGuide_RISE8_060526.md` drafted for Kyle's field-team session (closes 4 blockers: question content, recurring rules, SLA, ES reviewer). **All green: typecheck, lint, 44/44 tests, prod build (16 routes).** **⚠ R2 envs are local-only — add the 4 R2 vars to Vercel Production BEFORE merging to main** (prod shares the Neon DB; `/review` SSR throws on presign without them). *Prior: Phase-4 review + issues (`6cfd803`) — `/review` queue table (ADR-011: status tabs w/ counts, per-row photo slots as R2-pending placeholders, time-to-complete via `lib/review.ts`, row-level Approve/Flag/Re-do w/ note dialogs); `/review/[id]` three-column review (status+note+actions rail · all-11-types response render incl. signature dataURL · audit-timeline rail); actions write `audit_log` + `notification_log` (EMAIL=SKIPPED `resend_deferred`, IN_APP=PENDING for Phase-6 center); **auto-Issue at submit** for visible PASSFAIL=FAIL w/ `fail_flags_issue` (deduped per instance+question vs open issues, shared `lib/issues.server.ts`); Flag creates manager-sourced Issue w/ chosen priority; `/issues` list (status/priority filters, SLA-breach highlight) + `/issues/[id]` detail (assign w/ property-membership validation, status, priority w/ SLA re-anchor, close=RESOLVED/WONT_FIX requires note, photo R2-gated); `sla_defaults` table + `/admin/sla` editor seeded 4/24/72/168h placeholders (ADR-014, Christopher to confirm); migration `20260602163848` (also `manager_note`); `lib/review.ts` pure helpers w/ 10 tests. Seed: 2 SUBMITTED demo Arrivals (one w/ failed flagged question — **note: seeded directly, so no auto-Issue exists until a live submit or flag**). *Earlier: Phase-3 filling (`a6ea416`); Phase-2 schema/admin/RBAC (`b366895`, `7777710`); Week-1 PWA + photo POC (`180b12d`).*
**(superseded) Phase-2 milestone (commits `b366895`, `7777710`)** — (a) **Full schema** (ARCH §4.1/§4.2): 10 new tables (rooms, checklist_templates, questions, recurring_rules, checklist_instances, responses, photos, issues, audit_log, notification_log) + all enums + indexes; `checklist_templates.code` + `checklist_instances.system_id`/self-reassignment per ADR-009; contractor/quick-task tables deliberately deferred to Phase 9/10. Migration `20260529204724_add_phase2_core_schema` applied to Neon. (b) **Seed** extended: 5 Lakeland rooms + 9 templates (authoritative metadata) + **40 PLACEHOLDER questions** covering all 11 types — `prisma/templates.ts`. **Real question content still owed by Karla/Christopher before go-live.** (c) **RBAC** `lib/rbac.ts` (server-guard level, not edge): `requireAdmin/requireManager/canAccessProperty/accessibleProperties`. (d) **Admin console** `/admin/*` (English-only, ADMIN-guarded): Users (create/deactivate/reset-PW/multi-property assign, Zod + audit_log, **temp-password shown once since Resend deferred**), Properties (read-only + geofence placeholder), Templates (read-only). (e) **Header property picker** (cookie-backed, scoped users w/ >1 property only; hidden for portfolio/single). **All green: typecheck, lint, 9/9 tests, prod build (12 routes).** *Runtime click-through of admin UI not yet exercised (login interactive) — verified by build/types only.* *Prior: Week-1 PWA shell + photo POC client + auth tests (`180b12d`); Tue auth (`7d81b96`). Seed admin `admin@rentstayable.com` / `StayableCheck` (rotate before prod).*
**Next milestone:** **Kyle's field-team interview meeting** (guide: `ChecklistTeamInterviewGuide_RISE8_060526.md`) — can close 4 blockers in one sitting (template question content, recurring-rules matrix, SLA confirm, ES reviewer); **hold UI-shape work until its layout feedback lands** (Kyle flagged layout ≠ expectations 2026-06-04; Phase-7 redesign input). **Still blocked** (need user/decision): (1) **on-device** PWA install + Kate's `/ios-spike` GPS GO/NO-GO; (2) **Resend creds** → activation + submit/flag emails (notification_log plumbing in place); (3) **real template question content** (Karla/Christopher — meeting). **Unblocked next-up:** record the **alpha demo for Rob** (Phase 4 exit); issue resolution-photo schema linkage + capture UI; then Phase 5 / Week 5 — recurring rules UI + 5 AM ET generation cron + bulk create + assignment policies + **invalidation flow incl. ADR-014 field-request→manager/admin-approval sub-flow** + unassigned-queue digest (Resend-gated). Also worth doing: Vitest on `lib/rbac.ts`. **Review checkpoint:** `pnpm dev` → log in as LL manager (`manager.lakeland@rentstayable.com` / `ChangeMe!2026`) → Home → open a pending Arrival → add photos to a PHOTO question (GPS prompt) → Submit → `/review` shows real thumbnails → open it: photo grid w/ geofence badge ("No geofence set" = expected until polygons) → `/photo-test` for the raw R2 round trip.

### Open questions awaiting answer
1. Final list of recurring rules per template per property — Owner: Property Managers — Needed by Week 5 (shifted from Wk 4 by ADR-012)
2. SLA defaults per issue priority — Owner: Christopher — Needed by Week 4
3. **Spanish translation reviewer (person)** — Karla / Christopher / external? — Owner: Kate — review pass itself moved to **Phase 8** (ADR-014); ES strings keep shipping machine-drafted
4. **Teams workspace inventory** — 1 corporate + 8 property channels w/ Incoming Webhook URLs — Owner: Kate — Needed by Week 7
5. **Stayable branding kit** — logo, palette, wordmark "Stayable Operations" — Owner: Kate — Needed by Week 7
6. **Final CONTRACTOR-audience template list** — Owner: Kate — Needed by Week 9
7. **Final geofence polygons per property** — Owner: Kate — Needed by Week 6
8. Rob sign-off on scope + budget — **deferred 2026-05-21**; not blocking Phase 1 execution.

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
- Rob sign-off on scope + budget: **deferred** — Phase 1 build proceeds without blocking; revisit before any irreversible spend (decided 2026-05-21)
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
