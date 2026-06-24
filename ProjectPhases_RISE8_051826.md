# RISE8 Operations Platform — Project Phases

**As of:** May 18, 2026
**Owner:** Kate Estocapio (Director of Asset Management)
**Sponsor:** Rob Beyer (CEO)
**Developer:** TBD (kickoff gated on Rob sign-off)

Each phase has **target milestones** (each = a feature or tangible output that can be reviewed) and an **exit gate** that must be passed before the next phase begins.

Status legend: ✅ Complete · 🟡 Active · ⚪ Not Started · 🔴 Blocked

---

## Phase 0 — Pre-Build Planning
**Status:** ✅ Complete
**Window:** through May 18, 2026
**Owner:** Kate

### Target milestones
1. **PRD** — `docs/PRD.md` finalized, covering scope, 6 roles, 9 templates, 11 question types, auth, photo + geofence rules, out-of-scope list.
2. **Technical Architecture** — `docs/ARCHITECTURE.md` finalized with stack, data model, API surface, env vars, security model.
3. **8-Week Sprint Plan** — `docs/SPRINT_PLAN.md` finalized with weekly deliverables, alpha and feature-complete gates, parallel-run plan, cutover plan.
4. **ADRs 001–006** — `docs/DECISIONS.md` records the six locked decisions (auth, hosting, ORM, photo storage, sync strategy, mobile shell).
5. **Repo conventions** — `CLAUDE.md`, `TODO.md`, branching + naming + env-var standard.

### Exit gate
- Rob signs off on scope + budget. *Open — gates Phase 1 start.*
- Property count (7 vs 8 — Jacksonville North 812) resolved. *Open — gates Phase 2 seed.*

---

## Phase 1 — Foundation & iOS PWA De-risking
**Status:** 🟡 Active (queued; starts on Rob sign-off)
**Window:** Week 1
**Owner:** Developer
**Review:** Kate

### Target milestones
1. **Live skeleton on Vercel** — Next.js 15 + TS + Tailwind + shadcn deployed; `https://<preview>.vercel.app` reachable.
2. **Working auth** — sign-up → log-in → "Hello, name" home page end-to-end with Auth.js v5 + Neon.
3. **Prisma schema v1** — `users`, `properties`, `user_properties` migrated to Neon; seed runs cleanly for 7 (or 8) properties + 1 admin + 1 manager + 1 HK.
4. **Installable PWA** — manifest + service worker, installs to iPhone home screen and Android home screen with the correct icon and offline shell.
5. **Photo + GPS POC** — test page captures photo via native camera, compresses client-side, uploads to R2, captures GPS separately via `navigator.geolocation`. Results recorded in `docs/PWA_TEST_RESULTS.md`.

### Exit gate **(CRITICAL — go/no-go on PWA strategy)**
- Photo + GPS verified working on a real iPhone in installed-PWA mode (not Safari tab).
- If GPS fails on iOS PWA, escalate to Kate and trigger Capacitor wrapper fallback (+1 week, Apple Developer account required).
- Reviewer: Kate signs off before Phase 2 begins.

---

## Phase 2 — Data Model & Admin Scaffolding
**Status:** ⚪ Not Started
**Window:** Week 2
**Owner:** Developer
**Review:** Kate + Christopher

### Target milestones
1. **Full schema** — `rooms`, `checklist_templates`, `questions`, `recurring_rules`, `checklist_instances`, `responses`, `photos`, `issues`, `audit_log`, `notification_log` migrated with all indexes.
2. **Template seed** — all 9 templates with real question sets pulled from current Connecteam + Smartsheet content.
3. **Admin UI v1** — list/create/deactivate users · one-click password reset · list properties · list templates (read-only OK).
4. **RBAC middleware** — every API route enforces role + property scope; spot-check coverage with a manual matrix.
5. **Activation-email flow** — admin provisions user → Resend sends activation link → user sets password (7-day TTL).

### Exit gate
- Karla or Christopher can provision a real test user end-to-end without developer help.
- Field-user self-invalidate vs manager-only question resolved (Rob/Kate). *Open.*

---

## Phase 3 — Checklist Filling (Mobile-First)
**Status:** ⚪ Not Started
**Window:** Week 3
**Owner:** Developer
**Review:** Kate + one real field user (HK or PA)

