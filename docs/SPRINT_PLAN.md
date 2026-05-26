# RISE8 Operations Platform — 10-Week Sprint Plan

**Version:** 1.1
**Date:** May 15, 2026 (v1.0); revised 2026-05-27 (v1.1)
**Prepared by:** Kate, Director of Asset Management

**Change log**
- v1.1 (2026-05-27): Build extended from 8 → 10 weeks per ADR-012; new Week 9 (Contractor Checklists) and Week 10 (Quick Tasks); parallel run shifts to Weeks 11–14; cutover moves to Week 14.

---

## Overview

This sprint plan outlines a **10-week build schedule** for the RISE8 Operations Platform v1, followed by a 4-week parallel run and cutover from Connecteam. Each week has clear deliverables and a definition of done. The plan is designed for one focused developer using Claude Code, with Kate as product owner and Christopher as backup.

### Approach

- Build the riskiest things first (auth, photo capture, iOS PWA UX)
- Ship internally usable milestones at Week 4 and Week 8
- Test on real iPhones from Week 1 — do not wait until the end
- Parallel run with Connecteam, not big-bang cutover
- Hard scope discipline — anything not in this plan goes to v1.5 backlog

### Key Milestones

| Week | Milestone | Definition of Done |
|---|---|---|
| End of Week 1 | Foundation | Repo set up, deployed to Vercel, auth working, iPhone PWA shell installable |
| End of Week 4 | Alpha (internal demo) | Field user can complete and submit a checklist with photos; manager can review |
| End of Week 6 | Property Checklist feature complete | All Property Checklist v1 features built |
| End of Week 7 | UI Redesign + Hardening complete | Stayable Operations branding applied; PDF export, offline, accessibility, load test |
| End of Week 8 | Training & provisioning complete | All field staff accounts created; training sessions delivered |
| End of Week 9 | Contractor Checklists shipped | Magic-link contractor sign-off flow live; CONTRACTOR-audience templates seeded |
| End of Week 10 | Quick Tasks shipped — **Production ready** | Quick Tasks live across all surfaces; parallel run begins |
| End of Week 14 | Cutover | Connecteam set to read-only; new platform is sole system for operations |

---

## Week 1 — Foundation and Risk De-risking

**Goal:** Stand up the project skeleton and validate iOS PWA viability before building anything else.

### Deliverables

- Next.js 15 project initialized with TypeScript, Tailwind, shadcn/ui
- Git repo (GitHub) with `main` + `develop` branches
- Vercel project connected; auto-deploy on push
- Neon Postgres project created (free tier); `DATABASE_URL` configured
- Prisma installed; initial schema for users + properties + 1 sample table
- Auth.js v5 configured with Credentials provider
- Login + signup pages (basic, no styling yet)
- Test user can register, log in, log out
- PWA manifest + service worker registered (Workbox)
- App installable to iPhone home screen + Android home screen
- Photo capture proof-of-concept page (uses `input[type=file]` with capture attribute)
- Cloudflare R2 bucket created; photo upload via presigned URL working

### Day-Level Plan

- **Monday:** Repo, Vercel, Neon, basic Next.js with shadcn/ui.
- **Tuesday:** Auth.js Credentials, login/signup, password hashing.
- **Wednesday:** Prisma schema for users + properties; seed script.
- **Thursday:** PWA manifest + service worker; install on test iPhone and Android.
- **Friday:** Photo capture POC; R2 upload via presigned URL; verify EXIF + GPS handling on iOS and Android.

### Definition of Done

1. Anyone with the URL can sign up, log in, and see a "Hello, [name]" page
2. App can be installed to iPhone and Android home screen as PWA
3. A test photo can be captured on iPhone, uploaded to R2, displayed back in the app
4. GPS coordinates captured separately via geolocation API (validated on iOS — does it work?)

### Risks This Week

- iOS PWA install UX is awkward (requires Share → Add to Home Screen)
- iOS Safari may not return EXIF or may block geolocation in installed PWA
- If iOS issues are showstoppers, decision needed: tolerate, polyfill, or Capacitor wrapper

---

## Week 2 — Data Model and Templates

**Goal:** Build the data model and seed it with the 9 real templates.

### Deliverables

