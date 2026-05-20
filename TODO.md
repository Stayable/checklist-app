# RISE8 Operations Platform — Task Tracker

Living checklist for the 8-week build + 4-week parallel run. Source of truth for "what's next." Tied to `docs/SPRINT_PLAN.md`.

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
| P0 | [~] | Create Neon project, set `DATABASE_URL` + `DIRECT_URL` in Vercel envs — Neon project exists; URLs not yet pasted into Vercel |

### Tue — Auth.js v5 (Credentials)
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Auth.js v5 Credentials provider wired up |
| P0 | [ ] | bcrypt (cost 12), JWT session, 30-day rolling expiry |
| P0 | [ ] | `/app/login`, `/app/signup`, `/api/auth/[...nextauth]` |
| P0 | [ ] | `/lib/auth.ts`, `/lib/db.ts` (Prisma singleton) |
| P1 | [ ] | Account lockout: 5 fails / 15 min / 30 min cooldown |
| P2 | [ ] | TOTP MFA scaffolding (field + future enable flow) |

### Wed — Prisma schema + seed
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Prisma schema: `users`, `properties`, `user_properties` (per ARCH §4.1) |
| P0 | [ ] | Migration `0001_init_users_and_properties` |
| P0 | [ ] | `geofence` as `Json` (GeoJSON) — PostGIS deferred |
| P0 | [ ] | Seed script: 7 (or 8) properties + admin + 1 MANAGER + 1 HK at Lakeland (4645) |
| P0 | [ ] | Register seed in `package.json` |

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
| P0 | [!] | **GO/NO-GO decision: iOS PWA viability** — escalate to Kate if GPS fails |

### Week-1 DoD
- [ ] Sign-up → log-in → "Hello, name" works end-to-end
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
| P0 | [ ] | Admin UI: list/create/deactivate users, reset password (one-click) |
| P0 | [ ] | Admin UI: list properties, view geofence placeholder map |
| P0 | [ ] | Admin UI: list templates + questions (read-only OK for v1) |
| P0 | [ ] | RBAC middleware: role + property scope per route |
| P1 | [ ] | Switch signup → admin-only provisioning (activation-link flow) |
| P1 | [ ] | Activation email via Resend (7-day TTL) |
| P0 | [ ] | Resolve open: field user self-invalidation vs manager-only |

---

## Phase 3 — Week 3: Checklist Filling (Mobile-First)

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Field user home: today's assignments list |
| P0 | [ ] | Checklist filling page with ordered questions |
| P0 | [ ] | All 11 question types render + validate |
| P0 | [ ] | Conditional logic engine (show_if) |
| P0 | [ ] | Multi-photo capture per question, compressed client-side |
| P0 | [ ] | Signature capture (canvas, touch/stylus) |
| P0 | [ ] | Draft auto-save to IndexedDB on every change |
| P0 | [ ] | Submit pipeline: validate → upload photos → persist responses → SUBMITTED |
| P1 | [ ] | Confirmation screen + return-to-home |

---

## Phase 4 — Week 4: Review + Issues  **[ALPHA MILESTONE]**

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Manager review queue (oldest-first) |
| P0 | [ ] | Review detail: responses + photos + signatures + time-to-complete |
| P0 | [ ] | Approve / Flag / Request Re-do actions with audit entries |
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

---

## Phase 8 — Week 8: Training & Go-Live  **[PRODUCTION READY]**

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Production domain + secrets + Sentry + Vercel Analytics live |
| P0 | [ ] | Prod DB seeded: real users, properties, templates, recurring rules |
| P0 | [ ] | All field staff provisioned; activation emails sent |
| P0 | [ ] | Training session per property (1 hr, recorded) |
| P0 | [ ] | Quick reference card (PDF + printed) |
| P0 | [ ] | Manager training (1.5 hr) |
| P0 | [ ] | Runbook reviewed + extended with real ops gotchas |
| P0 | [ ] | Support channel established (Teams) |
| P0 | [ ] | Parallel run officially active |
| P0 | [ ] | Daily monitoring report → Kate every morning |

---

## Phase 9 — Weeks 9–12: Parallel Run & Cutover

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Week 9: daily parity monitoring + P0/P1 fixes within 24h |
| P0 | [ ] | Week 10: perf tuning + UX refinements |
| P0 | [ ] | Week 11: parity check — if ≥ Connecteam baseline for 2 weeks, schedule cutover |
| P0 | [ ] | Week 11: communicate cutover date (1 week notice) |
| P0 | [ ] | Week 12: Connecteam → read-only |
| P0 | [ ] | Week 12: Karla stops manual PDF uploads |
| P0 | [ ] | Week 12: Smartsheet sheets archived |
| P0 | [ ] | Cutover retro scheduled for Week 13 |

---

## Cross-Cutting Backlog

| Pri | Status | Task |
|---|---|---|
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
