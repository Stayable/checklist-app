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
- **In:** Operational checklists, recurring schedules, bulk creation, photo capture with geofence verification, manager review/approval, issues pipeline, dashboards, PDF export on demand, email notifications
- **Out:** Time clock / time tracking (handled by Paycom), payroll/HR (handled by Paycom), shift scheduling (handled by Paycom), chat/messaging, hiring/onboarding, training, knowledge base, surveys, guest-facing features, native iOS/Android apps

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

### Properties (active = 8, confirmed 2026-05-21)
| Property | ID | Short Code |
|---|---|---|
| Jacksonville West | 6802 | Jax West |
| Jacksonville North | 812 | Jax N |
| St. Augustine | 2535 | St. Aug |
| Lakeland | 4645 | Lakeland |
| Orlando OBT | 8700 | Orlando |
| Kissimmee East | 2295 | Kiss E |
| Kissimmee West | 5399 | Kiss West |
| Davenport | 44199 | Davenport |

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
- `docs/SPRINT_PLAN.md` — 8-week sprint plan. Source of truth for when and in what order.
- `docs/DECISIONS.md` — Architecture Decision Records (ADRs). Append-only log of significant decisions and their reasoning.
- `docs/RUNBOOK.md` — Operational runbook. How to fix common issues, rotate secrets, restore from backup, etc. Built up over time.
- `docs/CHANGELOG.md` — User-facing change history.

When changing scope or architecture: update the relevant doc and add an entry to `DECISIONS.md`.

---

## Current Status (update this section as work progresses)

**As of:** May 21, 2026
**Phase:** Week 1 in progress — scaffold deployed; Phase 0 sign-off deferred, build proceeds
**Current week:** Week 1 (Mon tasks ~complete)
**Last milestone:** Next.js 15.5.18 + shadcn/ui scaffold deployed to Vercel preview; `ops.rentstayable.com` domain attached, DNS propagating. JN (812) confirmed as 8th property; MFA on-by-default for managers/corp confirmed.
**Next milestone:** Neon `DATABASE_URL` + `DIRECT_URL` set in Vercel envs; merge scaffold branch → `main` so production deploys are real; Tue Auth.js v5 work begins (with MFA scaffolding accounted for).

### Open questions awaiting answer
1. Can a field user invalidate their own assignment (call in sick) or manager only? — Owner: Rob/Kate — Needed by Week 2
2. Final list of recurring rules per template per property — Owner: Property Managers — Needed by Week 4
3. Bonus calculation logic (how does Bonus=1 vs 0 work in new platform?) — Owner: Rob — Needed by Week 3
4. SLA defaults per issue priority — Owner: Christopher — Needed by Week 4
5. Rob sign-off on scope + budget — **deferred 2026-05-21**; not blocking Phase 1 execution.

### Recently resolved decisions
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
