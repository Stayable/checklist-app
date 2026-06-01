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
| P1 | [x] | Account lockout 5/15/30 — pure `lib/auth-throttle.ts` + wired; **now covered by Vitest (9 cases) as of `180b12d`** |
| P2 | [~] | TOTP MFA scaffolding — schema fields (`mfaEnabled`/`mfaSecret`) exist; enable/verify flow deferred |

### Wed — Prisma schema + seed
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Prisma schema: `users` (incl. `locale` enum per ADR-013), `properties`, `user_properties` (per ARCH §4.1) |
| P0 | [x] | Migration `0001_init_users_and_properties` (applied to Neon as `20260527190517_init_users_and_properties`) |
| P0 | [x] | `geofence` as `Json` (GeoJSON) — PostGIS deferred |
| P0 | [x] | Seed script: 8 properties (all 2-letter short codes per ADR-011) + admin + 1 MANAGER + 1 HK at LL (4645) |
| P0 | [x] | Register seed in `package.json` |

### Thu — PWA shell  *(code shipped 2026-05-30, commit `180b12d`)*
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | `app.webmanifest` (scope `/`) + placeholder SVG icons (192/512/maskable). Left `/ios-spike`-scoped `manifest.webmanifest` untouched |
| P0 | [x] | Service worker registered via `/lib/pwa.ts` (prod-only). **Hand-rolled stand-in** (precache shell + network-first nav + `offline.html`) — swap to Workbox `generateSW` once it plays nice with Turbopack |
| P0 | [x] | `InstallPrompt.tsx` — Chrome `beforeinstallprompt` + iOS Add-to-Home-Screen guide (bilingual) |
| P0 | [x] | `/app/install` page (screenshots are placeholder text steps; real screens w/ Phase-7 branding) |
| P0 | [x] | Online/Offline status indicator in header (`OnlineStatus.tsx`, bilingual) |
| P0 | [ ] | Install + verify on real iPhone (iOS 17+) — **needs device** |
| P0 | [ ] | Install + verify on real Android (Chrome) — **needs device** |

### Fri — Photo capture POC (CRITICAL DE-RISK)
| Pri | Status | Task |
|---|---|---|
| P0 | [!] | Cloudflare R2 bucket `rise8-ops-staging` + scoped API tokens — **blocked: needs user's Cloudflare account** |
| P0 | [!] | R2 CORS allow PUTs from dev + Vercel preview URLs — **blocked on R2 bucket** |
| P0 | [x] | `/app/photo-test` page with `input[type=file] capture="environment"` (commit `180b12d`) |
| P0 | [x] | Independent `navigator.geolocation.getCurrentPosition()` capture (`lib/image.ts`) |
| P0 | [x] | Client-side compress: 1920px long edge, JPEG 85, ~500KB (`lib/image.ts`, shared w/ spike) |
| P0 | [!] | `/api/photos/presign` + `/api/photos/save` — **deliberately not written yet; blocked on R2 creds.** Upload button absent from `/photo-test` until R2 lands |
| P0 | [x] | EXIF read via `exifr` (chosen; confirms iOS strips GPS → separate capture justified) |
| P0 | [ ] | Test matrix: iPhone PWA, iPhone Safari, Android PWA, Android Chrome, Desktop Chrome — **needs devices + R2** |
| P0 | [ ] | Record results in `docs/PWA_TEST_RESULTS.md` |
| P0 | [~] | Throwaway de-risk spike shipped: `/ios-spike` (standalone manifest + GPS / camera / canvas-compress, no R2). Pushed → on a **Preview** URL. **Awaiting Kate's on-device iPhone test (launch from home screen, confirm Standalone:YES).** |
| P0 | [!] | **GO/NO-GO decision: iOS PWA viability** — pending the on-device spike result; escalate to Kate if GPS fails in standalone |

### Week-1 DoD
- [x] Log-in → "Hello, name" works end-to-end (verified 2026-05-30; sign-up path deferred to Phase 2 admin provisioning)
- [~] PWA installs to iPhone + Android home screens — **shell code shipped + builds; on-device install still to verify**
- [ ] Test photo round-trips through R2 with GPS captured separately — **blocked on R2; client capture/compress/GPS done**
- [ ] iOS GPS verified (or Capacitor fallback decision escalated) — pending Kate's `/ios-spike` on-device run

---

## Phase 2 — Week 2: Data Model & Admin Scaffolding

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Full schema: `rooms`, `checklist_templates`, `questions`, `recurring_rules`, `checklist_instances`, `responses`, `photos`, `issues`, `audit_log`, `notification_log` — migration `20260529204724_add_phase2_core_schema`, commit `b366895` |
| P0 | [x] | All indexes per ARCH §4.2 (photos.geofence_status is plain not partial — Prisma limitation, deferred to raw-SQL migration; table empty in v1) |
| P0 | [~] | Seed: all 9 templates. **Metadata authoritative; question CONTENT is PLACEHOLDER** (`prisma/templates.ts`, 40 q covering all 11 types). **Real Connecteam/Smartsheet question sets still needed — owner Karla/Christopher before go-live** |
| P0 | [x] | Admin UI: list/create/deactivate users, one-click password reset, multi-property assignment (`/admin/users`, audit-logged, Zod-validated). Resend deferred → temp password shown once instead of email. Commit `7777710` |
| P0 | [x] | Admin UI: list properties + geofence-status + map placeholder (`/admin/properties`, read-only) |
| P0 | [x] | Admin UI: list templates + questions read-only (`/admin/templates`) |
| P0 | [x] | RBAC (ADR-013): `lib/rbac.ts` guards (`requireAdmin`/`requireManager`/`canAccessProperty`/`accessiblePropertyIds`) — server-component/action level, **not edge middleware** (keeps Prisma off edge, consistent w/ auth decision) |
| P0 | [x] | Header property picker (`PropertyPicker`, cookie-backed): shown for scoped users w/ >1 property; auto/hidden for single-property; hidden for CORPORATE/ADMIN |
| P1 | [~] | Admin-only provisioning **done via temp-password** (no public signup ever existed). **Activation-LINK flow specifically deferred** — needs Resend |
| P1 | [!] | Activation email via Resend (7-day TTL, bilingual EN+ES) — **blocked: no Resend creds / wiring deferred** |
| P0 | [!] | Resolve open: field user self-invalidation vs manager-only — **blocked: decision owner Rob/Kate** |

