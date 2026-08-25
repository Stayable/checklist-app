# Architecture Decision Records (ADRs)

This file is an append-only log of significant decisions made on the RISE8 Operations Platform project. Each entry captures the decision, the alternatives considered, the rationale, and the date.

When adding a new ADR, increment the number and follow the template at the bottom.

---

## ADR-001: Build a custom web application instead of replacing Connecteam with another off-the-shelf tool

**Date:** 2026-05-15
**Status:** Accepted

### Context
Connecteam handles operational checklists for 7 Stayable properties but creates two problems: (1) checklists submitted in Connecteam must be manually downloaded as PDFs and re-uploaded to Smartsheet by Karla and Christopher (1–2 hours/day), and (2) structured response data is buried in PDFs and not queryable. Other off-the-shelf checklist tools (Jolt, SafetyCulture, GoCanvas) were considered but have the same fundamental problem — they're black boxes that don't integrate naturally with the rest of the Stayable operations stack.

### Alternatives Considered
1. Stay with Connecteam + build a Connecteam → Smartsheet integration via Make.com
2. Replace Connecteam with another SaaS (Jolt, SafetyCulture, GoCanvas)
3. Build a custom web application

### Decision
Build a custom web application using Claude Code. Kate's team has the development capacity, and a custom build allows tight integration with Smartsheet, custom workflows (bulk creation, attendance invalidation), and ownership of the roadmap.

### Consequences
- Higher upfront effort (8 weeks) vs immediate integration with Make.com (~1–2 weeks)
- Ongoing maintenance burden falls on Kate's team
- Significantly lower long-term cost ($25–$45/mo vs $900/mo Connecteam estimate)
- Full control over feature set; can add bulk creation, geofence verification, employee scorecards

---

## ADR-002: Build as a Progressive Web App (PWA), not a native mobile app

**Date:** 2026-05-15
**Status:** Accepted

### Context
Field staff need to use the app on mobile devices. Connecteam currently provides a native iOS and Android app with offline support. The question was whether to match that with a native build or use a PWA.

### Alternatives Considered
1. Native React Native app (iOS + Android)
2. Capacitor wrapper around a web app
3. Progressive Web App (PWA) with service worker + IndexedDB

### Decision
Build as a PWA. With 2Gbps fiber and AP buildout across all properties, offline use is an edge case (stairwells, between buildings), not the normal case. PWAs avoid app store overhead, allow instant updates, and Claude Code can iterate faster on web than mobile native.

### Consequences
- iOS PWA limitations are real (storage limits, push notification limits, background sync limits)
- Week 1 of build is dedicated to validating iOS PWA viability — if it fails, fall back to Capacitor wrapper in v1.5
- Offline support is "good enough for short windows" not "multi-day offline tolerant"
- Single codebase for desktop and mobile

---

## ADR-003: Authentication via email + password for all users (no Microsoft 365 SSO in v1)

**Date:** 2026-05-15
**Status:** Accepted

### Context
Only managers and corporate currently have Microsoft 365 accounts. Field staff (HK, PA, MT) do not. Authentication options included full M365 SSO for everyone (~$180/mo additional cost), hybrid (M365 for managers + SMS OTP for field), or email + password for everyone.

### Alternatives Considered
1. M365 accounts for everyone (~$180/mo additional cost)
2. Hybrid: M365 SSO + SMS OTP for field staff (~$10–20/mo)
3. Email + password for everyone ($0)

### Decision
Email + password for everyone. Kate accepts the admin burden (estimated 2–5 password resets/week).

### Consequences
- No per-user authentication cost
- Admin must build one-click password reset action (mitigation in scope)
- Some field staff may not regularly check email, complicating self-service reset
- Future: M365 SSO can be added as an additional provider without disrupting field staff login

---

## ADR-004: No Smartsheet write-through during transition; Smartsheet becomes read-only archive on cutover

**Date:** 2026-05-15
**Status:** Accepted

### Context
The current pipeline writes operational data to Smartsheet (via manual Karla/Christopher uploads). Question: should the new platform dual-write to Smartsheet during the transition period to keep existing dashboards alive?

### Alternatives Considered
1. Dual-write during transition (6 months), then retire Smartsheet
2. No write-through; Smartsheet becomes historical archive on cutover (fresh start)
3. Keep Smartsheet sync indefinitely

### Decision
No write-through. Smartsheet becomes read-only archive on cutover. New platform starts fresh — no backfill, no dual-write.

### Consequences
- Build simplifies by ~1 week (no Smartsheet integration code)
- No reconciliation complexity (which system has truth when they diverge?)
- Existing Smartsheet dashboards stop receiving new data on cutover (they become historical reference only)
- New platform must have its own dashboards by cutover (already in scope)

---

## ADR-005: Tech stack — Next.js 15 + Vercel + Neon Postgres + Prisma + Cloudflare R2 + Auth.js + Resend

**Date:** 2026-05-15
**Status:** Accepted

### Context
Choice of tech stack drives developer velocity, ongoing cost, and future flexibility.

