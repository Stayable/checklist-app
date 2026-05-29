# RISE8 Operations Platform — Task Tracker

Living checklist for the **10-week build + 4-week parallel run** (extended per ADR-012). Source of truth for "what's next." Tied to `docs/SPRINT_PLAN.md`.

**Legend**
- Priority: `P0` blocker · `P1` must-have · `P2` should-have · `P3` nice-to-have
- Status: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

Update `Current Status` in `CLAUDE.md` and check items off here as work lands.

---

## Phase 0 — Pre-Build Sign-off (NOW)

| Pri | Status | Task | Owner | Notes |
|---|---|---|---|---|
| P0 | [x] | PRD finalized | Kate | `docs/PRD.md` |
| P0 | [x] | Architecture finalized | Kate | `docs/ARCHITECTURE.md` |
| P0 | [x] | 8-week sprint plan finalized | Kate | `docs/SPRINT_PLAN.md` |
| P0 | [x] | ADRs 001–006 recorded | Kate | `docs/DECISIONS.md` |
| P0 | [ ] | Rob sign-off on scope + budget | Rob | **Deferred 2026-05-21** — Phase 1 build proceeds without blocking |
| P0 | [x] | Resolve: is Jacksonville North (812) in scope? | Kate | **YES — 8th property confirmed 2026-05-21**; align seed accordingly |
| P1 | [x] | Confirm subdomain — **ops.rentstayable.com** (added to Vercel; DNS records added 2026-05-20, propagation pending) | Kate | Resolved 2026-05-20 |
| P1 | [x] | Confirm MFA default for managers/corporate (on by default vs opt-in) | Kate | **On-by-default for managers/corp; optional for field staff** — resolved 2026-05-21 |
| P2 | [ ] | Confirm actual Connecteam monthly invoice for savings figure | Kate | Validates ROI in sprint plan |

---

## Phase 1 — Week 1: Foundation & iOS PWA De-risking

**Goal:** Skeleton stands up. iOS PWA + photo capture + GPS validated on real devices.