### Target milestones
1. **Today view** — field user opens app, sees their assignments for today.
2. **Checklist runtime** — all 11 question types render and validate on iPhone Safari and PWA.
3. **Conditional logic** — `show_if` rules work for at least the Maintenance Report and Room Inspection templates.
4. **Photo + signature capture** — multi-photo per question, signature canvas, compressed and uploaded.
5. **Draft + submit** — auto-save to IndexedDB on every change; submit pipeline validates → uploads → persists → marks SUBMITTED.

### Exit gate
- A real Stayable field user (not the developer) completes the Arrival Checklist on their phone end-to-end and the submission shows up in the admin DB.
- Bonus rule logic clarified (Rob). *Open.*

---

## Phase 4 — Review + Issues  **[ALPHA MILESTONE]**
**Status:** ⚪ Not Started
**Window:** Week 4
**Owner:** Developer
**Review:** Kate + Rob (alpha demo)

### Target milestones
1. **Manager review queue** — oldest-first list of SUBMITTED checklists for the manager's property.
2. **Review detail** — responses + photos + signatures + time-to-complete visible on one screen.
3. **Approve / Flag / Re-do** — three actions, each with an audit-log entry; flag triggers email to submitter.
4. **Auto-issue creation** — a `PASSFAIL=Fail` response with `fail_flags_issue=true` auto-creates an issue with the photo attached.
5. **Issue resolution flow** — assignee adds resolution note + verification photo to close.
6. **Alpha demo** — recorded screen-record walkthrough of submit → review → flag → resolve, shared with Rob.

### Exit gate
- Rob watches alpha demo and signs off to continue.
- SLA defaults per priority confirmed (Christopher). *Open.*

---

## Phase 5 — Recurrence, Bulk, Assignment
**Status:** ⚪ Not Started
**Window:** Week 5
**Owner:** Developer
**Review:** Property Managers

### Target milestones
1. **Recurring rules UI** — admin/manager configures daily/weekly/monthly/quarterly/on-demand rules per template per property.
2. **Nightly generator** — Vercel Cron at 5:00 AM ET runs `/api/cron/generate-checklists` and creates the day's instances.
3. **Bulk-create UI** — template + property + date(s) + room range produces N instances in one action.
4. **Assignment model** — instance can be assigned to a specific user, a role pool (e.g., any HK), or left unassigned.
5. **Unassigned-queue digest** — 7:00 AM ET email to managers listing unassigned checklists.
6. **Invalidation chain** — reason + reassignment captured in audit log.

### Exit gate
- One real property's full week of recurring checklists generates correctly overnight.
- Final recurring rules per template per property delivered by PMs. *Open.*

---

## Phase 6 — Dashboards, Geofence, Notifications  **[FEATURE COMPLETE]**
**Status:** ⚪ Not Started
**Window:** Week 6
**Owner:** Developer
**Review:** Kate + Rob

### Target milestones
1. **Field Staff Home dashboard** — today's assignments + recent submissions.
2. **Property Manager dashboard** — review queue, completion %, open issues, heatmap, unassigned count.
3. **Corporate dashboard** — portfolio completion %, property comparison, top issues, scorecards.
4. **Issues dashboard** — open count, SLA breach, repeat-offender rooms.
5. **Geofence editor** — Leaflet polygon draw + save; all 7 (or 8) property polygons configured.
6. **Geofence verification** — on photo upload, badge each photo VERIFIED / OFF_PROPERTY / NO_GPS.
7. **Notifications** — in-app notification center + unread badge; 7:00 AM PM digest email; flag/approve emails.
8. **Custom report builder + CSV export.**

### Exit gate (**Feature Complete**)
- Every required v1 feature from the PRD is built and demonstrable.
- Kate + Rob walk through every dashboard and approve UX direction (functional, not polish — polish comes in Phase 7).
- Final geofence polygons delivered by Kate. *Open.*

---

## Phase 7 — UI Redesign + Hardening
**Status:** ⚪ Not Started
**Window:** Week 7
**Owner:** Developer
**Review:** Kate