### Decision
- **Framework:** Next.js 15 (App Router) — server-side rendering and API routes in one codebase
- **Hosting:** Vercel — existing free tier, zero-config Next.js deployment
- **Database:** Neon Postgres — existing free tier, serverless, branches for preview environments
- **ORM:** Prisma (or Drizzle — developer's choice, pick one)
- **Object Storage:** Cloudflare R2 — no egress fees, ~$0.015/GB
- **Auth:** Auth.js v5 — open-source, supports credentials + future SSO
- **Email:** Resend — existing free tier
- **UI:** shadcn/ui + Tailwind CSS — works well with Claude Code, fully customizable

### Consequences
- All-in cost projected at $25–$45/month at production scale
- Most services have free tiers that cover early development
- Stack is well-known and well-documented; Claude Code support is strong
- Single deploy target (Vercel) simplifies operations

---

## ADR-006: Out of scope for v1 — time tracking, payroll, HR, scheduling, chat, hiring, training, knowledge base

**Date:** 2026-05-15
**Status:** Accepted — partially superseded by ADR-012 (2026-05-27) for Contractor Checklists + Quick Tasks, which are now **in scope** for v1. All other exclusions in this ADR remain in force.

### Context
Connecteam handles many modules beyond checklists. Question: which to replicate in v1?

### Decision
Operations-only scope. Out of scope:
- Time clock / time tracking → handled by Paycom
- Payroll / benefits / HR → handled by Paycom
- Shift scheduling → handled by Paycom
- Hiring / onboarding → out
- Training / courses / knowledge base → use SharePoint
- Chat / messaging → out
- Surveys → out
- Guest-facing features → out

In scope:
- Operational checklists (assignment, completion, review)
- Photos with geofence verification (this is our "time tracking" via EXIF)
- Issues pipeline
- Recurring/bulk creation
- Dashboards
- PDF export on request

### Consequences
- v1 timeline drops to 8 weeks (vs 20+ weeks for Connecteam parity)
- Connecteam can be fully retired post-cutover since Paycom covers everything else
- Future v1.5+ can add scope if needed (push notifications, anomaly detection, AI photo analysis)

---

## ADR-007: Jacksonville North (812) is in scope as the 8th property

**Date:** 2026-05-21
**Status:** Accepted

### Context
The PRD lists 8 properties but the original CLAUDE.md scope card listed 7, leaving JN (812) ambiguous. The Week 2 seed and the geofence work in Week 6 both need a definitive answer so we are not retrofitting an 8th property mid-build.

### Alternatives Considered
1. Ship v1 with 7 properties and add JN post-cutover as a v1.5 addition
2. Include JN in v1 from the start

### Decision
Include Jacksonville North (812) as the 8th active property. Seed scripts, geofence polygons, recurring rules, training, and provisioning all assume 8 properties.

### Consequences
- One additional property to configure during Week 8 go-live (users, rooms, geofence polygon, recurring rules)
- No retrofit work later; cleaner cutover
- Marginal effort increase in Weeks 5–8; no schema changes required

---

## ADR-008: MFA on-by-default for managers and corporate; optional for field staff

**Date:** 2026-05-21
**Status:** Accepted

### Context
The auth design called for MFA but left the default state open: on-by-default vs opt-in for managers/corporate. Field-staff MFA is friction-heavy on shared/older devices and the role rarely sees sensitive cross-property data, so the trade-off is different per role.

### Alternatives Considered
1. MFA opt-in for all roles
2. MFA on-by-default for all roles
3. MFA on-by-default for managers/corporate/admin; optional/off-by-default for field staff

### Decision
Option 3. MFA is on-by-default for MANAGER, CORPORATE, and ADMIN roles. Field staff (HK, PA, MT) can enable MFA but it is off by default. Implementation is TOTP via authenticator app (Google Authenticator, Authy, 1Password, etc.) — **no SMS**.

### Consequences
- Week 1 Auth.js scaffolding must include TOTP enrollment + verification flow (not just stub)
- Manager/corp first-login flow includes a forced MFA enrollment step before reaching the dashboard
- Recovery codes generated on enrollment; admin can reset MFA via the same one-click flow that resets passwords
- Field-staff login stays one-step; no friction added to the most common path

---

## ADR-009: Recurring-rule control model and checklist instance naming structure

**Date:** 2026-05-26
**Status:** Accepted

### Context
The PRD specifies recurring + bulk checklist creation but does not pin down (a) who can create/edit/pause recurring rules, (b) what knobs each rule exposes, or (c) how each auto-generated instance is identified in storage, in the UI, and in exported PDFs. Without these locked, the Week 5 recurrence work cannot start cleanly and seed/template work in Weeks 2–3 will produce inconsistent labels.

### Alternatives Considered

**Control model**
1. Admin-only rule creation; managers can only view
2. Admin + Manager (own property) rule creation; field staff none
3. Any non-field role can create rules anywhere

**Per-rule generation time**
1. One global cron at 5:00 AM ET for all rules
2. Per-rule configurable generation time

**Sequence numbering in system ID**
1. Continuous per template+property (never resets)
2. Restart per day, anchored to America/New_York date (auto-handles EDT/EST DST)

**Holiday / blackout calendar**
1. Global holiday calendar maintained by Admin
2. Per-property calendar maintained by Manager
3. No calendar; managers manually pause rules

**Room "occupied" source for per-room templates**
1. PMS integration / live feed
2. Manual `rooms.status` field maintained in-app
3. Manager-set each morning

### Decision

**Who can control recurring rules**
- **Admin** — global; create / edit / pause / delete any rule at any property
- **Manager** — own property only; create / edit / pause rules; cannot edit other properties; all changes written to `audit_log` with actor, rule ID, before/after
- **Corporate** — read-write across all properties (per PRD §3)
- **HK / PA / MT** — no rule access; see assignments only

**Per-rule knobs**
- Template (locked after create)
- Property (locked after create)
- Pattern: `daily` / `weekly` (with day-of-week) / `monthly` (with day-of-month) / `quarterly` / `on-demand`
- Scope: `per-room` (filter: occupied / vacant / room list / room range), `per-property`, `per-area`
- Assignment policy: specific user · role pool · unassigned
- Effective date range (default: indefinite)
- Active toggle (pause without deleting)
- Skip days (simple weekday/date list)

**Override paths**
- Bulk create (existing) for one-offs
- "Force-create today" from a paused rule
- "Skip today" on an active rule
- Manual reassign / invalidate after generation

**Generation time**
- One global cron at 5:00 AM ET (`America/New_York`, auto-handles EDT/EST DST). **No** per-rule time override in v1.

**Room "occupied" source**
- Manual `rooms.status` table in v1. PMS integration is a separate future project.

**Holiday / blackout calendar**
- None in v1. Managers manually pause rules or use "Skip today."

**Naming — system ID (immutable, used for joins, audit, URLs)**
`CL-{propertyID}-{templateCode}-{YYYYMMDD}-{seq}`
- `propertyID` = numeric property ID (e.g., 4645)
- `templateCode` = 3-letter code: `ARR` Arrival · `DEP` DueOut/Departure · `HKR` HK Review · `PAR` PA Review · `MGR` Manager Review · `MNT` Maintenance Report · `PWR` Pressure Washing · `RPM` Roof PM · `RIN` Room Inspection
- `YYYYMMDD` = scheduled date in `America/New_York` (current ET date at generation time — auto EDT in summer, EST in winter)
- `seq` = zero-padded 3-digit sequence, **restarts at 001 each ET day**, ordered by creation time within that template+property+date

Examples: `CL-4645-ARR-20260526-012`, `CL-6802-PWR-20260526-001`

**Naming — human label (UI, dashboards, email subject lines)**
`{Template} — {Short Code} — {Scope} — {Date}`
- `Arrival Checklist — Lakeland — Rm 312 — May 26, 2026`
- `Pressure Washing — JW — May 2026`
- `HK Review — KE — Wk of May 25, 2026`
- `Maintenance Report — Davenport — Task #012 — May 26, 2026`

**Naming — PDF filename (follows project file-naming convention `Title_PropertyID_MMDDYY.ext`)**
- `Arrival_4645_052626_Rm312.pdf`
- `PressureWashing_6802_052626.pdf`
- `MaintenanceReport_5399_052626_012.pdf`
- `HKReview_2295_WkOf052526.pdf`

### Consequences
- Recurring-rule UI in Week 5 has a defined control surface to build against; manager-scoped RBAC enforced through existing property-scope middleware
- All rule mutations write to `audit_log` — supports compliance and "who changed what" debugging
- One global cron is simpler to monitor, retry, and reason about; if a PM later needs a different generation time, revisit
- Manual `rooms.status` adds a small Admin/Manager maintenance burden but avoids a PMS integration dependency in v1
- ET-anchored dates mean a checklist generated at 5:00 AM ET on May 26 is consistently `…-20260526-…` regardless of the server's UTC clock — important for audit, PDF filenames, and cross-property reporting
- Sequence restarting daily keeps IDs short and human-scannable; URLs and PDF filenames remain readable
- No holiday calendar in v1 means managers carry that burden manually — acceptable since the 8 properties are 24/7 operations with very few true blackout days; add later if real demand emerges

---

## ADR-010: Daily Teams digest — master corporate channel + per-property channels; product name "Stayable Operations"

**Date:** 2026-05-27
**Status:** Accepted

### Context
Currently Karla / Christopher read every prior-day submission across all 8 properties and manually type a single portfolio-wide morning summary into a corporate Teams channel (see `docs/assets/connecteam-snapshots/image (9).png` for the canonical format). The PRD §8 notification table lists a "Daily morning summary" but only as an email to property managers — it does not include a Teams channel post, nor a corporate consolidation. This is one of the largest manual workloads in the current pipeline and a primary driver for building the platform.

Separately, Stayable's current Connecteam instance is white-labeled with the Stayable logo (visible in `docs/assets/connecteam-snapshots/image (10).png`). The new platform needs an end-user product name.

### Alternatives Considered

**Digest delivery**
1. Email-only daily summary to PMs (current PRD §8)
2. One master Teams channel post (portfolio-wide only)
3. Per-property Teams channel post (one per channel)
4. Both: master corporate channel + per-property channels — mirrors the current human workflow

**Auto-gen tone**
1. Match the human-empathetic prose of the current manual digest ("…we would like to make sure there are no surprises for the next guest…")
2. Terser, factual auto-gen text; humans can post custom prose on top

**Product name (end-user)**
1. "RISE8 Operations Platform" (internal/dev name)
2. "Stayable Operations"
3. Reuse "Connecteam"–like name

### Decision

**Delivery — Option 4.** Each morning at 7:00 AM ET the platform posts:
- One **master corporate digest** to a single RISE8 corporate Teams channel covering all 8 properties
- One **per-property digest** to each property's dedicated Teams channel, scoped to that property only

**Tone — Option 2.** Auto-gen text is terse and factual. Custom prose remains a human responsibility (manager or corporate can post a reply / additional message on top). Auto-gen does not attempt to match the empathetic phrasing of the human-typed version.

**Per-property block format** (used in both master and per-property channels; in the master, all 8 blocks are concatenated):
- Property 2-letter short code as header (JN, JW, KE, KW, LL, OR, SA, DP — see ADR-011)
- **Misses:** template name + list of room#s where no submission was made for the prior day
- **Flagged issues:** from manager flags + Pass/Fail = Fail responses, with room# + 1-line description
- **Photo verification anomalies:** count of OFF_PROPERTY or NO_GPS photos
- Each line links to the source instance in the platform

**Product name — Option 2.** End-user product name is **"Stayable Operations"**. "RISE8 Operations Platform" remains the internal/dev/repo name. Phase 7 design pass uses Stayable branding (logo, colors, "Stayable Operations" wordmark) — not RISE8 branding.

**Priority.** Lower than P0 daily PM email. The Teams digest lands in **Phase 7 (UI Redesign + Hardening)**, not Phase 6. The 7:00 AM ET PM email digest from PRD §8 ships in Phase 6 as already planned.

**Delivery mechanism (v1).** Teams Incoming Webhooks — one per channel, simplest auth model:
- 1 webhook URL for the corporate channel
- 8 webhook URLs for property channels (one per property; mapped in a `property_channels` table)
- Cron via Inngest at 7:00 AM ET (`America/New_York`), runs after the 5:00 AM ET checklist-generation cron
- If a property channel webhook is missing or fails, log to `notification_log` and continue with remaining channels — never block the corporate digest

### Consequences
- Requires Teams workspace inventory before Phase 7: 1 corporate channel + 8 property channels confirmed and webhook URLs collected
- If a property channel does not exist at v1, that property is silently skipped (its content still appears in the master corporate digest)
- Reduces Karla/Christopher's morning typing time from ~30–60 min to effectively zero; they retain the option to reply with a custom note
- Auto-gen tone is a behavioral shift for the audience — corporate readers should be briefed that the new digest is factual, not empathetic
- Branding work for Phase 7 redesign is now scoped to "Stayable Operations" — logo, color palette, wordmark all sourced from Kate
- Graph API integration (richer formatting, threading, mentions) deferred to v1.5+; webhooks are sufficient for v1
- `notification_log` schema must record Teams channel delivery status (success / failed / skipped) alongside email delivery

---

## ADR-011: Manager Review UI patterns + canonical 2-letter property short codes

**Date:** 2026-05-27
**Status:** Accepted

### Context
Two related UX decisions surfaced from reviewing the Connecteam screenshots in `docs/assets/connecteam-snapshots/`:

1. **Single-submission review** (image 10): Connecteam uses a three-column layout — left rail for manager fields (status + note), center for question responses + photos, right rail for activity timeline (each status change / note / submission stamped with actor + timestamp). PMs are already trained on this pattern.

2. **Submission queue** (image 11): Connecteam shows submissions as a table — one row per submission, columns for User · Date · Unit# · then one column per photo question with inline thumbnails. PMs can scan 20+ submissions in seconds without clicking in.

3. **Property short codes** (image 9): The current Karla/Christopher manual Teams digest uses 2-letter codes (KE, SA, DP, LL). The CLAUDE.md / PRD draft had friendlier codes (Kiss E, St. Aug, Davenport, Lakeland) — different from existing reader habit.

### Alternatives Considered

**Review UI**
1. Build a new review layout from scratch in Phase 4, redesign again in Phase 7
2. Match Connecteam's three-column pattern in Phase 4, refine in Phase 7
3. Defer all review UI decisions to Phase 7

**Queue UI**
1. Simple list view in Phase 4, add table+thumbnails in Phase 7
2. Lock the table+thumbnails pattern in Phase 4

**Short codes**
1. Keep friendlier short codes everywhere (Kiss E, St. Aug, Davenport, Lakeland, Jax West, Jax N, Orlando, Kissimmee West)
2. Adopt 2-letter codes everywhere (matches Connecteam digest)
3. Hybrid — 2-letter in Teams digest only, friendlier elsewhere

### Decision

**Manager review single-submission UI — Option 2.**
Phase 4 ships with the three-column Connecteam pattern as a temporary scaffold:
- Left rail: status (Approve / Flag / Request Re-do), manager note input
- Center: ordered question responses with inline photos and geofence badges, signature blocks, time-to-complete header
- Right rail: activity timeline (every status change, note, assignment, photo upload, with actor + timestamp)

Phase 7 Claude Design pass will refine the visual treatment but preserves the three-column information architecture. The pattern is proven, PMs are trained on it, and it surfaces the audit trail without requiring a separate view.

**Manager review queue — Option 2 (lock now).**
Phase 4 ships with the submissions table view: one row per submission, columns:
- Status badge
- User
- Date submitted
- Unit # (or property-level scope label for per-property templates)
- Time-to-complete
- Inline photo thumbnails — one column per required photo question on the template
- Manager actions (Approve / Flag / Request Re-do) as row-level buttons

Phase 7 redesign refines column choice, density, and filter UX, but the table+thumbnails core stays.

**Property short codes — Option 2 (2-letter everywhere).**

| Property | Short Code |
|---|---|
| Jacksonville North | JN |
| Jacksonville West | JW |
| Kissimmee East | KE |
| Kissimmee West | KW |
| Lakeland | LL |
| Orlando OBT | OR |
| St. Augustine | SA |
| Davenport | DP |

Used across: UI labels, dashboards, email subjects, Teams digest, human checklist labels. Long names ("Jacksonville West", "Lakeland") only appear in admin / settings detail pages where there is no space pressure.

The human label format from ADR-009 now reads:
- `Arrival Checklist — LL — Rm 312 — May 26, 2026`
- `Pressure Washing — JW — May 2026`
- `HK Review — KE — Wk of May 25, 2026`

### Consequences
- Phase 4 has concrete review screens to build against; no design indecision delays the alpha milestone
- Phase 7 redesign scope shrinks slightly — the IA is locked, only visual treatment is open
- PMs onboard on a familiar UI pattern; reduces training friction at cutover
- The "temporary" Phase 4 review UI will be visible for ~4 weeks (Phase 4 → Phase 7) — must still meet accessibility / usability bars
- 2-letter codes are dense — readability OK for trained users, may be opaque to brand-new corporate viewers (mitigated by tooltips on hover and long-form names in admin views)
- All checklist labels generated before this ADR will need a one-time backfill if any exist before Phase 4 ships (none yet — safe)

---

## ADR-012: Contractor Checklists + Quick Tasks added to v1 scope; build extends to 10 weeks

**Date:** 2026-05-27
**Status:** Accepted

### Context
Reviewing the Connecteam admin module list (`docs/assets/connecteam-snapshots/image (12).png`) surfaced two operational surfaces that were not in the original PRD scope: **Contractor Checklists** (sign-off forms for vendors/contractors, not employees) and **Quick Tasks** (ad-hoc one-off tasks that are not template-driven and have no recurrence). Both are actively used today on the Connecteam side. Kate's call: keep them in v1 rather than defer to v1.5.

This is a meaningful scope expansion. ADR-006 ("Out of scope for v1") deliberately limited the build to template-driven operational checklists. ADR-012 explicitly amends that scope.

### Alternatives Considered
1. Defer both to v1.5 (ships 2–3 weeks after cutover) — preserves 8-week build
2. Keep both in v1; drop something else (custom report builder, bulk PDF export, dashboard depth) to absorb the cost — preserves 8-week build
3. Keep both in v1; accept timeline extension to 10 weeks build / Week 14 cutover

### Decision
Option 3. Both modules ship in v1. Build extends from 8 weeks to 10 weeks. Cutover moves from Week 12 to Week 14. Parallel run window stays at 4 weeks.

### Contractor Checklists — design intent

**Data model**
- New `contractors` table: `id`, `name`, `company`, `contact_email`, `contact_phone`, `property_id`, `active`, `created_at`
- `checklist_templates.audience` enum added: `EMPLOYEE` | `CONTRACTOR`
- `checklist_instances.contractor_id` (nullable FK) — when set, instance is for a contractor and `assigned_user_id` is null
- Manager creates a contractor record once per vendor/company, then assigns CONTRACTOR-audience templates to that contractor record per visit

**Auth pattern**
- **No contractor accounts.** No password, no MFA, no 7th role.
- Manager creates the instance → system generates a **signed, single-use, time-limited URL** (72-hour TTL, JWT or HMAC-signed token tied to the instance ID + contractor ID).
- Manager sends link to contractor via email / SMS / in-person QR code.
- Contractor opens link → lands directly in the checklist filling UI → completes responses, captures photos (same camera + GPS flow as employee), signs, submits.
- Submission marks the link consumed.
- Token regeneration is a manager action (one-click) if the original link expires or is lost.

**Review flow**
- Same manager review queue as employee submissions. Submitter column shows contractor name + company instead of user name.
- Same Approve / Flag / Re-do actions.
- Contractor cannot be flagged as a "user" (they have no account) — flag instead creates an Issue tagged to the contractor record for follow-up by the manager.

**Template seed (initial)**
- Roof PM (when contractor-performed)
- Pest control (typical contractor scope)
- HVAC service (when contractor-performed)
- Pressure washing (when contractor-performed; the employee variant stays)
- Lawn / landscaping (if applicable)
- Final list to be confirmed by Kate during Phase 9 build

### Quick Tasks — design intent

**Data model**
- New `quick_tasks` table: `id`, `title`, `description`, `property_id`, `assigned_user_id` (nullable), `assigned_role` (nullable enum), `created_by_user_id`, `due_date` (nullable), `priority` (LOW | MEDIUM | HIGH | URGENT, default MEDIUM), `status` (OPEN | IN_PROGRESS | COMPLETED | CANCELLED), `completion_note` (text), `created_at`, `started_at`, `completed_at`
- Separate `quick_task_photos` join to `photos` table for optional completion photos (max 5 per task)
- **No question set, no recurrence, no review queue.** This is intentionally a lightweight task system.

**Surfaces**
- Field staff "My Tasks" — appears in the field-staff home below today's assigned checklists; sorted by due date asc, then priority desc
- Manager "Open Tasks" at their property — list view with filter by assignee, priority, status
- Corporate sees portfolio rollup of open / overdue Quick Tasks per property in the Corporate dashboard

**Lifecycle**
- Manager (or Corporate / Admin) creates a Quick Task → assigns to specific user or role pool
- Field staff opens task → marks `IN_PROGRESS` → adds completion note + optional photos → marks `COMPLETED`
- Manager can `CANCEL` an open task; cancellations require a reason in `completion_note`
- No formal review step (unlike checklists). Manager can see completion status in the list view; no separate review queue.

**Not integrated with Issues pipeline.** Issues are auto-generated from failed checklist questions or manager flags. Quick Tasks are manually-created from scratch. Separate models, separate surfaces.

**No PDF export.** Quick Tasks are operational tickets, not formal checklist artifacts. No PDF generation in v1.

### Timeline impact

| Phase | Weeks (old) | Weeks (new) | Notes |
|---|---|---|---|
| Build | 1–8 | 1–10 | +2 weeks |
| Phase 9 | (n/a) | Week 9 | Contractor Checklists module |
| Phase 10 | (n/a) | Week 10 | Quick Tasks module |
| Parallel run | 9–11 | 11–13 | Same 4-week window, shifted by 2 |
| Cutover | Week 12 | Week 14 | Shifted by 2 |

### Consequences
- Build cost increases ~25% (8 → 10 weeks of developer time)
- Cutover date slips by 2 weeks; Connecteam invoice runs 2 weeks longer (~$450 at $900/mo Connecteam estimate — small relative to the v1 build cost)
- Karla's manual PDF re-upload workflow continues 2 weeks longer than originally planned
- v1 fully replaces Connecteam's operational surface — Contractor Checklists, Quick Tasks, Property Checklists, Issues, Photos. Connecteam can be fully retired at cutover with no v1.5 dependency on additional modules.
- Magic-link auth pattern for contractors is a new auth surface — must be code-reviewed carefully (token signing, replay protection, single-use enforcement). Documented in ARCHITECTURE addendum during Phase 9.
- Quick Tasks data model is intentionally lightweight — risk of feature creep ("can we add recurring quick tasks?", "can we add a review step?") to be resisted; if either becomes needed, build it as a v1.5 enhancement
- Phase 7 redesign scope grows slightly — Quick Tasks surfaces and Contractor sign-off UI now need design treatment too
- ADR-006 is superseded for these two modules only. The remaining ADR-006 exclusions (time tracking, payroll, HR, scheduling, chat, hiring, training, knowledge base, surveys, guest features, native apps) remain out.

---

## ADR-013: Platform foundation — bilingual field UI, multi-property assignment, keep-forever photos, ET display anchor

**Date:** 2026-05-27
**Status:** Accepted

### Context
Four architectural questions were not addressed in ADRs 001–012 but materially affect Phase 1–3 code structure:

1. **Localization** — Many FL hospitality HK staff are native Spanish speakers. Connecteam is English-only today. Retrofitting i18n after Phase 3 is expensive (every screen + every notification + every email).
2. **Multi-property user assignment** — `user_properties` in the schema is many-to-many, but role semantics across multiple properties were never defined. Floating MTs and regional managers exist.
3. **Photo retention policy** — No policy was defined. R2 storage compounds (~80 GB/year at full operational tempo).
4. **Time zone display** — All 8 properties operate in Eastern Time; the cron and `rooms.status` logic are ET-anchored (ADR-009). User-facing datetime display was never specified. Kate (UTC+8) and any future cross-timezone reviewer would see drift relative to the cron boundary.

### Decisions

**1. Localization — bilingual for field staff only (v1).**

- Field-staff-facing surfaces are **bilingual English + Spanish**: login, password reset, "Today" home, checklist filling UI (all 11 question types), photo / signature capture prompts, submission confirmation, in-app notifications targeting field staff, email notifications targeting field staff.
- Admin / Manager / Corporate surfaces stay **English-only in v1**.
- **Translation scope follows the recipient, not the screen.** If a field-staff user receives an in-app notification or email (flagged submission, assignment notice, password reset, activation), the body is translated. Templates carry both `en` and `es` content.
- Library: **`next-intl`** (Next.js 15 App Router-native, server-component-safe).
- Locale routing: middleware-based, no URL prefix. User's preferred locale stored on `users.locale` enum (`en` | `es`); browser `Accept-Language` is only a fallback for unauthenticated routes (login).
- `users.locale` defaults to `en` for MANAGER / CORPORATE / ADMIN at provisioning; field staff (HK / PA / MT) are prompted on first login to choose. Admin can override.
- Spanish strings sourced from Kate (or a designated bilingual reviewer — owner TBD).
- Phase to land: locale infrastructure in Phase 1; Spanish strings populated incrementally as field-staff screens ship (Phases 3, 4, 9).

**2. Multi-property user assignment — many-to-many, single global role.**

- `user_properties` is the source of truth for which properties a non-corporate user can access.
- Each user has **one global role** in `users.role`. The role applies at every property they're tied to via `user_properties`.
- RBAC rule: A user can access property X's data iff
  - role is `CORPORATE` or `ADMIN` (full portfolio access), OR
  - a `user_properties` row exists for `(user_id, property_id = X)`.
- UI: a property picker appears in the header for users with > 1 property; auto-selected for single-property users; hidden for CORPORATE/ADMIN (they see portfolio by default with property filters).
- Per-property role overrides are **not supported in v1.** If someone is genuinely "MT at LL but Manager at OR," create two user records (different emails). This is acceptable because it's an edge case.

**3. Photo retention — keep all photos forever in v1.**

- No scheduled photo deletion job in v1.
- R2 versioning + 30-day soft-delete retention (already configured per RUNBOOK) remain in place — accidental deletes recoverable.
- Cost projection: ~80 GB/year added at full operation; ~$1.20/mo additional R2 storage per year of accumulation.
- **Trigger to revisit:** if R2 monthly bill exceeds $50/mo (~3+ years out) or if a legal / privacy requirement mandates deletion.
- Audit log + notification log retention follow the same "keep forever" policy in v1.

**4. Datetime display — always Eastern Time.**

- All timestamps stored as UTC in Postgres (default).
- All user-facing datetime display formatted in `America/New_York` (auto-handles EDT/EST DST) — applies to every user regardless of their browser locale.
- "Today" / "Yesterday" / "This Week" boundaries in dashboards and queries anchor to ET, not user-local time.
- Time labels in UI always include the `ET` suffix on times (e.g., "Submitted 5:23 AM ET", "Due by 4:00 PM ET") to make the anchor explicit.
- Library: **`date-fns-tz`** (or `@internationalized/date`); pick one in Phase 1 implementation. All formatting goes through a `lib/datetime.ts` helper — never call `toLocaleString` directly.

### Consequences

**i18n**
- Phase 1 must wire next-intl, the locale middleware, and the `users.locale` field before any field-staff UI ships
- Every PR touching a field-staff screen or notification template carries a small translation burden — must add the Spanish string alongside the English one
- Risk: Spanish strings rot if no one owns the translation review. Mitigation: assign a single bilingual reviewer (owner TBD — likely Karla or Christopher); reviewer signs off on Phase 3, 4, 9 translations before merge
- Manager / Corporate screens deliberately stay English-only in v1 — keeps scope contained, defers admin-side translation cost to v1.5+

**Multi-property**
- Admin user-creation UI in Phase 2 must support assigning users to one *or more* properties
- RBAC middleware must scope every query by `user_properties` for non-corporate users — straightforward but easy to miss; test coverage required on every property-scoped route
- Edge case of "different role per property" handled out-of-band via separate user records; explicitly documented as not supported v1

**Photo retention**
- No engineering cost in v1; storage cost grows linearly
- Eventual decision point on cold-storage / deletion deferred to v1.5+
- If a property is offboarded (closed, sold), photos still retained — clean-up policy revisited then

**ET display**
- All datetime UI components must use the shared helper; ESLint rule recommended to block `Date.toLocaleString` / direct `Intl.DateTimeFormat` calls outside `lib/datetime.ts`
- Kate (UTC+8) sees "Submitted 5:23 AM ET" instead of "Submitted 6:23 PM" in her local time — initially counter-intuitive but operationally correct
- DST transitions (2nd Sunday of March, 1st Sunday of November) handled by the timezone library, not manual offset math

---

## ADR-014: Open-question resolutions — self-invalidation approval flow, bonus logic scrapped, Spanish review deferred to Phase 8

**Date:** 2026-06-02
**Status:** Accepted

### Context
Three open questions (PRD §12 / CLAUDE.md open-questions list) were resolved by Kate on 2026-06-02:

1. **#1 Field self-invalidation** — Can a field user invalidate their own assignment (e.g., called in sick), or is invalidation manager-only? Was blocking the Phase 5 invalidation-flow design.
2. **#3 Bonus calculation logic** — How does Bonus=1 vs 0 carry into the new platform? Owner was Rob; due Week 3.
3. **#5 Spanish translation reviewer** — Who reviews the machine-drafted `es.json` strings? Was nominally "needed before Phase 3," but Phase 3 shipped with machine-drafted ES.

### Decisions

**1. Self-invalidation = field-initiated request + manager/admin approval.**
- A field user (HK/PA/MT) can initiate invalidation of their own assignment and **must attach a note** (reason).
- The instance does **not** invalidate immediately — it enters a pending-invalidation state requiring approval by a **MANAGER** (own property) or **ADMIN** account.
- On approval: instance invalidated, reassignment per the existing Phase 5 audit chain. On rejection: instance returns to ASSIGNED, requester notified.
- Both request and decision are written to `audit_log`.

**2. Bonus calculation logic — scrapped from v1 scope.**
- No Bonus field, no Bonus=1/0 logic, no bonus reporting in the platform. Question closed, not deferred.
- If bonus tracking returns later, it's a new scoped request (v1.5+), not a reopened question.

**3. Spanish strings ship machine-drafted; human review moves to Phase 8.**
- We keep building bilingual EN+ES per ADR-013 — every field-staff surface continues to get ES strings as it ships.
- The **human review/sign-off pass moves to Phase 8** (Week 8), as a gate before field-staff training and provisioning — the last point before real field users see ES in production.
- Reviewer still TBD (Karla / Christopher / external). Machine-drafted ES is acceptable for dev/alpha/internal demo use until then.

### Consequences
- Phase 5 invalidation flow gains a small approval sub-flow (pending state + approve/reject actions + two audit events) instead of a single manager-only action. Slightly more build, but matches how call-ins actually happen.
- One less open question chasing Rob (bonus). Any Connecteam bonus-report parity expectation should be checked at parallel-run parity review (Week 13) so it doesn't resurface as a surprise.
- ES review compresses into Phase 8 — single batch review of all strings rather than per-phase sign-off (changes ADR-013's per-phase reviewer mitigation). Risk: a large review batch late; acceptable because the string surface is small and field-staff-only.

---

## ADR-015: Photo pipeline — upload-at-submit, UNVERIFIED geofence status, no R2 versioning

**Date:** 2026-06-05
**Status:** Accepted

### Context
R2 went live (bucket `rise8-ops-staging`, object-scoped token, CORS). Wiring the real photo path surfaced three calls:
1. *When* do photo bytes leave the device — at capture or at submit?
2. The `GeofenceStatus` enum (VERIFIED / OFF_PROPERTY / NO_GPS) has no honest value for "GPS captured, but the property has no polygon configured yet" — and **no property has a polygon until Phase 6** (Kate owes coords).
3. The RUNBOOK/ARCH claim "R2 versioned bucket, 30-day soft-delete" turned out to be wrong — R2 offers no object versioning at all (confirmed against the live bucket).

### Decision
1. **Upload at submit, not at capture.** Photos stay as compressed blobs in the IndexedDB draft until the user hits Submit; the client then mints presigned PUTs (`/api/photos/presign`, `response` scope) and uploads directly to R2, then passes `{key, gps, size}` per photo in the answer payload. Server validates key prefixes (`instances/{instanceId}/{questionId}/`) and writes `photos` rows inside the submit transaction. Rationale: drafts/offline keep working unchanged; retakes never orphan R2 objects; one failure path (submit) instead of two.
2. **GPS is captured per photo batch at capture time** (position travels with the draft) — submit-time GPS would record where the user *submitted*, not where they *photographed*.
3. **`GeofenceStatus.UNVERIFIED` added** (migration `20260604171417`): GPS present, polygon absent/invalid. Phase 6 backfills UNVERIFIED → VERIFIED/OFF_PROPERTY once polygons are drawn. Verification logic is pure (`lib/geofence.ts`: ray-cast + 50m edge buffer) so the backfill job reuses it.
4. **No R2 versioning** — deletion protection = keep-forever policy (ADR-013) + object-scoped tokens; evaluate R2 Bucket Lock (WORM) for the prod bucket at Phase 8.

### Consequences
- Submit round-trips grow by one presign POST + one PUT per photo; acceptable on property fiber, and the draft survives any mid-upload failure.
- PHOTO answer JSON shape changes from `{count, pendingUpload}` to `{count, photos: [{key, lat, lng, accuracy, sizeBytes}]}` — review surfaces must tolerate both (seeded/legacy rows keep the old shape).
- Every photo row lands UNVERIFIED until Phase 6 polygons exist — dashboards must not read UNVERIFIED as an anomaly, only OFF_PROPERTY.

---

## ADR-016: Issue resolution photos reuse the Photo table (nullable dual-owner FK)

**Date:** 2026-06-15
**Status:** Accepted

### Context
Closing an Issue (RESOLVED / WONT_FIX) needed optional evidence photos. The `Photo` table was hard-keyed to a checklist `Response` (`response_id` NOT NULL) — issue photos have no response. Needed a linkage without re-implementing R2 + geofence handling.

### Alternatives Considered
1. **Separate `issue_photos` table** — keeps `Photo` clean but forks the R2 key/geofence/presign logic into a parallel path and duplicates the review-side display code.
2. **Make `Photo` dual-owner** — `response_id` and `issue_id` both nullable, app enforces exactly-one-set. Reuses `lib/geofence.ts`, `lib/r2.ts`, presign route, and the photo-grid render verbatim.

### Decision
Took (2). `Photo.responseId` is now nullable; added nullable `Photo.issueId` FK (`onDelete: Cascade`) + index. Migration `20260615135350_add_issue_resolution_photos` is additive/nullable → safe on the shared Neon DB. New presign scope `issue` (manager+ of the property, issue must be open, cap 5). `closeIssue` accepts an optional `photos: PhotoRef[]`, strictly validates the `issues/{issueId}/{uuid}.jpg` key prefix, computes geofence server-side, and writes issue-keyed `Photo` rows in the close transaction. Closed-issue panel displays them with the same geofence badge as review.

### Consequences
- No DB CHECK enforces exactly-one-owner (Prisma can't express it); both write paths are server-only and validated, so the invariant holds in practice.
- **Quick Tasks photos (Phase 10) should follow this same dual-owner pattern** (add a third nullable FK) rather than the `quick_task_photos` join table sketched in CLAUDE.md — revisit that note when Phase 10 lands.
- Orphan-cleanup cron (P2 backlog) must now also sweep the `issues/` prefix.

---

## ADR-017: Phase-7 redesign direction — Connecteam familiarity, Stayable skin

**Date:** 2026-06-15
**Status:** Accepted (amends ADR-010)
**Decided by:** Kyle (2026-06-15)

### Context
Request came in to "make it look like Connecteam." That cut against ADR-010 (Phase-7 design pass = *Stayable* branding) and the standing "hold UI-shape work until layout feedback lands" note. Connecteam is the product being replaced; a literal visual clone carries IP risk and contradicts the Stayable-branding decision.

### Decision
Phase-7 redesign **mirrors Connecteam's layout / information architecture** (the navigation and screen structure field staff already know) but renders it in **Stayable branding** (colors, wordmark "Stayable Operations") — not Connecteam's visual identity. This keeps the muscle-memory benefit for field staff while honoring ADR-010. Full visual polish still depends on Kate's branding kit (open question, owner: Kate, needed Week 7); structural/IA work can begin before the kit lands.

### Consequences
- Does **not** pull the redesign earlier than Phase 7 as a whole; it scopes *how* the redesign looks.
- ADR-010's "Stayable branding" clause stands; this only fixes the layout/IA reference point.
- IP risk avoided: we copy structure (uncopyrightable IA), not Connecteam's look.

---

## ADR-018: Unified AppShell — desktop left sidebar + mobile bottom bar; global property scope

**Date:** 2026-06-23
**Status:** Accepted (supersedes the interim `AppNav`/`BottomNav` structural pass under ADR-017)
**Decided by:** Kate (spec 2026-06-22), implemented Plan 1

### Context
The Phase-7 structural pass (ADR-017) shipped a mobile-first Connecteam-style feed with a role-aware bottom tab bar (`AppNav`/`BottomNav`). Kate then requested a desktop/responsive redesign: the app is used on laptops by managers/corporate as much as on phones by field staff, and the bottom-bar-only chrome wasted desktop width. She also wanted a single, consistent property filter rather than the ad-hoc header picker.

### Decision
One unified `AppShell` renders **a navy left sidebar on desktop** and **a bottom tab bar on mobile**, both driven by a single role-aware nav model (`lib/nav.ts`). A **global property-scope filter** (`lib/property-scope.ts`, `resolveScopedPropertyIds`) lives in the shell header and narrows every property-scoped list (review, issues, completed, dashboard, reports) to the active property; CORPORATE/ADMIN default to the full portfolio. The old `AppNav`/`BottomNav` components are deleted.

### Consequences
- Every page mounts inside the shell via the root layout; new pages get nav + scope for free.
- Property scope is resolved once and passed down, replacing per-page picker logic.
- Retires the interim navigation from the ADR-017 structural pass (that ADR's *branding* direction still stands).

---

## ADR-019: Email OTP for all users with a 30-day trusted-device token, layered on password

**Date:** 2026-06-25
**Status:** Accepted (amends ADR-008's MFA approach)
**Decided by:** Kate (spec 2026-06-22), implemented Plan 2

### Context
ADR-008 planned TOTP MFA (on for managers/corp, optional for field staff) via authenticator apps. In practice, field staff don't reliably have authenticator apps configured, and Kate wanted a single second factor that works for everyone without per-user enrollment. Resend email delivery is now available.

### Decision
Authentication requires **password + a second factor for all users**. The second factor is a **6-digit email OTP**; on success the browser receives a **30-day HMAC-signed trusted-device token**, so the OTP is only re-prompted on new/expired devices. `authorize` (`lib/auth.ts`) enforces password AND (valid trusted-device token OR a verified-and-consumed OTP) with **no bypass path** and **fails closed on an empty `AUTH_SECRET`**. Two-step bilingual login UI; OTP records in `login_otps` (sha256 + pepper, attempt-cap, TTL); lockout metered in the pre-check.

### Consequences
- Uniform 2FA for every role without authenticator-app enrollment; supersedes the TOTP-only plan in ADR-008 (TOTP schema fields remain, unused, for a possible future).
- Requires `RESEND_API_KEY` + `RESEND_FROM_EMAIL` in prod (set 2026-06-27; live OTP send validated).
- **Deferred-minor (Phase 8):** `AUTH_SECRET` currently triple-purposes as NextAuth secret + OTP pepper + trusted-device HMAC key; splitting rotates live secrets and is deferred.

---

## ADR-020: Template authoring in-app; property-scoped templates; role-based edit scope

**Date:** 2026-06-24
**Status:** Accepted
**Decided by:** Kate (spec 2026-06-22), implemented Plan 3

### Context
The 9 templates were seed-only, editable only by changing code. StayCheck needs managers/corporate to author and edit checklist templates in-app, and templates must be able to target specific properties (not every template applies portfolio-wide).

### Decision
An in-app template builder (`/templates`) lets authorized users create/edit templates and their question sets. Templates declare their property applicability via a `TemplateProperty` join plus an `allProperties` flag. Access rules (`lib/template-access.ts`):
- **ADMIN** — author/edit any template, including all-properties templates.
- **MANAGER** — author/edit only templates fully scoped within their own property set. **Conservative edit scope (Kate decision):** managers **cannot** edit an all-properties template or a template that spans properties outside their assignment.
- **CORPORATE** — **broad authoring (Kate decision):** may author/edit any non-all-properties template across the portfolio, but all-properties templates remain ADMIN-only.

All mutations are audit-logged. Instances carry an optional free-text `title` override of the ADR-009 human label.

### Consequences
- Property-scoped templates keep each property's list relevant without duplicating templates.
- The two role-boundary calls above are deliberate: managers are prevented from changing shared/all-property templates that affect properties they don't own; corporate gets reach without being able to touch the portfolio-wide set.
- Template `version` is an int today; version **snapshotting** (binding an instance to the question set as it was) is deferred to StayCheck S9.

---

## ADR-021: Manager dashboard, reports, and on-demand PDF export

**Date:** 2026-06-25
**Status:** Accepted
**Decided by:** Kate (spec 2026-06-22), implemented Plan 5

### Context
Managers and corporate needed at-a-glance operational health and exportable records well before the full Phase-6 dashboard suite. The spec pulled a focused dashboard + reports + PDF slice forward.

### Decision
- **`/dashboard`** — property-scoped alert tiles (completion %, incomplete, overdue, unassigned, open issues, checklists-with-issues).
- **`/reports/completeness`** and **`/reports/issues`** — filterable (property/date/status/priority) report screens backed by pure helpers (`lib/reports.ts summarizeCompleteness`, tested).
- **PDF export** via `@react-pdf/renderer` (pinned 4.5.1, `serverExternalPackages`, Node runtime, `auth()`-gated): single-checklist PDF (`/api/checklists/[id]/pdf`, with photos incl. ET capture time + geo, signatures) and report PDFs (`/api/reports/{completeness,issues}/pdf`) at query-parity with the screens.

### Consequences
- Establishes reusable PDF infrastructure (`lib/pdf/*`, `renderPdfToBuffer`) for later phases (contractor PDFs, S8 report parity).
- These are an early, focused slice; the full multi-role dashboard suite (Phase 6 / PRD §13–14) still layers on top.
- **Deferred-minor:** PDF free-text cell truncation and ET-exact issues `createdAt` bound (the latter fixed 2026-07-24).

---

## ADR-022: Cloudbeds PMS in scope — manual-first room model with Cloudbeds as a pluggable sync adapter

**Date:** 2026-07-02
**Status:** Accepted (reverses "no PMS in v1" clause of ADR-009)
**Decided by:** Kate (2026-07-02)

### Context
The StayCheck v1.1 PRD (Kate, 2026-07-01) requires room-lifecycle awareness — checkout queue, cleaning/arrival triggers, room-status board. ADR-009 deferred all PMS integration ("manual `rooms.status`, no PMS integration in v1"). Kate now wants Cloudbeds pulled in. Each Stayable property is its own Cloudbeds property/account, so credentials are issued per property.

### Alternatives Considered
1. **PMS-first** — make Cloudbeds the source of truth for room state. Rejected: couples core room logic to a vendor feed, untestable without live keys, one property's outage stalls the board.
2. **Manual-only (status quo)** — keep manual `rooms.status`. Rejected: does not meet the checkout-queue / arrival-trigger requirement.
3. **Manual-first + Cloudbeds as a pluggable input adapter** — chosen.

### Decision
Build the manual room-status model (S2) as the source of truth. Cloudbeds is a **read-only, per-property sync adapter** (`lib/cloudbeds/`) that feeds internal `CheckoutQueueEntry` / arrival events. Read-only keys only — StayCheck never writes back to Cloudbeds. Per-property failure is isolated and logged to `notification_log`. Webhooks preferred over polling.

### Consequences
- Room-lifecycle logic is unit-testable without the vendor (manual entry path).
- One property's key failing never blocks the others or the manual board.
- Requires per-property API keys from Kate (blocking S3 only, not S2).
- **Hard prerequisite:** split prod/dev DB before any Cloudbeds cron writes (prod still shares the dev Neon DB).

---

## ADR-023: Keep the 6-value Role enum; add a 3-role display grouping

**Date:** 2026-07-02
**Status:** Accepted
**Decided by:** Kate (2026-07-02)

### Context
The StayCheck PRD speaks in three roles — Staff / Manager / Admin. The live system has a 6-value `Role` enum (HK/PA/MT/MANAGER/CORPORATE/ADMIN) woven through RBAC (`lib/rbac.ts`), `user_properties`, and property scope. Collapsing to three would force a migration and an RBAC rewrite.

### Alternatives Considered
1. **Migrate to 3 roles** — rejected: destructive migration, RBAC rewrite, loses the PA/HK distinction that AM/PM shift logic (PRD §Shift) needs.
2. **Keep 6, map to 3 for display only** — chosen.

### Decision
The PRD's three roles are a **display grouping**, not a data model. Keep the 6-value DB enum. `lib/role-display.ts` maps `HK|PA|MT → Staff`, `MANAGER → Manager`, `CORPORATE|ADMIN → Admin`. The mapping is a label only and must never be used for authorization — RBAC continues to key off the raw enum.

### Consequences
- No migration, no RBAC rewrite.
- PA stays distinct from HK for shift logic.
- One helper file to keep in sync if the enum grows (test enforces total coverage).

---

## ADR-024: Rename end-user product to "StayCheck"

**Date:** 2026-07-02
**Status:** Accepted (supersedes ADR-010's product-name clause)
**Decided by:** Kate (2026-07-02)

### Context
ADR-010 set the end-user product name to "Stayable Operations." Kate has renamed the product to **StayCheck** for the v1.1 era.

### Decision
End-user product name is **StayCheck**. All user-facing surfaces — UI wordmark/titles, transactional email (subjects + From name), PDF headers — use "StayCheck." The internal repo / dev name ("RISE8 Operations Platform") is unchanged.

### Consequences
- Supersedes the naming clause of ADR-010 only; ADR-010's Teams-digest decisions stand.
- Rename sweep across `messages/{en,es}.json`, page `<title>`s, `lib/email.ts`, and (when built) PDF templates.
- `RESEND_FROM_EMAIL` default string updated; if the env var is set in Vercel it overrides — verify the live value reads "StayCheck."

---

## ADR-025: Project restructured into three components (Checklist · Ticketing · Construction)

**Date:** 2026-07-07
**Status:** Accepted
**Decided by:** Kyle (2026-07-07)

### Context
The project began as a single product — the Connecteam checklist replacement (now **StayCheck**). Two adjacent needs have surfaced that are operationally distinct from checklists:
1. **Maintenance / ticketing** — properties raising work items, primarily today via a form and via the `blake@rentstayable.com` inbox, plus urgent/"we need a contractor" events (busted pipe, no power, no hot water). These arrive as unstructured email/messages, not clean form input.
2. **Construction progress / scheduling** — buildout & renovation coordination (the "Construction Coordination Agent" concept in `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`), still un-greenlit pending Rob.

Treating these as loose backlog items (the StayCheck epic had ticketing as "S7") obscured that they are separate products with their own intake, lifecycle, and users.

### Decision
Organize the project into **three components**, tracked as top-level sections in `TODO.md`:

- **I. Checklist App (StayCheck)** — the live platform. All existing phases + StayCheck v1.1 (S0–S9) **except ticketing**. S7 moves to Component II.
- **II. Maintenance / Ticketing System** — intake (web form + `blake@` email ingestion with AI extraction; urgent/contractor **WhatsApp** front door per the whiteboard sketch / brief §4) → **human review queue** → ticket vs. "concern" classification (payments/refunds/extensions held as concerns) → work-order lifecycle → dispatch/scheduling → close. **Outlook sync** tracks which emails became tickets/concerns/were responded to. Reuses Component I's Issue/SLA, audit, Teams-digest, geofence, and role infrastructure.
- **III. Construction Progress / Scheduling** — buildout/renovation PM. **Concept, gated on Rob's decisions file** (`ConstructionAgentDecisions_RISE8_*.md`). Shares the ingestion engine (the sketch's CONSTRUCTION lane).

**Sequencing:** all three tracks run **in parallel** (Kyle, 2026-07-07). III's *build* is gated on greenlight; its track is live for planning only until then.

**Intake model for II (confirmed 2026-07-07):**
- Primary channels: web form + `blake@rentstayable.com` email ingestion (AI parses email → extracts ticket details → classifies ticket vs. concern).
- Urgent/contractor channel: WhatsApp "one front door" (photos, voice, Spanish) — for urgent needs or when a property needs a contractor. A *channel*, not the whole system.
- Human review queue precedes ticket creation. **No AI decides alone** (carries forward the brief's non-negotiable).

### Alternatives Considered
1. Keep ticketing as StayCheck epic item S7 — rejected: undersells a full ticketing product and its distinct intake.
2. Separate repos/apps per component — rejected: one product, one codebase, one deploy (per brief §3); components share auth, RBAC, Issue/SLA, audit, geofence, Teams digest.
3. Sequential build (finish I → II → III) — not chosen; Kyle wants all three in parallel.

### Consequences
- `TODO.md` reorganized under `# COMPONENT I/II/III`; S7 relocated from the StayCheck epic to II.1.
- **Scope expansion beyond v1.** The project is now a three-product ops suite, not just a checklist replacement. Building II and III is a larger commitment than the original v1 scope and is a budget/scope matter for Rob (sponsor); III specifically is not greenlit.
- Component II's actual build should open with a brainstorming/spec pass (intake design, AI extraction contract, concern taxonomy, Outlook integration surface) before code.
- Superseder note: this reframes — does not cancel — ADR-012 (Contractor Checklists / Quick Tasks) and the StayCheck v1.1 adaptation spec; those items now live under the appropriate component.

---

## ADR Template (copy for new entries)
## ADR-026: Network Monitoring & IT Ticketing

**Date:** 2026-07-25
**Status:** Accepted
**Decided by:** Kate (DevSpec 2026-07-24), implemented Tasks 1–10

> **Numbering:** reconciled 2026-07-28 — the Contractor-Dispatch branch's ADR-025 was merged into `main`, so 024→025→026 is contiguous. No renumbering needed.

### Context
Kate's DevSpec (`docs/superpowers/plans/2026-07-25-network-monitoring-ticketing.md`, ported from her standalone spec) adds portfolio-wide network device monitoring + IT ticketing as a new `/network` section, sibling to ADMIN. The spec was written for its own standalone stack (own DB, Redis, JWT); this ADR records where the StayCheck implementation diverged to reuse existing platform infrastructure instead.

### Decisions
1. **New `NETWORK_TECH` role** (7th value on the existing `Role` enum) for IT staff/MSP. `canAccessNetwork(role) = {NETWORK_TECH, ADMIN, CORPORATE}` — MANAGER is **not** granted access in v1. Extends ADR-023's 3-role display grouping: `NETWORK_TECH` folds into the "Admin" display bucket (`lib/role-display.ts`), label-only, never used for authorization.
2. **DB-backed `NetworkJob` + 1-minute Vercel Cron**, not Redis/BullMQ, for the 5-min standard-ticket timer and 10-min mass-outage resolution check. Rejected a dedicated queue as unjustified operational weight for two timer kinds; ~1-minute scheduling granularity against a 5-/10-minute SLA is accepted as good enough.
3. **Microsoft Graph for ticket Teams posts**, coexisting with ADR-010's Incoming-Webhooks daily digest — the digest stays on Incoming Webhooks (broadcast-only, no reply needed); network tickets need Graph because they require threaded replies and reply ingestion (Teams reply → `TicketNote`), which Incoming Webhooks can't do. Both integrations need their own service identity. **Scaffolded + degraded** (Task 7): every ticket-lifecycle event builds its exact spec §5.3/§5.5 message and logs it as a SKIPPED `NotificationLog` row until Azure AD app-registration creds exist — nothing is posted for real yet.
4. **Zoho Desk dropped for network tickets** — ticketing is native (`Ticket`/`TicketNote` tables, in-app UI). Supersedes the ON-HOLD `docs/network/ITTicketingPlan_RISE8_072426.md` for the network-ticket use case specifically; that doc's Zoho evaluation was for a different (checklist-issue) ticketing surface and is otherwise unaffected.
5. **`Ticket.assignedTo` is free-text**, not a `User` FK — assignment may go to an MSP or in-house name with no corresponding platform account. May become a proper FK later if/when all assignees are platform users.
6. **Spotipo guest-WiFi integration is read-only** (Task 9) — no ticketing/alerting off guest-WiFi data in v1. At-rest encryption of `Property.spotipoApiKey` is an **OPEN** question (plaintext column today, same posture as other unencrypted secrets in this codebase) — deliberately not built in this scaffold-only task. Degrades the same way as Task 7: no siteids/keys exist yet, so every property renders "not configured."
7. **Capture-before-trust webhook ingestion**: every inbound webhook is persisted to `RawWebhookPayload` before any parsing/business logic runs, so a parse failure or crash never loses the original payload. Receivers are HMAC-verified per vendor. Mass-outage detection clusters PROBLEM events within a 120-second window and serializes ticket creation/append per property via a Postgres transaction-scoped advisory lock (`pg_advisory_xact_lock`), closing the race where two near-simultaneous webhooks could both decide to create a ticket.
8. **Overnight `[OVERNIGHT]` tag + escalation threshold are display-only** (Task 10, spec §9). `ESCALATION_THRESHOLD_HOURS = 4` is a documented **placeholder**, pending Kate/Christopher confirmation — same status as the checklist SLA defaults (ADR-014). Neither flag drives any notification, email, or Teams post in v1. Overnight = 10 PM–8 AM **Eastern Time** (`lib/datetime.ts`), never server/local time. The overnight suppress-vs-tag notification-behavior question is **OPEN** — this epic implements the tag only.

### Consequences
- RBAC, timer scheduling, and Teams delivery all reuse existing platform primitives (the `Role` enum + `lib/rbac.ts`, Vercel Cron, Microsoft 365 tenant) instead of the DevSpec's standalone stack — one fewer service to operate, at the cost of NETWORK_TECH being a slightly awkward 7th value on an enum ADR-023 already argued should stay small.
- Tasks 1–6 (schema, event mapping, webhook ingestion, timers, mass outage, UI) are fully demoable with no external creds. Tasks 7–9 (Teams posting, Spotipo) are scaffolded and honestly degraded (logged `SKIPPED`, never silently no-op) until Azure Graph creds and Spotipo siteids/keys land — a future creds-unblocked task fills in the marked seams rather than rewriting these tasks.
- Escalation/overnight are pure, unit-tested, display-only helpers (`lib/network/escalation.ts`) — safe to ship without notification-behavior sign-off, and trivially wireable to real alerting later once the threshold and the suppress-vs-tag question are answered.
- Zoho Desk is now confirmed out of scope for network tickets specifically; the checklist-issue ticketing question in `docs/network/ITTicketingPlan_RISE8_072426.md` remains separately ON-HOLD.

---

## ADR-027: Per-channel Teams routing, escalation notifications, 9 AM ET digest

**Date:** 2026-08-01
**Status:** Accepted
**Decided by:** Kyle (webhooks + requirements), implemented same day
**Amends:** ADR-026 §3 (Teams delivery) and §8 (escalation is display-only)

### Context
Kyle supplied nine Power Automate "Workflows" webhook URLs — one **General** channel plus one per property — and a notification model that the built system did not have:

- **General** — the overview cards + status-by-property table every morning at **9 AM EST**, and a **realtime** post whenever a ticket **escalates**, notifying Gerardo (`gerardo@rentstayable.com`).
- **Per property** — a post when a ticket is **created** and when it is **resolved**.

Three gaps against what existed: delivery was hardcoded to one `TEAMS_WEBHOOK_URL`; escalation was explicitly display-only (ADR-026 §8) with no stored state to notify from; and there was no digest job at all.

### Decisions

1. **Webhook URLs live in env, keyed by routing target** — `TEAMS_WEBHOOK_URL_GENERAL` and `TEAMS_WEBHOOK_URL_<SHORTCODE>`. These URLs are **credentials**: the `sig=` query parameter is the only authentication, so anyone holding one can post to the channel as us. Same reasoning that moved the Spotipo keys out of `Property.spotipoApiKey` into env and closed open decision D6. Rejected a `Property.teamsWebhookUrl` column for exactly that reason.

2. **The database stores a routing key, not a URL.** A queued `NotificationLog` row carries `target = "GENERAL" | "<CODE>"`; the URL is resolved from env at delivery time (`lib/network/teams-routing.ts`). `NotificationLog` is keep-forever, so storing the URL would put a live credential in every backup and query log of that table, permanently.

3. **A property with no channel falls back to General, flagged `rerouted`** — never dropped. A misrouted post is visible and fixable; a dropped one leaves a property looking monitored while telling nobody it broke. Same principle as N4's `UNKNOWN`-not-`OFFLINE` device state. The legacy `TEAMS_WEBHOOK_URL` remains a fallback for **General only** — letting it catch property events would quietly funnel all eight properties into the old "Network Tickets (test)" channel and appear to work.

4. **Escalation becomes a real event, via `Ticket.escalatedAt`** (migration `20260801120000_add_ticket_escalated_at`). Reverses ADR-026 §8's display-only stance for escalation specifically; the overnight tag stays display-only. Persistence is required because "has this already been announced?" is not derivable from `openedAt` — without it the 1-minute sweep would re-announce every escalated ticket every minute. The stamp is written conditionally on it still being `NULL`, making it the idempotency lock. **Claim-then-notify**: a crash between the two loses one notification, which is the correct failure direction — a missed post is recoverable from the dashboard, a duplicated 2 AM page erodes trust in the whole alerting rail.

5. **Escalation notifies twice: Teams General *and* email.** A genuine Teams `@`-mention needs the Power Automate flow to construct a mention entity, and that flow is not visible to or verifiable from this codebase. Rather than ship a "tag" that may silently render as literal text, the post names the contact in plain text and an email to `NETWORK_ESCALATION_EMAIL` (default `gerardo@rentstayable.com`) is the notification we can stand behind. If the flow is later taught to mention, the email becomes redundant rather than wrong.

6. **The digest cron runs hourly and gates on the ET hour**, rather than one daily UTC schedule. Vercel cron is UTC-only and `America/New_York` shifts twice a year: `0 13 * * *` is 9 AM in EDT but 8 AM in EST, and `0 14` is the reverse — no fixed UTC schedule delivers 9 AM ET year-round. 23 no-op invocations a day buys an exact time and keeps ADR-013's "everything in ET" discipline instead of excepting this one job. Idempotency is one digest per ET day, guarded on a digest row existing since the ET day start.

7. **Dashboard aggregates extracted to `lib/network/overview.server.ts`**, shared by `/network` and the digest. Two copies of these queries would drift, and a digest that disagrees with the dashboard about how many tickets are open gives a reader no way to tell which is lying.

7b. **The digest carries live guest counts, passed in rather than loaded** (added 2026-08-01, Kyle: "add realtime values"). A `Guests` column plus a portfolio total, from Spotipo. Guest data is a **parameter of the digest builder**, not a field on the overview: the overview is a pure DB read shared with the dashboard, and Spotipo is a rate-limited third party, so this keeps a vendor dependency off the dashboard and lets the digest degrade alone. **Degradation never fabricates a zero** — if Spotipo fails, the column and fact vanish entirely, because `0` would claim nobody is on that guest network while an absent column merely says we didn't ask. Per site `—` covers no-data/unconfigured/unreachable alike; a partial total is labelled `(partial)`; a truncated page-walk keeps its `+`. The digest also stamps `Live as of … ET` and splits **Right now** from windowed figures, since only `Fixed`/avg are a range and a reader scrolling back days otherwise cannot tell live numbers from history.

7a. **The digest table is an Adaptive Card `ColumnSet`, and the digest cron posts inline** (added 2026-08-01 after live verification). Kyle's flow renders **the card attachment**, not the `text` field — proven by its "used a Workflow template to send this card" footer. A card `TextBlock` renders markdown-ish rich text and **collapses runs of spaces**, so the first implementation's space-padded table arrived with its columns squashed; verified by posting the real table and looking at it. The table is now column-major structure (one `Column` per field), overview counts are a `FactSet`, and both renderings draw cells from shared helpers so they cannot disagree about a number. Consequence: the digest **posts directly** rather than queueing a `PENDING` row, because card structure cannot round-trip through `NotificationLog.body` (a string). That is safe here specifically — the queue exists to keep HTTP calls out of open transactions and this route has none. A `FAILED` digest row no longer satisfies the once-a-day guard, so a transient outage at 9:00 retries at 10:00 instead of silently skipping the day.

8. **Escalation is routed to General, not the property channel** — by the time a ticket has sat unattended past the threshold, the property's own channel has already had its chance.

### Consequences
- Nine env vars to maintain per environment instead of one; `describeTeamsRouting` exists so "why is this property's channel quiet?" is answerable without reading env by hand.
- `ESCALATION_THRESHOLD_HOURS = 4` is **still unconfirmed** by Kate/Christopher but now decides when a person is interrupted rather than how a badge renders. Confirming it matters more than it did under ADR-026.
- **First deploy after the migration will announce a backlog**: `escalated_at` starts `NULL`, so every open ticket already past 4 hours is newly escalated at once. The sweep caps announcements at 5 per tick so that drains gradually instead of firing as one burst.
- Threading (§Q25) is **still not solved** — the webhook returns no message id, so a resolution still posts as its own message rather than a reply. Per-property channels reduce the readability problem that request was about, but do not close it. Graph remains the only path to real threading and to T8 reply-ingestion.
- ADR-026 §3's Graph seam is untouched and still the migration path.

---

## ADR-028: Narrow the platform to two tracks; delete the contractor/dispatch rail

**Date:** 2026-08-03
**Status:** Accepted
**Supersedes:** ADR-025 (three-component restructure) for scope. ADR-012's contractor-checklist inclusion is now in question — see §Q31.

### Context

ADR-025 split the platform into three components built in parallel: Checklist (I/A), Maintenance-Ticketing (II/C) and Construction (III/E), with contractor dispatch (D) carved out of C as the fastest independent slice. Since then:

- **Tracks A and B shipped and are in production.** A is the live Connecteam replacement; B monitors 16 consoles across all 8 properties with Teams notifications launched 2026-08-02.
- **Track C never started.** Its gate (C0 — the Top-8 blockers) was never answered, and the prototype library its spec marks `[BUILT]` has always lived outside this repo.
- **Track E never got a go/no-go.**
- **Track D shipped D1–D4** (directory, job record, match/rank, one-tap WhatsApp + signed job link) and then parked on 2026-07-30 when Twilio/A2P consent work stopped. Its consent rail (D8) was built but never merged and never applied to any database.
- On 2026-08-03 Kyle confirmed **he is building the maintenance/dispatch capability as a separate system outside this repo.** That removes the reason for C, D and E to exist here.

The live question was therefore not *whether* to narrow, but what to do with Track D's shipped code. Freezing it was the low-risk option; Kyle's call was to remove it.

### Alternatives Considered

1. **Freeze in place, visible.** Zero code change. Rejected: the sidebar advertises `Contractors` and `Dispatch` to every manager, both backed by an empty directory, with no owner and no roadmap.
2. **Freeze in place, hidden from nav.** One-commit reversible, DB untouched. Rejected by Kyle: a dormant feature still carries schema, tests, presign surface and a public signed-link route that all have to keep passing review, for a capability that is being built elsewhere.
3. **Remove code and schema.** Chosen. The three tables were verified **empty in production** first (`contractors=0`, `contractor_properties=0`, `contractor_jobs=0`, `photos` with a `contractor_job_id`=0 against `ep-summer-cloud`), so removal costs no data.

### Decision

**Active scope is Track A (Checklist / StayCheck) and Track B (Network Monitoring & IT Ticketing). Nothing else.**

- Deleted: `app/contractors`, `app/dispatch`, `app/j`, `lib/{contractors,contractor-jobs,dispatch-message,job-link}` + tests, the `contractorJob` presign scope, `contractorJobPhotoKey`, the DEMO-gated seed roster, and the two nav entries.
- Dropped: `Contractor`, `ContractorProperty`, `ContractorJob`, the `Trade` and `JobStatus` enums, and `Photo.contractorJobId` (migration `20260803120000_drop_contractor_dispatch`). `Photo` returns to exactly-one-of(response, issue) per ADR-016.
- Archived as reference at `docs/archive/tracks-cde/`: every Track C/D/E document, the C/D/E tracker sections verbatim, their open §Q and §SPEC rows, and the decisions worth not re-deriving.
- The Twilio consent rail stays **unmerged** on `claude/rise8-operations-platform-rv9B6`. Leaving it there *is* the archive.

### Consequences

- **The tracker now says what is actually being worked on.** Track A's real blockers — question content, geofence polygons, the recurring-rules matrix — are no longer competing for attention with three tracks that were not moving.
- **Deploy order is load-bearing.** Code must ship before the drop migration is applied; the reverse breaks every live `SELECT` naming `contractor_job_id`.
- **A10 contractor checklists lost their foundation.** ADR-012 assumed a contractor record to issue a magic link against, and `lib/job-link.ts` was the reusable HMAC helper. Both are gone. Recommendation is to drop A10 from v1 (§Q31); Kate's CONTRACTOR template list (§Q13) is moot if it does.
- **One thing must survive if that branch is ever reconciled:** `InviteKind.ACCOUNT` is staff account activation wired into `app/admin/users/actions.ts` — Track A functionality that happens to live inside the consent rail.
- Reversal is a `git revert` of `94ce338` plus re-running the additive migrations; nothing is unrecoverable, but it stops being free once the drop is applied to prod.

### Amendment 2026-08-03 — C and E return as future sections

Kyle, hours after this ADR landed: Maintenance and Construction **are coming back to this codebase later**, so they now appear as top-level nav sections with stub pages (ADR-029). This narrows the ADR rather than reversing it:

- **Still true:** no C/D/E build work is scheduled, the contractor/dispatch code stays deleted and its tables dropped, and `docs/archive/tracks-cde/` is reference — not a backlog to restart from.
- **Changed:** the archive is no longer presumed permanent for **C and E**. Their specs may be reopened when they are picked up, through a fresh decision.
- **Undecided:** whether contractor dispatch (**D**) returns with Maintenance. It is the part with deleted code and dropped tables, so it is the expensive one to bring back. Not assumed either way.
- **⚠ Resolved 2026-08-11 by ADR-030, partially:** contractor **scheduling** returns to this repo. **Dispatch and messaging do not.** This ADR's deletion of the rail therefore stands for everything that sends; the `Contractor` and `Trade` names are reused by new, narrower models. Read ADR-030 before concluding from this entry that nothing contractor-shaped exists here.

---

## ADR-029: Section-based navigation with a collapsible rail

**Date:** 2026-08-03
**Status:** Accepted
**Supersedes:** ADR-018's flat nav list (the AppShell itself stands).

### Context

ADR-018 gave the app one flat nav list. It reached 14 items and put `Users`, `Tickets` and `Templates` at the same level as `Review`. Two concrete failures:

- The mobile bottom bar rendered **11 items in one `max-w-md` row** for ADMIN — unusable.
- Nothing expressed that the platform has *areas*. Adding Maintenance and Construction to a flat list would have made it 16.

Kyle asked for a collapsing sidebar and raised top tabs with hover submenus as the alternative.

### Alternatives Considered

1. **Top tab bar with hover flyouts.** Rejected: hover doesn't exist on touch, so a PWA with field staff on phones would need a *third* nav pattern; the sections are lopsided (Checklist 7 children, Network 3, Home/Maintenance/Construction 0) where tabs want comparable weight; a top bar has nowhere to put counts; and vertical space is the scarce axis on the review and ticket tables.
2. **Keep flat, add a "More" overflow.** Rejected: hides the structural problem rather than fixing it, and mobile would teach a different shape from desktop.
3. **Sections in a collapsible left rail.** Chosen.

### Decision

Six sections — **Home · Checklist · Network · Maintenance · Construction · Admin** — defined in `lib/nav.ts` as data, consumed identically by both breakpoints.

- **Desktop:** 240px expanded / 56px icon rail. Collapsed sections open as a flyout on hover, focus **or** click. Collapse state lives in a cookie read **server-side** in `AppShell` — deciding width on the client paints the wrong one and jumps the page on every navigation.
- **Mobile:** the bottom bar carries the same sections; tapping one opens a sheet of its children. Admin stays desktop-only, which holds the bar at five items. Field staff have one section, so the bar renders nothing rather than a one-item bar.
- **Home is `/` for every role** — the existing page, renamed in the nav. The cross-app summary lands there later with no route change. "Today" is retired as a label.
- **Maintenance and Construction ship as stub pages**, not dead links, and carry a `Soon` chip.
- `lib/nav.ts` must stay free of server-only imports because client components import it. That forced the pure role predicates out of `lib/rbac.ts` into **`lib/roles.ts`** (rbac re-exports them, so every existing call site is unchanged). Icons are stored as lucide **key strings** and resolved in `NavIcon`.
- `ShellChrome` was split into `SidebarRail` / `SectionFlyout` / `MobileTabBar` / `MobileSheet` / `UnbuiltSection`, leaving it as the layout that composes them.

### Consequences

- Adding a section is a data change in one file, not surgery on two renderers.
- **Two more clicks to reach a leaf on mobile** (tab → sheet → destination) than the old flat bar, for the four or five destinations that were previously visible at once. Accepted: 11 unreadable tabs was worse. Per-section badge counts would mitigate it and are deliberately **not** built yet — they need a count query on every page load, which is its own cost decision.
- **Admins still cannot reach `/admin/*` from a phone.** Unchanged from before, now a deliberate choice rather than an accident.
- Section visibility duplicates nothing, but it *is* display logic derived from the same predicates as authorization — showing a section is not permission, and every page still guards itself. A test pins each section to its predicate.
- The rail's expand/collapse of individual sections is seeded from the active route and not persisted; only the rail-wide collapse is.

---

## ADR-030: Contractor scheduling returns; dispatch does not

**Date:** 2026-08-11
**Status:** Accepted
**Partially reverses:** ADR-028 (which narrowed the platform to Checklist + Network and deleted the contractor/dispatch rail). ADR-028's amendment left contractor work explicitly undecided; this decides it, for scheduling only.
**Decided by:** Kyle.

### Context

Kyle is building a contractor-update system **outside this repo**. It needs a companion inside Stayable Operations: somewhere to put contractor work on a calendar, see the day's contractor activity, and keep a written log. Nothing in the platform did that — ADR-028 had deleted `Contractor`, `ContractorProperty`, `ContractorJob`, the `Trade` and `JobStatus` enums and `Photo.contractorJobId` from the schema on 2026-08-03 (`94ce338`) and dropped those tables from production (`20260803120000_drop_contractor_dispatch`).

So there was nothing to extend. This is a new feature that reuses two old names, not a revival.

**A trap worth recording, because it already cost a full spec and plan.** An earlier design dated 2026-08-10 was written entirely on top of `ContractorJob` and `Contractor` — a week after both were deleted from `main` and dropped from prod — because it was written against a stale branch while carrying a "verified against the repo" banner. A branch was checked and called the repo. That document is archived at `docs/archive/tracks-cde/superpowers/2026-08-10-contractor-schedule-and-daily-design.md`, is **off-limits as a source** by Kyle's instruction, and was **not** consulted while designing or building this. The design at `docs/superpowers/specs/2026-08-11-contractor-scheduling-design.md` was written from scratch after diffing `origin/main`.

### Alternatives Considered

1. **Build it inside Kyle's separate contractor project instead.** Rejected: the schedule has to sit beside the properties, roles and audit log that already live here, and that project has no surface inside the operations platform.
2. **Mirror contractor and job records from the external system.** Rejected for now: unbuildable today (no API to read), and it would make this feature's availability depend on another system's uptime.
3. **Restore the whole deleted rail from git.** Rejected: most of it was dispatch — WhatsApp deep links, signed no-account contractor links, availability ranking, A2P consent. Restoring that to get a calendar would re-adopt every constraint ADR-028 removed.
4. **A new top-level nav section.** Rejected — see decision 4.

### Decision

1. **Contractor scheduling is in scope, in this repo.** Contractor directory, jobs carrying an ET calendar date, a day / week / work-week / month calendar with a persistent unscheduled-backlog rail, a five-tile daily rollup, and append-only note threads on jobs and on days.
2. **Dispatch and messaging stay out.** No WhatsApp, SMS, `wa.me`, Twilio, consent surface, signed contractor links, contractor logins, or ranking. `whatsapp` is stored as contact text no code path sends to. The new models deliberately omit the deleted rail's `contracted`, `onCall`, `Contractor.userId` and its photo relation.
3. **This repo owns the records** (Kyle). Accepted cost: two contractor lists that can drift. If they must agree later, the import direction is *into* here, because this side holds the schedule.
4. **It lives under the existing `Maintenance` section**, not a new top-level one. `lib/nav.ts` holds the mobile bar at five items so it never scrolls — ADMIN sees six sections, minus Admin on mobile, which is exactly five; a seventh would make six. Contractors doing maintenance work belongs there on the merits, and Track C ticketing becomes a sibling if it returns.
5. **Notes are append-only by schema shape, not by convention.** `ContractorJobNote` and `ContractorDailyNote` have no `updatedAt` and no soft-delete column, so there is no column an edit could be written into. No update or delete action exists for either.
6. **Date only — no times, durations, or drag-and-drop.** Consequence, accepted: day and week views are lists, not hour grids. No calendar library is added.
7. **Zero Microsoft dependency.** No Graph, no ICS, no Outlook.
8. **Status and assignment changes auto-append a `SYSTEM` note**, so a job thread reads as a history. This deliberately overlaps `audit_log`, which is not user-facing.
9. **`Photo` is untouched.** ADR-016's exactly-one-of(response, issue) stays as ADR-028 left it — jobs have no photos.

### Consequences

- **ADR-028 is no longer wholly true, and now says so.** Its deletion of the rail stands for everything that sends, but contractor records exist again in narrower form. A reader who stops at ADR-028 draws the wrong conclusion, so a pointer to here was added there.
- **The migration is additive** — three enums, five tables, no `DROP`, no existing column changed. Production order is therefore **DB first, then code**, this repo's normal order for adds. (The 2026-08-03 drop inverted that precisely because it was a drop.)
- **The directory ships empty and no seed roster is included.** The last one shipped placeholder phone numbers into the baseline. Real contractors are PII entered through the UI, and the calendar has nobody to assign until someone enters them.
- **Terminal jobs (`DONE`/`CANCELLED`) are immutable** and closing one requires a note. Notes stay writable on a closed job, since recording what happened after the fact is the point of an append-only history.
- **`completedAt` is a real column** rather than inferred from `updatedAt` — that inference holds only while terminal rows stay immutable, which no schema enforces.
- **A10 contractor checklists stay dropped** (§Q31). This feature issues no contractor-facing links, so it does not revive the magic-link helper ADR-028 deleted, and Kate's §Q13 CONTRACTOR template list stays moot.
- **No automation ingest endpoint exists.** `ContractorNoteSource.SYSTEM` and `authorLabel` are the seam for Kyle's project to post notes later; nothing receives them today. Adding it is auth and rate-limit work, not schema work.
- **There are now two schedulers in one codebase.** Track A's recurrence engine is untouched and unconnected; recurring contractor jobs are deliberately out of scope because coupling the two needs its own design pass.
- **`NavSection.basePath` was added to `lib/nav.ts`** so `/maintenance/jobs/*` — real routes that are not nav destinations — still resolve to their section. Any future section with non-nav sub-routes gets the same treatment.

### Amendment, 2026-08-11 (same day): placeholder User accounts for contractors

Decision 2 above says contractors are records, not users, and that there are no contractor logins. **Kyle asked the same day for a temporary `User` row per contractor**, with "no email, no number — will add later", alongside importing the 08-10..08-14 Smartsheet schedule. Created by `scripts/create-contractor-placeholder-users.ts`. What that required, and what it does not change:

- **"No email" is not representable.** `User.email` is `NOT NULL` and unique, so a placeholder was unavoidable. They are `first.last@contractors.invalid` — `.invalid` is reserved by RFC 2606 and can never resolve, so no message can reach a real person by mistake. A guessed `@rentstayable.com` address could have collided with a real mailbox or actually sent.
- **They cannot be logged into.** `active: false`, and `lib/auth.ts:42` refuses an inactive user. The password is 32 random bytes, hashed and discarded — never printed, not recoverable. The way in is the admin Set-PW action after a real address exists, the same path a new hire takes.
- **No property membership**, so a placeholder can be assigned nothing and see nothing. Least privilege for an account nobody has vouched for.
- **They are NOT linked to their `Contractor` records.** This ADR deliberately omitted `Contractor.userId`, so no FK exists; the only correspondence is the name. A real link is a schema change, not something the import could fake.
- **Contractor scheduling still does not depend on user accounts.** Jobs reference `Contractor`, not `User`, and nothing in the feature reads these rows. Deleting all 13 would leave the schedule intact — they carry no history, so the admin Delete action removes them cleanly.

**What this does change:** there are now 13 rows in the production user table whose email addresses are fabricated, and they appear in `/admin/users` beside real staff. That is a real cost, accepted knowingly. Anyone auditing users should treat `@contractors.invalid` as "placeholder, not a person's address".

---

## ADR-031: Closing out a checklist that stopped being needed

**Date:** 2026-08-21 (ET — the harness reported 2026-08-22; see Consequences)
**Status:** Accepted
**Amends:** ADR-014, decision 1 (self-invalidation always requires manager approval).
**Decided by:** Kyle. Shipped to production in `848bac0`; migration `20260822120000` applied before the deploy.

### Context

A **stayover** — a guest extending, so the departure clean never happens — had no representation in the platform. The two things a housekeeper could actually do were both wrong:

- **Submit anyway**, which records a completed departure clean for work nobody did; or
- **Let it expire**, which records a miss against a person who did nothing wrong.

`INVALIDATED`, `invalidation_reason` and the replacement self-relation had been in the schema since Phase 2 and **nothing ever set them** — the state existed and was unreachable. With 1,172 rooms loaded and the test round live, this is a daily event, not an edge case.

ADR-014 settled that a field user may *request* invalidation with a required note, and a manager approves it. That was written about **"called in sick"** — the case where a field user should not be able to silently drop work that still needs doing. A stayover is not that: the work **ceased to exist**. One rule for both would put a daily, uncontested event into an approval queue, which is noise rather than control.

### Alternatives Considered

1. **Keep ADR-014 as written — everything waits on a manager.** Rejected: a queue full of stayovers would be ignored within a week, and an ignored queue is worse than none, because the miss still lands while everyone believes it is handled.
2. **Let field staff close anything immediately.** Rejected: that removes exactly the control ADR-014 was built for. "Staff unavailable" and "no access" are claims about a person, and the work still needs doing by someone.
3. **Add a `PENDING_INVALIDATION` value to `InstanceStatus`.** Rejected, and this is the load-bearing rejection — see decision 3.
4. **Free-text reason only, no enum.** Rejected: a stayover buried in prose can never be counted, and being able to say how often it happens is most of the value.

### Decision

1. **The reason decides the path, split by what the reason is a fact ABOUT.** Facts about the **room** — `STAYOVER`, `ROOM_NOT_NEEDED`, `DUPLICATE` — close the instance **immediately**, audited, manager notified. Facts about the **person** — `STAFF_UNAVAILABLE`, `NO_ACCESS`, `OTHER` — file a request a manager decides.
2. **`OTHER` requires approval on purpose.** An unclassified reason is precisely the case a human should read.
3. **A pending request is NOT a new `InstanceStatus` value.** It is `invalidation_requested_at` + `invalidation_requested_by_user_id` on the row. `status: { in: [...] }` filters silently **EXCLUDE** a new enum member and `notIn` filters silently **INCLUDE** it, so a `PENDING_INVALIDATION` member would have quietly redefined `/review`'s tabs, **both** report denominators, the dashboard's in-flight tiles and the field home list — every one with a clean typecheck and a green build. A pending request **is still assigned work**, so the status stays put and only the surfaces that care learn about the request.
4. **A note is mandatory in every case, stayovers included.** "Stayover" alone does not say which guest or until when, and that row is the only evidence the work was dropped deliberately.
5. **Both a structured code and a free-text note.** The code so it can be counted; the note so it can be understood.
6. **Submitted work cannot be invalidated**, expressed as an explicit allow-list of statuses rather than a denial of the terminal ones, so a status added later has to be considered rather than silently admitted. A filled checklist is a record; "it should not have been done" is a review outcome, not a closure.
7. **Precedence, in this order:** the review **lock** outranks everything, manager and immediate reason included · an **immediate reason beats the requester's own open request** · the close is a **conditional `updateMany` re-asserting the expected status**, so a submit landing between read and write is never silently discarded.
8. **Declining clears the request and hands the assignment back**, with the refusal surviving in `audit_log`.
9. **The `/review` panel is scoped through the same `scopeIds` as the queue beneath it.** A panel that disagrees with its own table reads as broken data, not a broken query.

### Consequences

- **No reporting change was needed.** `lib/reports.ts` already excluded `INVALIDATED` from the completion denominator, so stayovers stop reading as misses the moment the state becomes reachable.
- **Immediate closure skips the wait, not the record.** Every path writes `audit_log` and surfaces to a manager after the fact.
- **Rollback is asymmetric, deliberately.** `vercel promote` reverts the code; the migration stays. It is additive — one enum, three nullable columns, an index, a `SET NULL` FK — so older code ignores the columns.
- **An unclassified `OTHER` becomes the manager's reading queue.** If `OTHER` comes to dominate, that is the signal to add a reason code, not to loosen the rule.
- **A test whose name contradicted its assertion is what surfaced precedence rule 7.** Worth recording because the defect was in the test: without it, someone who filed "could not access the room" and then learns the guest extended stays trapped behind their own request.
- **The migration directory keeps its `20260822120000` stamp** although the decision date is 2026-08-21 ET. It is already recorded in `_prisma_migrations` on production, and renaming an applied migration manufactures drift. The stamp came from the harness clock, which is UTC-derived and runs a day ahead of Eastern every evening — which is why the standing rule is to derive the ET date rather than read it off the harness.

### Note on the ADR number

**Three separate pieces of work all claimed 031.** Resolved 2026-08-25 by what is actually in `main` and in production:

| number | work | state |
|---|---|---|
| **031** | this one — checklist close-out / stayover | **shipped to prod** `848bac0`, migration applied |
| **032** | HPE Instant On uplink flapping as its own event class | written as "ADR-031" on the unmerged, unpushed branch `feat/instant-on-uplink-flaps` (`a17b0ed`) — **renumber to 032 at merge** |
| **033** | contractor update fan-out receiver + wire contract | not written; owed when the pipeline half is built |

The log is append-only, so the number goes to the change that is live. The Instant On ADR is branch-local and unpushed, which makes it the cheap one to move.

---

## ADR Template (copy for new entries)

```
## ADR-XXX: [Short title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-YYY

### Context
[What problem are we solving? What forces are at play?]

### Alternatives Considered
1. [Option 1]
2. [Option 2]
3. [Option 3]

### Decision
[What did we decide?]

### Consequences
[What are the trade-offs? What becomes easier? What becomes harder?]
```