### Mon — Repo / Vercel / Neon / Next.js
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | `pnpm create next-app` — Next.js 15.5.18, TS, App Router, Tailwind v4, ESLint 9 (commit `233c483`) |
| P0 | [x] | Add shadcn/ui (init defaults, slate base, `@base-ui/react`) (commit `e22e981`) |
| P0 | [x] | Folder structure: `/app /components /lib /prisma /emails /scripts` |
| P0 | [x] | `.env.example` with all vars from ARCHITECTURE §8.3 (+ `DIRECT_URL` for Prisma) |
| P0 | [x] | `.gitignore` baseline (keeps `.env.example` tracked) |
| P0 | [x] | Initial commit: `chore: initial project scaffold` |
| P0 | [x] | Connect GitHub → Vercel project, auto-deploy on push (preview deploy succeeded) |
| P0 | [x] | Create Neon project, set `DATABASE_URL` + `DIRECT_URL` in Vercel envs — **confirmed 2026-05-30 via `vercel env ls`: both present, scoped Production + Preview** (Development not set — fine, local uses `.env.local`) |
| P0 | [x] | Merge scaffold branch → `main` so production deploys are real (PR #1, merge commit `aa90bfe`, 2026-05-22) |
| P0 | [x] | **i18n scaffold (ADR-013):** install `next-intl`, configure middleware-based locale routing, scaffold `messages/en.json` + `messages/es.json`, add locale provider to root layout |
| P0 | [x] | **Datetime helper (ADR-013):** `lib/datetime.ts` exposing `formatInET(dt, pattern)` + `etToday()`; ESLint rule blocking direct `toLocaleString` / `Intl.DateTimeFormat` outside this file; install `date-fns-tz` |

### Tue — Auth.js v5 (Credentials)  *(shipped 2026-05-30, commit `7d81b96`)*
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Auth.js v5 Credentials provider wired up (next-auth 5.0.0-beta.31) |
| P0 | [x] | bcrypt (cost 12), JWT session, 30-day rolling expiry — verified live (session role+locale+30d expiry) |
| P0 | [x] | `/app/login` (bilingual EN/ES) + `/api/auth/[...nextauth]`. **`/app/signup` intentionally deferred to Phase 2** (admin-provisioning model) |
| P0 | [x] | `/lib/auth.ts`, `/lib/db.ts` (Prisma singleton) |
| P1 | [~] | Account lockout 5/15/30 — logic done in pure `lib/auth-throttle.ts` + wired; **full 5-strike lock NOT yet exercised (no Vitest). Add unit test before relying on it** |
| P2 | [~] | TOTP MFA scaffolding — schema fields (`mfaEnabled`/`mfaSecret`) exist; enable/verify flow deferred |

### Wed — Prisma schema + seed
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Prisma schema: `users` (incl. `locale` enum per ADR-013), `properties`, `user_properties` (per ARCH §4.1) |
| P0 | [x] | Migration `0001_init_users_and_properties` (applied to Neon as `20260527190517_init_users_and_properties`) |
| P0 | [x] | `geofence` as `Json` (GeoJSON) — PostGIS deferred |
| P0 | [x] | Seed script: 8 properties (all 2-letter short codes per ADR-011) + admin + 1 MANAGER + 1 HK at LL (4645) |
| P0 | [x] | Register seed in `package.json` |

### Thu — PWA shell
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `manifest.webmanifest` + placeholder icons (192/512/maskable) |
| P0 | [ ] | Workbox service worker registered via `/lib/pwa.ts` |
| P0 | [ ] | `InstallPrompt.tsx` with iOS-specific Add-to-Home-Screen guide |
| P0 | [ ] | `/app/install` page with screenshots |
| P0 | [ ] | Online/Offline status indicator in header |
| P0 | [ ] | Install + verify on real iPhone (iOS 17+) |
| P0 | [ ] | Install + verify on real Android (Chrome) |

### Fri — Photo capture POC (CRITICAL DE-RISK)
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Cloudflare R2 bucket `rise8-ops-staging` + scoped API tokens |
| P0 | [ ] | R2 CORS allow PUTs from dev + Vercel preview URLs |
| P0 | [ ] | `/app/photo-test` page with `input[type=file] capture="environment"` |
| P0 | [ ] | Independent `navigator.geolocation.getCurrentPosition()` capture |
| P0 | [ ] | Client-side compress: 1920px long edge, JPEG 85, ~500KB |
| P0 | [ ] | `/api/photos/presign` + `/api/photos/save` |
| P0 | [ ] | EXIF read via `exifr` (or `piexifjs`) — pick smaller iOS-safe lib |
| P0 | [ ] | Test matrix: iPhone PWA, iPhone Safari, Android PWA, Android Chrome, Desktop Chrome |
| P0 | [ ] | Record results in `docs/PWA_TEST_RESULTS.md` |
| P0 | [~] | Throwaway de-risk spike shipped: `/ios-spike` (standalone manifest + GPS / camera / canvas-compress, no R2). Pushed → on a **Preview** URL. **Awaiting Kate's on-device iPhone test (launch from home screen, confirm Standalone:YES).** |
| P0 | [!] | **GO/NO-GO decision: iOS PWA viability** — pending the on-device spike result; escalate to Kate if GPS fails in standalone |

### Week-1 DoD
- [x] Log-in → "Hello, name" works end-to-end (verified 2026-05-30; sign-up path deferred to Phase 2 admin provisioning)
- [ ] PWA installs to iPhone + Android home screens
- [ ] Test photo round-trips through R2 with GPS captured separately
- [ ] iOS GPS verified (or Capacitor fallback decision escalated)

---

## Phase 2 — Week 2: Data Model & Admin Scaffolding

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Full schema: `rooms`, `checklist_templates`, `questions`, `recurring_rules`, `checklist_instances`, `responses`, `photos`, `issues`, `audit_log`, `notification_log` |
| P0 | [ ] | All indexes per ARCH §4.2 |
| P0 | [ ] | Seed: all 9 templates with real question sets pulled from Connecteam/Smartsheet |
| P0 | [ ] | Admin UI: list/create/deactivate users, reset password (one-click), **assign to one or more properties** (ADR-013 multi-property model) |
| P0 | [ ] | Admin UI: list properties, view geofence placeholder map |
| P0 | [ ] | Admin UI: list templates + questions (read-only OK for v1) |
| P0 | [ ] | RBAC middleware (ADR-013): non-corp/admin users gated by `user_properties` membership on every property-scoped route |
| P0 | [ ] | Header property picker for users with >1 property assignment; auto-select for single-property users; hidden for CORPORATE/ADMIN (portfolio default) |
| P1 | [ ] | Switch signup → admin-only provisioning (activation-link flow) |
| P1 | [ ] | Activation email via Resend (7-day TTL); **field-staff recipients get bilingual EN+ES template per ADR-013** |
| P0 | [ ] | Resolve open: field user self-invalidation vs manager-only |

---

## Phase 3 — Week 3: Checklist Filling (Mobile-First)

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Field user home: today's assignments list (ET-anchored "today" per ADR-013) |
| P0 | [ ] | Checklist filling page with ordered questions |
| P0 | [ ] | All 11 question types render + validate |
| P0 | [ ] | Conditional logic engine (show_if) |
| P0 | [ ] | Multi-photo capture per question, compressed client-side |
| P0 | [ ] | Signature capture (canvas, touch/stylus) |
| P0 | [ ] | Draft auto-save to IndexedDB on every change |
| P0 | [ ] | Submit pipeline: validate → upload photos → persist responses → SUBMITTED |
| P1 | [ ] | Confirmation screen + return-to-home |
| P0 | [ ] | **First-login locale picker (ADR-013):** field staff (HK/PA/MT) prompted to choose EN or ES; saved to `users.locale` |
| P0 | [ ] | **Spanish translations (ADR-013):** all strings on field-staff surfaces in this phase translated — `messages/es.json` reviewed by bilingual reviewer (owner TBD) before merge |

---

## Phase 4 — Week 4: Review + Issues  **[ALPHA MILESTONE]**

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Manager review queue — **table view** (ADR-011): row per submission · Status · User · Date · Unit# · Time-to-complete · inline photo thumbnails per required photo question · row-level Approve/Flag/Re-do |
| P0 | [ ] | Single-submission review — **three-column layout** (ADR-011): left rail (status + manager note) · center (responses + photos + signatures + time-to-complete header) · right rail (activity timeline w/ actor + timestamp) |
| P0 | [ ] | Approve / Flag / Request Re-do actions with audit entries (writes to `audit_log` + `notification_log`) |
| P0 | [ ] | Auto-Issue from PASSFAIL=Fail when `fail_flags_issue=true` |
| P0 | [ ] | Issues list + detail page |
| P0 | [ ] | Resolution flow: note + photo required |
| P0 | [ ] | Resend: email on submission to manager |
| P0 | [ ] | Resend: email on flag to submitter |
| P0 | [ ] | Alpha demo recorded + shared with Rob |
| P0 | [ ] | Resolve open: SLA defaults per priority (Christopher) |
| P0 | [ ] | Resolve open: bonus rule logic (Rob) |

---

## Phase 5 — Week 5: Recurrence, Bulk, Assignment

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Recurring rules UI (admin/manager) per template per property |
| P0 | [ ] | Rule patterns: daily / weekly / monthly / quarterly / on-demand |
| P0 | [ ] | Vercel Cron 5:00 AM ET: `/api/cron/generate-checklists` |
| P0 | [ ] | Bulk-create UI: template + property + date(s) + room range/list |
| P0 | [ ] | Assignment: specific user OR role pool OR unassigned |
| P0 | [ ] | Unassigned-queue digest email (7am ET) |
| P0 | [ ] | Invalidation flow with reason + reassignment audit chain |
| P0 | [ ] | Resolve open: final recurring rules list per property (PMs) |

---

## Phase 6 — Week 6: Dashboards, Geofence, Notifications  **[FEATURE COMPLETE]**

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Field Staff Home dashboard |
| P0 | [ ] | Property Manager dashboard (queue, %, issues, heatmap, unassigned) |
| P0 | [ ] | Corporate dashboard (portfolio %, comparison, top issues, scorecards) |
| P0 | [ ] | Issues dashboard (open, SLA breach, repeats) |
| P0 | [ ] | Custom report builder + CSV export |
| P0 | [ ] | In-app notification center + unread badge |
| P0 | [ ] | Geofence polygon editor (Leaflet draw + save) |
| P0 | [ ] | All 7 (or 8) property polygons configured (final coords from Kate) |
| P0 | [ ] | Geofence verification on photo upload (ST_Contains or in-app PIP) |
| P0 | [ ] | 7:00 AM daily PM digest email |

---

## Phase 7 — Week 7: UI Redesign + PDF + Offline + Hardening

### UI Redesign Pass — Claude Design (runs first, before polish-adjacent work)
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Stayable branding kit sourced from Kate — logo, palette, wordmark ("Stayable Operations") |
| P0 | [ ] | Run full app through Claude Design (`document-skills:frontend-design`) — capture screens of every route in current state as baseline |
| P0 | [ ] | Define visual system: typography scale, color tokens, spacing/density, button hierarchy, form treatment |
| P0 | [ ] | Redesign field-staff screens: Today view, checklist runtime (11 question types), photo + signature capture, draft + submit confirmation |
| P0 | [ ] | Redesign manager screens: review queue, review detail, issues list, issue detail, dashboards |
| P0 | [ ] | Redesign admin screens: user list, user provisioning, properties, templates, recurring rules |
| P0 | [ ] | Empty / error / loading / offline states for every screen |
| P0 | [ ] | Side-by-side review with Kate vs functional baseline — approve before merging redesign |
| P1 | [ ] | Lock visual system into a Tailwind config + shadcn theme so future screens stay consistent |

### PDF, offline, hardening
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `@react-pdf/renderer` template matching Connecteam style |
| P0 | [ ] | Single-instance PDF (immediate) |
| P0 | [ ] | Bulk PDF export via Inngest with email link (7-day URL) |
| P0 | [ ] | Offline test: 3 checklists offline → reconnect → sync |
| P1 | [ ] | Load test: 30 concurrent submitters |
| P1 | [ ] | Accessibility audit (keyboard, screen reader basics, contrast) |
| P1 | [ ] | API error-handling pass |
| P0 | [ ] | All P0/P1 bugs from alpha cleared |

### Daily Teams Digest (ADR-010)
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Teams channel inventory: collect 1 corporate + 8 property webhook URLs (Kate) |
| P1 | [ ] | `property_channels` table + admin UI to manage webhooks |
| P1 | [ ] | Digest builder: prior-day misses, flagged issues, photo verification anomalies per property |
| P1 | [ ] | Inngest cron 7:00 AM ET — post master + per-property digests via Incoming Webhooks |
| P1 | [ ] | `notification_log` entries per channel (success / failed / skipped) |
| P1 | [ ] | Admin failure surface (which channels failed in the last 7 days) |

---

## Phase 8 — Week 8: Training & Provisioning

Production-ready milestone shifts to Phase 10 (after Contractor Checklists + Quick Tasks ship) per ADR-012.

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Production domain + secrets + Sentry + Vercel Analytics live (Property Checklist scope) |
| P0 | [ ] | Prod DB seeded: real users, properties, templates, recurring rules |
| P0 | [ ] | All field staff provisioned; activation emails sent |
| P0 | [ ] | Training session per property (1 hr, recorded) — Property Checklist walkthrough |
| P0 | [ ] | Quick reference card v1 (PDF + printed) — Property Checklist focus; updated in Phase 10 to cover Contractor + Quick Tasks |
| P0 | [ ] | Manager training (1.5 hr) — Property Checklist walkthrough |
| P0 | [ ] | Runbook reviewed + extended with real ops gotchas |
| P0 | [ ] | Support channel established (Teams) |
| P0 | [ ] | Daily 7 AM ET PM email digest live (PRD §8) |

---

## Phase 9 — Week 9: Contractor Checklists (ADR-012)

**Goal:** Magic-link contractor sign-off flow live. CONTRACTOR-audience templates seeded.

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `contractors` table + admin UI to create/edit/deactivate contractor records per property |
| P0 | [ ] | `checklist_templates.audience` enum (`EMPLOYEE` \| `CONTRACTOR`) + admin UI to tag templates |
| P0 | [ ] | `checklist_instances.contractor_id` (nullable FK) + creation flow targeting contractor records |
| P0 | [ ] | Magic-link token: signed (JWT or HMAC), single-use, 72h TTL, tied to (instance_id, contractor_id) |
| P0 | [ ] | Replay protection: token consumed on submit, blocked on reuse with clear error |
| P0 | [ ] | Token regeneration as one-click manager action |
| P0 | [ ] | Contractor filling UI: opens directly from link, no login screen, same camera/GPS/signature flow as employee. **Inherits ADR-013 bilingual filling UI**; magic-link URL accepts optional `?lang=es` (manager sets per contractor); default EN when omitted |
| P0 | [ ] | Manager review queue: submitter column shows contractor name + company for CONTRACTOR instances |
| P0 | [ ] | Flag → Issue tagged to contractor record (not user) |
| P0 | [ ] | Seed initial CONTRACTOR-audience templates: Roof PM (contractor variant), Pest Control, HVAC Service, Pressure Washing (contractor variant), Lawn / Landscaping — final list confirmed with Kate during build |
| P0 | [ ] | Code review pass on magic-link token signing + replay protection |
| P1 | [ ] | Contractor PDF export uses contractor name/company in header instead of employee name |

---

## Phase 10 — Week 10: Quick Tasks (ADR-012)  **[PRODUCTION READY]**

**Goal:** Quick Tasks live across all surfaces. Parallel run begins.

### Quick Tasks build
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `quick_tasks` table + `quick_task_photos` join (max 5 photos per task) |
| P0 | [ ] | Manager / Corporate / Admin creation surface: title, description, property, assignee or role pool, due date, priority |
| P0 | [ ] | Field staff "My Tasks" surface in home; sorted by due date asc → priority desc |
| P0 | [ ] | Field staff task detail: mark IN_PROGRESS → add completion note + optional photos → mark COMPLETED |
| P0 | [ ] | Manager "Open Tasks" view at their property with filters: assignee, priority, status |
| P0 | [ ] | Corporate dashboard: portfolio rollup of open / overdue Quick Tasks per property |
| P0 | [ ] | Manager CANCEL action requires a reason in `completion_note` |
| P0 | [ ] | RBAC: field staff see only their own assigned tasks; managers see their property's tasks |
| P1 | [ ] | Resist scope creep — no recurrence, no review queue, no PDF export on Quick Tasks |

### Production readiness
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Production environment fully configured (domain, secrets, monitoring, Sentry, Vercel Analytics) |
| P0 | [ ] | Prod DB seeded: real users, properties, templates, recurring rules |
| P0 | [ ] | First production submission completed successfully |
| P0 | [ ] | Manager training extended: Contractor Checklists + Quick Tasks walkthrough |
| P0 | [ ] | Quick reference card updated to cover Contractor + Quick Tasks |
| P0 | [ ] | Parallel run officially active |
| P0 | [ ] | Daily monitoring report → Kate every morning |

---

## Phase 11 — Weeks 11–14: Parallel Run & Cutover

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Week 11: daily parity monitoring + P0/P1 fixes within 24h |
| P0 | [ ] | Week 12: perf tuning + UX refinements |
| P0 | [ ] | Week 13: parity check — if ≥ Connecteam baseline for 2 weeks, schedule cutover for Week 14 |
| P0 | [ ] | Week 13: communicate cutover date (1 week notice) |
| P0 | [ ] | Week 14: Connecteam → read-only |
| P0 | [ ] | Week 14: Karla stops manual PDF uploads |
| P0 | [ ] | Week 14: Smartsheet sheets archived |
| P0 | [ ] | Cutover retro scheduled for Week 15 |

---

## Cross-Cutting Backlog

| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | **Vitest setup + unit test for `lib/auth-throttle.ts`** — prove 5-strike lock, 15-min window reset, 30-min unlock (logic shipped untested 2026-05-30) |
| P2 | [ ] | Add `AUTH_SECRET` to Vercel **Preview** if branch-preview login testing is wanted (Production-only per Kate's default-to-Prod rule) |
| P3 | [ ] | Decide fate of stray `CurrentUpdate/ProjectPhases/StatusSummary_RISE8_051826.md` (commit as deliverables vs `.gitignore`) |
| P1 | [ ] | CI: GitHub Actions — lint + typecheck + unit tests on PR |
| P1 | [ ] | Playwright e2e on login + submit + review |
| P2 | [ ] | Nightly `pg_dump` → R2 backup bucket |
| P2 | [ ] | Sentry alerts wired per RUNBOOK §Monitoring |
| P2 | [ ] | Weekly orphaned-photo cleanup cron |
| P3 | [ ] | M365 SSO provider (future, additive — does not break field login) |
| P3 | [ ] | Web Push notifications (iOS 16.4+) |
| P3 | [ ] | Capacitor wrapper (only if iOS PWA fails Week 1) |

---

## Open Questions (mirror of PRD §12 — tick when resolved)

| Pri | Status | Question | Owner | Needed by |
|---|---|---|---|---|
| P0 | [x] | Jacksonville North (812) in scope as 8th property? | Kate | **YES — resolved 2026-05-21** |
| P0 | [x] | Subdomain final choice | Kate | **ops.rentstayable.com — resolved 2026-05-20** |
| P0 | [x] | MFA default for managers/corp | Kate | **On-by-default — resolved 2026-05-21** |
| P0 | [ ] | Field user self-invalidate, or manager only? | Rob/Kate | Week 2 |
| P0 | [ ] | Bonus calc logic (Bonus=1 vs 0) | Rob | Week 3 |
| P0 | [ ] | SLA defaults per priority | Christopher | Week 4 |
| P0 | [ ] | Recurring rules per template per property | PMs | Week 4 |
| P0 | [ ] | Final geofence polygons per property | Kate | Week 5 |

---

*Edit this file as scope shifts. Mirror major changes into `docs/DECISIONS.md` as new ADRs.*