- Full database schema: users, properties, rooms, checklist_templates, questions, recurring_rules, checklist_instances, responses, photos, issues, audit_log
- Prisma migrations applied to staging Neon DB
- Seed script for all 7 properties with property IDs, names, addresses
- Seed script for all 9 checklist templates with their actual question sets (extracted from Connecteam/existing Smartsheet structure)
- Admin UI: list users, create user, deactivate user, reset password
- Admin UI: list properties, view geofence (placeholder map)
- Admin UI: list templates, view questions
- Role-based middleware enforcing route access

### Definition of Done

1. Admin can create users with role and property assignments
2. All 9 templates exist in DB with correct question sets
3. Non-admin users blocked from `/admin` routes
4. Database schema reviewed and approved (Kate + developer)

---

## Week 3 — Checklist Filling (Mobile-First UI)

**Goal:** Field users can open and complete a checklist. No review or dashboards yet.

### Deliverables

- Field user home page: list of today's assigned checklists
- Checklist filling page: renders questions in order
- All question types supported: SINGLE, MULTI, YESNO, PASSFAIL, NUMBER, SHORT_TEXT, LONG_TEXT, PHOTO, SIGNATURE, DATE, SECTION_DIVIDER
- Conditional logic working (show/hide based on prior answer)
- Photo capture with native camera, multiple photos per question, client-side compression
- Signature capture (touch/stylus on canvas)
- Draft auto-save to IndexedDB every change
- Submit action: validates required fields, uploads photos, persists responses, sets status to SUBMITTED
- Confirmation screen + return to home

### Definition of Done

1. Test user assigned to a manually-created instance can complete the full Arrival Checklist on iPhone and Android
2. Photos captured display correctly in app after submit
3. Drafts survive app close and reopen
4. Validation prevents submit when required fields blank

---

## Week 4 — Review, Approval, and Issues  [ALPHA MILESTONE]

**Goal:** End-to-end loop works. Field user submits, manager reviews. This is the alpha demo.

### Deliverables

- Manager home page: review queue (submissions awaiting review), sorted oldest-first
- Review detail page: shows all responses + photos + signatures + time-to-complete
- Approve button: sets status to REVIEWED, logs audit entry
- Flag button: sets status to FLAGGED with reason; auto-creates Issue record
- Request Re-do button: sets status back to ASSIGNED with manager note
- Issues list page: per-property issues filterable by status, priority
- Issue detail page: full info + assignment + resolution actions
- Auto-Issue creation when any PASSFAIL question = Fail (if `fail_flags_issue = true`)
- Email notification on submission to property manager (via Resend)
- Email notification on flag to submitting user

### Definition of Done — ALPHA

1. Internal demo: Kate plays HK role, completes a checklist on phone; Christopher plays manager, reviews and approves on desktop. Round-trip works.
2. Issue auto-created from a Fail response; assigned to MT; MT can mark resolved with note + photo
3. All email notifications delivered to test addresses
4. Demo recorded and shared with Rob

---

## Week 5 — Recurring Rules, Bulk Creation, Assignment

**Goal:** Manager doesn't have to manually create every instance. Recurrence works.

### Deliverables

- Recurring rules UI: admin/manager can configure rules per template per property
- Rule patterns: daily, weekly (specific days), monthly, quarterly, on-demand
- Vercel Cron job at 5:00 AM ET daily: generates instances for the day based on rules
- Bulk create UI: select template + property + date + room range/list; creates N instances
- Assignment UI: assign instance to specific user OR role pool
- Unassigned queue: managers see daily list of unassigned instances
- Invalidation flow: manager opens instance, clicks "Mark Invalid", selects reason, chooses reassign or leave
- Reassignment creates new instance with link to invalidated original

### Definition of Done

1. Recurring rule generates correct instances at 5:00 AM (validated by running cron job manually)
2. Manager can bulk-create 50 Arrival Checklists for tomorrow at Lakeland (rooms 100–149) in under 30 seconds
3. Invalidation + reassignment flow works; audit log shows trail

---

## Week 6 — Dashboards, Reports, Notifications, Geofence  [FEATURE COMPLETE]

**Goal:** Everything needed for production is in. Polish and bug fix from here on.

### Deliverables