---

## Phase 3 — Week 3: Checklist Filling (Mobile-First)

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Field user home: today's assignments list (ET-anchored via `etDateOnly`, status chips) — commit `a6ea416` |
| P0 | [x] | Checklist filling page with ordered questions (`/checklists/[id]`, assignee/manager-gated) |
| P0 | [x] | All 11 question types render + validate |
| P0 | [x] | Conditional logic engine (show_if) — `lib/checklist-logic.ts`, **14 unit tests** (incl. MULTI membership) |
| P0 | [~] | Multi-photo capture per question, **compressed client-side — capture/compress/preview done; R2 UPLOAD deferred** (PHOTO answer = `{count, pendingUpload:true}`) |
| P0 | [x] | Signature capture (`SignaturePad`, pointer canvas → PNG data URL; R2 offload later) |
| P0 | [x] | Draft auto-save to IndexedDB on every change (`lib/draft-store.ts` via `idb`, restored on mount) |
| P0 | [~] | Submit pipeline: validate (client + server) → persist responses → SUBMITTED + audit. **Photo upload step deferred (R2)** |
| P1 | [x] | Confirmation screen + return-to-home |
| P0 | [x] | First-login locale picker (`LocalePrompt`, HK/PA/MT → `users.locale` + cookie) |
| P0 | [~] | Spanish translations: field-staff strings (Today, filler, statuses, errors) added to `es.json` — **machine-drafted, still pending bilingual reviewer** (open q#5) |

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

## Deployment & Ops (2026-05-30 — app is LIVE in prod)

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | **Deployed Weeks 1–3 to production** — live at https://ops.rentstayable.com (merged to `main`, commit `1555776`; custom domain + DNS attached) |
| P0 | [x] | **Fixed prod login outage** — Vercel Prod `DATABASE_URL`/`DIRECT_URL` were empty strings → Prisma threw → NextAuth `Configuration`. Set to Neon conn via `vercel env add --force`, redeployed; login verified |
| P0 | [x] | **Applied Stayable brand foundation** (rentstayable.com) — navy/blue/sky/gold tokens; primary surfaces recolored. Live + verified |
| P0 | [x] | **Fixed fonts never rendering** (2026-06-02, commits `e12ce23`+`605105b`) — root cause: next/font CSS var was on `<body>` but `font-family` is applied on `<html>` (`html{@apply font-sans}`), so the var was undefined at `<html>` → whole app fell back to browser **serif**. Fix: moved font var classes to `<html>`, `font-sans` to `<body>`. Also swapped Roboto+Quicksand → **Nunito** (free rounded-geometric Urbane Rounded match, body+headings). Verified via local prod server + live HTML/CSS |
| P1 | [x] | **Vercel git auto-deploy** — worked cleanly this session (both `git push origin main` → auto prod deploy, no CLI needed). Earlier flakiness not reproduced; watch but likely OK |
| P1 | [ ] | **Rotate temp admin password** (`StayableCheck`) — live on the public domain |
| P1 | [ ] | **Authorize Adobe Urbane Rounded** for ops.rentstayable.com (kit `dsq0zcq`) → swap Nunito → real brand font (1-line change). Optional — Nunito is a close free stand-in |
| P2 | [ ] | Decide prod/dev DB split — prod currently shares the dev Neon DB w/ seeded test data; needs a clean prod DB before real go-live |
| P1 | [ ] | **Decide branch workflow** — de-facto this session: commit straight to `main`, auto-deploys to prod. Feature branch `claude/rise8-operations-platform-rv9B6` is now **behind `main`** (missing branding/font commits) — branch fresh off `main` next session or fast-forward it |

## Cross-Cutting Backlog

| Pri | Status | Task |
|---|---|---|
| P1 | [x] | **Vitest setup + unit test for `lib/auth-throttle.ts`** — 9 cases: 5-strike lock, 15-min window reset + boundary, 30-min unlock, success clear. Shipped 2026-05-30 commit `180b12d` |
| P1 | [x] | **Vitest for `lib/checklist-logic.ts`** — 14 cases: conditional `show_if` (incl. MULTI), per-type validation, validateAll. Commit `a6ea416` |
| P2 | [ ] | Add `AUTH_SECRET` to Vercel **Preview** if branch-preview login testing is wanted (Production-only per Kate's default-to-Prod rule) |
| P3 | [ ] | Decide fate of stray untracked files: `CurrentUpdate/ProjectPhases/StatusSummary_RISE8_051826.md` + `Screenshot 2026-06-02 042054.png` (commit as deliverables vs `.gitignore` vs delete) |
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