### Target milestones
1. **Claude Design UI redesign pass** — once backbone + features are stable (end of Phase 6), run the full app through Claude Design (`document-skills:frontend-design`) for visual + interaction polish. Replace placeholder shadcn defaults with a coherent visual system (typography scale, color tokens, density, empty states, error states, loading states). Output: redesigned screens reviewed against the live functional app — no regressions to functionality.
2. **PDF export** — `@react-pdf/renderer` template matches the Connecteam PDF style; single-instance immediate, bulk via Inngest with emailed 7-day link.
3. **Offline test** — fill 3 checklists offline → reconnect → all sync without data loss.
4. **Load test** — 30 concurrent submitters; no errors, p95 < 2s.
5. **Accessibility audit** — keyboard nav, screen-reader smoke test, WCAG AA contrast pass.
6. **Bug burn-down** — every P0/P1 from alpha + feature-complete review cleared.

### Exit gate
- Kate reviews redesigned screens side-by-side with the functional app and approves visual direction.
- All P0/P1 bugs closed; Sentry shows no unresolved high-severity errors.

---

## Phase 8 — Training & Go-Live  **[PRODUCTION READY]**
**Status:** ⚪ Not Started
**Window:** Week 8
**Owner:** Developer + Kate
**Review:** Rob (go-live decision)

### Target milestones
1. **Production environment live** — domain + secrets + Sentry + Vercel Analytics configured.
2. **Production data seeded** — real users, properties, templates, recurring rules.
3. **Activation emails sent** — every field staff member has an account and a working login.
4. **Per-property training** — 1-hour session at each property, recorded.
5. **Manager training** — 1.5-hour session for property managers + corporate.
6. **Quick reference card** — PDF + printed for every property.
7. **Runbook extended** — `docs/RUNBOOK.md` updated with real operational gotchas surfaced during training.
8. **Support channel live** — Teams channel for field-staff issues.

### Exit gate
- Parallel run officially active: new platform + Connecteam running side-by-side.
- Daily monitoring report goes to Kate every morning.
- Rob green-lights parallel run start.

---

## Phase 9 — Parallel Run & Cutover
**Status:** ⚪ Not Started
**Window:** Weeks 9–12
**Owner:** Kate + Developer
**Review:** Rob (cutover decision)

### Target milestones
1. **Week 9 — Parity monitoring** — daily comparison between new platform and Connecteam; P0/P1 fixed within 24h.
2. **Week 10 — Tuning** — perf + UX refinements from real-world use.
3. **Week 11 — Parity decision** — if new platform ≥ Connecteam baseline for 2 consecutive weeks, schedule cutover date and communicate 1 week in advance.
4. **Week 12 — Cutover** — Connecteam set to read-only; Karla stops manual Smartsheet uploads; Smartsheet sheets archived.
5. **Retro** — Week 13 retrospective scheduled with all stakeholders.

### Exit gate
- New platform is the sole source of truth for operational checklists.
- Karla's 1–2 hours/day burden eliminated.
- Cost savings vs Connecteam documented and reported to Rob.

---

## Phase status summary

| Phase | Status | Window | Exit reviewer |
|---|---|---|---|
| 0 — Pre-Build Planning | ✅ Complete | through May 18, 2026 | Rob (sign-off pending) |
| 1 — Foundation & iOS PWA De-risk | 🟡 Active | Week 1 | Kate |
| 2 — Data Model & Admin | ⚪ Not Started | Week 2 | Kate + Christopher |
| 3 — Checklist Filling | ⚪ Not Started | Week 3 | Kate + real field user |
| 4 — Review + Issues [ALPHA] | ⚪ Not Started | Week 4 | Kate + Rob |
| 5 — Recurrence, Bulk, Assignment | ⚪ Not Started | Week 5 | Property Managers |
| 6 — Dashboards, Geofence, Notifications [FEATURE COMPLETE] | ⚪ Not Started | Week 6 | Kate + Rob |
| 7 — UI Redesign (Claude Design) + Hardening | ⚪ Not Started | Week 7 | Kate |
| 8 — Training & Go-Live [PROD READY] | ⚪ Not Started | Week 8 | Rob |
| 9 — Parallel Run & Cutover | ⚪ Not Started | Weeks 9–12 | Rob |

---

*Tied to `docs/SPRINT_PLAN.md` (weekly task detail) and `TODO.md` (row-level tracker). Update phase status here as gates are passed; mirror major changes into `docs/DECISIONS.md` if they alter scope or architecture.*