- Field Staff Home dashboard (today's assignments, my completion rate, my bonus count)
- Property Manager dashboard (review queue, completion %, active issues, staff heatmap, unassigned)
- Corporate dashboard (portfolio %, per-property comparison, top issues, scorecard rollup)
- Issues dashboard (open issues, SLA breach alerts, repeat issues)
- Custom report builder (filters: property, template, user, status, date range; export CSV)
- In-app notification center with unread badge
- Geofence polygon editor in Admin (Leaflet map; draw + save)
- All 7 property geofences configured
- Photo geofence verification running on upload
- Daily 7:00 AM property manager digest email

### Definition of Done — FEATURE COMPLETE

1. All v1 features in PRD are implemented
2. All 7 properties have geofence polygons configured
3. Dashboards load in under 3 seconds with seeded test data
4. Feature freeze: only bug fixes and polish from here

---

## Week 7 — UI Redesign + PDF Export + Hardening

**Goal:** Apply Stayable Operations branding (ADR-010). Ship PDF parity. Hammer the app to find bugs.

### Deliverables

- **Stayable branding kit sourced from Kate** (logo, palette, wordmark "Stayable Operations")
- Claude Design pass: visual system (typography, colors, spacing, density), redesigned field / manager / admin screens
- Empty / error / loading / offline states designed for every screen
- Side-by-side review with Kate vs functional baseline before merging redesign
- PDF export via `@react-pdf/renderer` matching Connecteam visual style
- Single instance PDF export (immediate download)
- Bulk PDF export (background job via Inngest, email when ready, 7-day link)
- End-to-end testing on multiple iPhones and Android devices
- Offline mode tested: capture 3 checklists offline, reconnect, verify queued sync
- Load test: simulate 30 concurrent users submitting
- Accessibility audit: keyboard nav, screen reader basics, color contrast
- Error handling pass: every API route returns sensible errors
- All known bugs from Week 4–6 alpha testing fixed

### Definition of Done

1. PDF output looks professional, mirrors Connecteam format
2. Offline mode works on at least one iPhone and one Android device
3. No P0 or P1 bugs in tracker

---

## Week 8 — Training, Provisioning, Daily Digest Wiring

**Goal:** Real users provisioned. Manager and field-staff training delivered. Daily 7 AM PM email digest live.

### Deliverables

- Production environment fully configured (domain, secrets, monitoring) — partial; Quick Tasks domain bits land in Week 10
- All field staff provisioned with accounts; activation emails sent
- Training session per property (1 hour each, recorded for replay)
- Quick reference card distributed (PDF + printed) for field staff
- Manager training: full Property-Checklist feature walkthrough (1.5 hours)
- Runbook documented: how to handle common issues, where logs are, how to reset accounts
- Daily 7:00 AM ET property-manager email digest live (PRD §8)
- Support channel established (dedicated Teams channel)

### Definition of Done

1. All field staff have working accounts and can log in on their devices
2. Training sessions delivered + recordings archived
3. First production PM email digest delivered to a real manager inbox
4. Runbook reviewed by Kate

---

## Week 9 — Contractor Checklists (ADR-012)

**Goal:** Ship the Contractor Checklists module. Magic-link sign-off flow live.

### Deliverables

- `contractors` table + admin UI for contractor record management (per property)
- `checklist_templates.audience` enum (`EMPLOYEE` | `CONTRACTOR`) + UI for tagging templates
- `checklist_instances.contractor_id` field + creation flow targeting contractor records
- **Magic-link auth:** signed (JWT or HMAC), single-use, 72h-TTL URL generation tied to instance ID + contractor ID
- Token regeneration as one-click manager action
- Contractor-facing filling UI (no login screen, opens directly from link)
- Manager review queue handles contractor submissions — submitter column shows contractor name + company
- Flag → Issue tagged to contractor record
- Initial CONTRACTOR-audience template seeds: Roof PM, Pest Control, HVAC Service, Pressure Washing (contractor variant), Lawn / Landscaping — final list confirmed by Kate during the week

### Definition of Done

1. Manager creates contractor → creates instance → sends link → contractor completes → manager approves, all end-to-end
2. Token replay attempt is blocked (single-use enforced)
3. Expired token shows a clear regeneration prompt, not a generic error
4. Code review pass on magic-link token signing + replay protection

---

## Week 10 — Quick Tasks (ADR-012)  [PRODUCTION READY]

**Goal:** Ship Quick Tasks. Production-ready. Parallel run begins.

### Deliverables

- `quick_tasks` table + photo join table
- Manager / Corporate / Admin creation surface (title, description, property, assignee or role pool, due date, priority)
- Field staff "My Tasks" surface in home; sorted by due date asc → priority desc
- Manager "Open Tasks" view at their property with filters
- Corporate dashboard rollup of open / overdue Quick Tasks per property
- Production environment fully configured (domain, secrets, monitoring)
- Production database seeded with real users, properties, templates, recurring rules
- All field staff provisioned with accounts; activation emails sent
- Training session per property (1 hour each, recorded for replay)
- Quick reference card distributed (PDF + printed) for field staff
- Manager training: full feature walkthrough including Contractor Checklists + Quick Tasks (2 hours)
- Runbook documented
- Support channel established (dedicated Teams channel)
- Parallel run starts: staff complete checklists in both Connecteam and new platform

### Definition of Done — PRODUCTION READY

1. All field staff have working accounts
2. Quick Tasks creation → assignment → completion works end-to-end on mobile
3. First production submission completed successfully
4. Daily monitoring report set up (delivered to Kate every morning)
5. Parallel run officially active

---

## Weeks 11–14 — Parallel Run and Cutover

**Goal:** Validate new platform parity, fix gaps, cut over from Connecteam.

### Week 11 — Stabilization
- Daily monitoring of completion rates in both systems
- Triage incoming bug reports from field staff
- Fix P0 and P1 issues within 24 hours
- Track feature gaps requested by managers

### Week 12 — Optimization
- Performance tuning based on real-world usage data
- UX refinements based on field staff feedback
- Add any high-priority missing features identified during parallel run

### Week 13 — Cutover Prep
- Compare completion rates: new platform vs Connecteam baseline
- If parity achieved for 2 consecutive weeks, schedule cutover for end of Week 14
- Communicate cutover date 1 week in advance to all staff
- Final training refresher session for any stragglers

### Week 14 — Cutover
- Day-of: Connecteam set to read-only access
- Karla stops manual PDF uploads to Smartsheet
- Smartsheet sheets archived (no new rows added; existing data preserved)
- Cutover retrospective scheduled for Week 15
- New platform is sole system for operations

---

## Resources and Costs

### People

- Primary developer: 1 person, full-time, 10 weeks build + 4 weeks parallel run support
- Product owner / project lead: Kate (5–10 hours/week)
- Backup / second pair of eyes: Christopher (2–5 hours/week)
- Sponsor / decision-maker: Rob (1–2 hours/week)
- Property managers (for training and parallel run feedback): 2 hours each in Week 8

### One-Time Costs

- Development: covered by existing developer + Claude Code
- Domain: $0 (using existing rentstayable.com or stayable.com)
- Training time: ~14 hours total across all properties

### Recurring Monthly Costs

- Neon Postgres Pro: $19
- Cloudflare R2 storage: ~$2–5 (grows with photo volume)
- Resend: $0 during free tier; $20 if exceeded
- Vercel: $0 free tier should suffice; $20 if Pro features needed
- Inngest: $0 free tier
- Sentry: $0 free tier
- **Total expected:** $25–$45/month

### Cost Comparison vs Connecteam

If Connecteam currently costs approximately $30/user/month × 30 users = $900/month, the new platform breaks even on Day 1 of cutover. Annual savings: approximately $10,000–$12,000, plus the reclaimed 1–2 hours/day of Karla and Christopher's time (~$15,000–$25,000/year in productivity value).

> **Note:** actual Connecteam cost should be confirmed against the current invoice before this savings figure is treated as final.

---

## Definition of Failure (and How to Stop)

This project should be stopped or paused if any of the following occurs. Better to abandon a sunk-cost project than to ship a broken one.

### Hard Stop Conditions

- **End of Week 1:** iOS PWA cannot reliably capture photos with GPS coordinates. Without this, geofence verification is impossible and the project's value drops significantly.
- **End of Week 4 (Alpha):** Internal demo fails to complete a full round trip. If alpha doesn't work, weeks 5–8 are building on broken foundation.
- **End of Week 12 (Parallel run):** New platform completion rate is below 70% of Connecteam baseline. Field staff are rejecting the tool.

### Pause and Reassess Conditions

- Developer becomes unavailable for more than 2 weeks
- Discovery of a critical feature missed in scoping (e.g., regulatory requirement)
- Cost projections exceed initial estimate by more than 2x

### Success Beyond Cutover

Post-cutover, the platform's continued success is measured monthly against the metrics in PRD Section 11. If any metric trends backward for 2 consecutive months, schedule a review.

---

*End of Sprint Plan*
