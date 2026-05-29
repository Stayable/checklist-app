# CLAUDE.md

This file gives Claude Code the persistent context it needs for the RISE8 Operations Platform project. Read this first in every session.

---

## What This Project Is

**RISE8 Operations Platform** — a custom web application that replaces the operational checklist functionality of Connecteam for RISE8 Companies / Stayable, while integrating with the existing Smartsheet ecosystem during transition (and archiving Smartsheet on cutover).

It serves field staff (Housekeeping, Property Attendants, Maintenance Technicians) and management (Property Managers, Corporate, Asset Management) across 7 Stayable extended-stay properties in Florida.

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
- Spanish review owner: TBD — likely Karla or Christopher (open question).

### Multi-Property User Assignment (ADR-013)
- `user_properties` is many-to-many. **Each user has one global role** (`users.role`) that applies at every property they're tied to.
- RBAC: a user can access property X iff role ∈ {CORPORATE, ADMIN} OR `(user_id, property_id=X)` exists in `user_properties`.
- UI: header property picker for users with >1 property; auto-select for single-property users; hidden for CORPORATE/ADMIN (portfolio default).
- **Per-property role overrides not supported in v1.** Edge case ("MT at LL, Manager at OR") handled via two user records.

### Photo Retention (ADR-013)
- **Keep all photos forever in v1.** No scheduled deletion job.
- R2 versioning + 30-day soft-delete retention already configured (RUNBOOK).
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
R2_PUBLIC_URL
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

When changing scope or architecture: update the relevant doc and add an entry to `DECISIONS.md`.

---

## Current Status (update this section as work progresses)

**As of:** May 30, 2026
**Phase:** Week 1 in progress — Mon (i18n + datetime), Wed (Prisma schema), **Tue (Auth.js login)** shipped + committed; PWA + photo POC remain
**Current week:** Week 1 (foundation committed to git; Auth.js credentials login live + verified; Thu PWA shell + Fri photo POC ahead; iOS spike page already on a Preview URL awaiting Kate's on-device test)
**Last milestone:** **Tue Auth.js v5 login shipped 2026-05-30 (commit `7d81b96`)** — `next-auth` 5.0.0-beta.31 Credentials provider, bcrypt(12), JWT 30-day rolling, role+locale on session; account-lockout logic in pure `lib/auth-throttle.ts` (5/15/30, ADR-008); bilingual `/login` + authed home greeting; route protection via server-side `auth()` (no auth-in-middleware, keeps bcrypt/Prisma off edge); migration `20260529181509_add_login_lockout_fields` applied to Neon; seed admin set to **`admin@rentstayable.com` / `StayableCheck`** (temp, rotate before prod). `AUTH_SECRET` generated → `.env.local` + Vercel **Production**. Verified live: wrong pw → no session, correct → ADMIN session w/ 30-day expiry. **Earlier this session:** Week-1 Mon+Wed foundation (Prisma schema/seed/migration, `lib/db.ts`, next-intl, `lib/datetime.ts`, ESLint datetime guard) was found uncommitted and committed as `384ca62`/`7879b91`/`4945fe6`; throwaway `/ios-spike` de-risk page shipped (`9c4792c`); confirmed `DATABASE_URL`+`DIRECT_URL` live on Vercel (Prod+Preview) via `vercel env ls`. **Prisma pinned 6.x.**
**Next milestone:** (1) **Thu PWA shell** — manifest, Workbox SW, install prompt, online/offline indicator + iPhone/Android install verification; (2) **Fri photo POC + iOS GPS GO/NO-GO** (needs R2 bucket + tokens + CORS from user) — note `/ios-spike` already covers the standalone GPS/camera/compress test pending Kate's on-device run; (3) **Vitest + unit test for `lib/auth-throttle.ts`** (lockout shipped untested); (4) optionally add `AUTH_SECRET` to Vercel **Preview** for branch-preview login testing.

### Open questions awaiting answer
1. Can a field user invalidate their own assignment (call in sick) or manager only? — Owner: Rob/Kate — Needed by Week 2
2. Final list of recurring rules per template per property — Owner: Property Managers — Needed by Week 5 (shifted from Wk 4 by ADR-012)
3. Bonus calculation logic (how does Bonus=1 vs 0 work in new platform?) — Owner: Rob — Needed by Week 3
4. SLA defaults per issue priority — Owner: Christopher — Needed by Week 4
5. **Spanish translation reviewer** — Karla / Christopher / external? — Owner: Kate — Needed before Phase 3
6. **Teams workspace inventory** — 1 corporate + 8 property channels w/ Incoming Webhook URLs — Owner: Kate — Needed by Week 7
7. **Stayable branding kit** — logo, palette, wordmark "Stayable Operations" — Owner: Kate — Needed by Week 7
8. **Final CONTRACTOR-audience template list** — Owner: Kate — Needed by Week 9
9. **Final geofence polygons per property** — Owner: Kate — Needed by Week 6
10. Rob sign-off on scope + budget — **deferred 2026-05-21**; not blocking Phase 1 execution.

### Recently resolved decisions
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
