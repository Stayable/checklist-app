# StayCheck — Product Requirements Document
**RISE8 Companies / Stayable Extended-Stay Hotels**
**Version 1.1 | July 1, 2026**

---

## Overview

StayCheck is a mobile-first checklist management and operations app built for the Stayable extended-stay hotel portfolio (8 Florida properties). It replaces Connecteam (checklist execution) and CompanyCam (photo documentation) and eliminates manual Smartsheet review entry. It integrates with Cloudbeds PMS for automatic checklist triggering on checkouts and arrivals.

**Properties:**
| Property | ID |
|---|---|
| Jacksonville West | 6802 |
| Jacksonville North | 812 |
| St. Augustine | 2535 |
| Lakeland | 4645 |
| Orlando OBT | 8700 |
| Kissimmee East | 2295 |
| Kissimmee West | 5399 |
| Davenport | 44199 |

---

## 1. User Management & Access Control

### Roles
Three roles: **Admin**, **Manager**, **Staff**

**Admin**
- Full access across all properties
- Create, edit, delete checklist templates and users
- View all reports, dashboards, and data across every property
- Access to cross-portfolio analytics and insights

**Manager**
- Scoped to their assigned property or properties (multi-property assignment supported)
- Review submitted checklists, leave review notes, mark verified
- Set Completion Check result (Pass/Fail) per submission
- No visibility into other properties' data

**Staff**
- Sees only checklists assigned to them
- Can complete, submit, and view their own submission history
- Can view review notes left by their manager on their own submissions
- No visibility into other staff members' data or scores

### User Administration
- Admin invite flow with role and property assignment on onboarding
- Users assignable to one or more properties
- Per-property user lists visible to managers

---

## 2. Checklist Templates & Configuration

- Admin-created templates (e.g., Housekeeping Checklist, Arrivals Checklist, Lease Arrival/Lease Flip Checklist, AM Property Attendant Checklist, PM Property Attendant Checklist, Preventive Maintenance Checklist, Maintenance Checklist)
- Per-task configuration options:
  - Required photo (blocks submission if not provided)
  - Optional photo
  - Text / note field
  - Yes / No or Pass / Fail toggle
  - Dropdown selection
  - Condition rating: Good / Needs Attention / Out of Service (for PM checklists)
- Issue-reporting flag per task: if triggered, marks the submission as having an issue
- Template versioning: historical submissions stay linked to the version used at time of completion
- Shift designation per template: AM or PM (used for PA checklists and shift coverage gap detection)
- Asset/equipment tag field per task (for PM checklists — e.g., "PTAC Unit – Room 277")
- Pre-built starter template library (see Section 22)

---

## 3. Checklist Assignment & Scheduling

### Cloudbeds Integration — Checkout-Triggered (Housekeeping)
- App listens to Cloudbeds API for checkout events in real time
- On checkout: room is flagged as "Needs Housekeeping" in a **Checkout Queue** — no checklist is created yet
- Admin/Manager receives a prompt: *"Room [X] checked out. Ready to schedule housekeeping?"* with option to set a scheduled date or defer
- Once date is confirmed, checklist is created and assignable to staff
- Rooms in the checkout queue remain visible until scheduled — nothing falls through

### Cloudbeds Integration — Arrival-Triggered (Arrivals Checklist)
- App listens for same-day arrivals via Cloudbeds API
- Arrivals checklist created automatically on the arrival date, assigned to the property
- If room reassignment occurs in Cloudbeds:
  - New arrivals checklist created for the reassigned room
  - Previous arrivals checklist auto-deleted **if** status is Not Started or Incomplete
  - If previous checklist was already submitted/completed: retain it, flag for manager awareness

### Lease Arrival / Lease Flip Checklist
- Distinct checklist type from standard Arrival Checklist — triggered by lease turnover events, not standard Cloudbeds arrivals
- Separate template with deeper task scope (welcome basket verification, full unit walkthrough, etc.)
- Own performance benchmarks separate from standard arrivals
- Manual trigger by Admin/Manager on lease flip confirmation

### Preventive Maintenance Scheduling
- Admin creates a PM schedule per asset type and property with configurable intervals:
  - PTAC/HVAC filter cleaning: every 30 days per unit
  - Smoke detector test: every 90 days
  - Water heater inspection: every 6 months
  - Appliance check (fridge, microwave, range): every 60 days
  - Plumbing/drain inspection: every 90 days
  - Exterior/grounds walkthrough: weekly
- Schedule tied to room or common area (not just property-level)
- Due dates auto-calculated from last completion date + interval
- PM checklists auto-generated when due date is reached; assigned to Admin/Manager queue for staff assignment
- Overdue PM tasks flagged in red on dashboard

### Manual Assignment
- Admin/Manager can manually create checklists outside Cloudbeds triggers (maintenance, inspections, ad hoc tasks)
- Recurring assignments supported (daily, weekly, scheduled cadence)
- Bulk assignment: assign same checklist to multiple rooms across a property at once

### Checklist Title Auto-Generation

| Scenario | Format | Example |
|---|---|---|
| Single room, dated | `[Type] – Room [#] – [MM/DD/YY]` | Housekeeping Checklist – Room 323 – 07/01/26 |
| Arrivals, single room | `Arrivals Checklist – Room [#] – [MM/DD/YY]` | Arrivals Checklist – Room 141 – 07/01/26 |
| Lease Flip, single room | `Lease Arrival/Lease Flip – Room [#] – [MM/DD/YY]` | Lease Arrival/Lease Flip – Room 211 – 07/01/26 |
| PM, single room/asset | `PM Checklist – Room [#] – [MM/DD/YY]` | PM Checklist – Room 277 – 07/01/26 |
| Batch / no specific room | `[Type] – [MM/DD/YY]` | Housekeeping Checklist – 07/01/26 |
| Manual / non-room | `[Type] – [MM/DD/YY]` | Maintenance Checklist – 07/01/26 |

**Rules:**
- Room number appended only for single-room checklists
- Batch checklists omit room number in title; room is still a separate field on each submission
- Date suffix is always the **scheduled date**, not creation or completion date
- Title is system-generated; managers/admin can override if needed
- For Cloudbeds-triggered checklists, room number pulled directly from Cloudbeds — no manual entry

---

## 4. Checklist Completion (Staff-Facing)

- Mobile-first interface — primary use is field staff on phones
- Start time auto-captured when checklist is opened
- Completion time auto-captured on submission (total duration calculated automatically)
- **Photo capture in-app only** — photos do not save to device camera roll, cloud only
- Every photo automatically stamped with: exact timestamp + GPS coordinates (CompanyCam-equivalent)
- Required photo enforcement per task — cannot submit without it
- Optional annotation / comment per photo
- Issue field: free-text description of issues found
- Structured flags on submission:
  - Notify corporate of issues with photos? (Yes/No)
  - Return deposit? (Yes/No)
  - Items to replace? (Yes/No → text field for item list)
  - Place OOO? (Yes/No)
- PM-specific fields on submission:
  - Condition rating per item: Good / Needs Attention / Out of Service
  - Corrective action required: Yes/No → free-text description if yes
  - Parts/materials needed: Yes/No → item list if yes
  - Cannot mark an item "Good" if a corrective action is noted
- Cannot submit without completing all required fields and required photos
- **Offline mode**: checklist completion and photo capture work without connectivity; data auto-syncs when connection is restored; "Pending Sync" status shown clearly to staff

---

## 5. Manager Review Workflow

- Manager sees all submitted checklists for their property in a review queue, sorted oldest-first
- Review actions:
  - **Completion Check**: Pass or Fail
  - **Verified by PM**: checkbox
  - **Checklist Status**: Completed / Incomplete / Flagged
  - **Review Notes**: free-text, visible to the staff member
  - **Reviewed Date**: auto-populated on save
- Review notes are pushed as a notification to the staff member
- Submissions are immutable after PM verification (no silent edits; all changes logged)

---

## 6. Photo Documentation

- Timestamped and GPS-tagged photos on every captured image
- Required photo enforcement per task (blocking)
- Before/After comparison view: side-by-side view of a room across two checklist submissions
- Photo gallery per room, per property, browsable by date
- Photos linked to specific checklist tasks, not just the overall submission
- Photos remain in cloud storage only — not on device

---

## 7. Issues & Issue Tracking

- Issues flagged during checklist completion (via structured flags or issue text field)
- Issues dashboard shows:
  - Open issues count by property
  - Issues flagged for corporate notification
  - OOO rooms
  - Rooms pending deposit return decision
  - Replacement items pending
  - PM corrective actions open (from PM checklist submissions)
- Issues can be resolved/closed with a resolution note
- All issue views filterable by: property, date range, issue type, open vs. resolved status

---

## 8. Filtering, Sorting & Search

All checklist views are filterable and sortable by:
- Property
- Checklist type / template
- Assigned staff
- Date / date range
- Completion status
- Verified by PM (Yes/No)
- Completion Check result (Pass/Fail)
- Issues present (Yes/No)
- Shift (AM/PM, for PA checklists)

Admin can view all properties combined or drill into one. Managers see their property only.

---

## 9. Notifications & Alerts

- Push notification to staff when a new checklist is assigned
- Push/email notification to manager when a checklist is submitted with issues flagged
- Alert to admin when "Notify Corporate" is flagged on any submission
- Reminder to staff for overdue/unsubmitted checklists
- Notification to staff when manager leaves a review note on their submission
- Alert to admin/manager when a new checkout room enters the queue (Cloudbeds trigger)
- Alert to admin/manager when a PM checklist becomes overdue

---

## 10. Audit Trail

- All submissions immutable after PM verification
- Full change log: who modified what field, and when
- Created By and Modified By captured on every record
- Retain all historical submissions (configurable retention policy)

---

## 11. Multi-Property Architecture

- Property selector at top level of every screen for Admin and Manager
- All records tagged with property ID at creation
- No cross-property data bleed between staff accounts
- Portfolio-level views roll up across all 8 properties for Admin only

---

## 12. Staff Performance Dashboard

### Scoring Logic
- Completion Check Pass = 1 point, Fail = 0 points
- **Quality Score** = Completion Check passes ÷ total PM-verified submissions × 100%
- Only PM-verified submissions count toward the quality score
- Unreviewed submissions show as "Pending Review" and are excluded until verified

### Per-Staff Card
- Staff name + property
- Total checklists completed (week or month)
- Completion Check pass count
- **Quality Score** (%) with green/yellow/red indicator:
  - ≥ 80% → green
  - 60–79% → yellow
  - < 60% → red
- Trend vs. prior period (up/down/flat arrow)
- **Average completion time broken down per checklist type:**

  | Checklist Type | Completions | Avg Time |
  |---|---|---|
  | Housekeeping Checklist | 12 | 34 min |
  | AM Property Attendant | 6 | 28 min |
  | PM Property Attendant | 6 | 31 min |

### Views
- **By Week** (default) — navigate backward by week
- **By Month** — aggregate view

### Leaderboard (Manager/Admin)
- Ranked by quality score for the selected period
- Secondary sort: by average completion time per checklist type
- Filter by property, week, or month
- Admin sees cross-property leaderboard

### Drill-Down
- Click any staff card → view individual submissions behind the score
- Per submission: checklist type, completion time, Completion Check result, manager review note
- Outlier flags: completions under configurable minimum (e.g., < 10 min for housekeeping) or start time = completion time

### Staff Self-View
- Own quality score + average completion time per checklist type
- Own submission history with Completion Check result and review notes
- No visibility into other staff scores

### Benchmarks
- Property average completion time per checklist type (updated weekly)
- Shown alongside each staff member's average: *"You: 34 min | Property avg: 29 min"*
- Admin cross-property view: compare avg completion time per checklist type across all 8 properties

### Separate Completion Rate Metric
- **Completion Rate** = submitted ÷ assigned (tracks whether checklists are being done at all)
- **Quality Score** = pass ÷ verified (tracks whether they are done correctly)
- Both metrics surfaced separately on the staff card

### Edge Cases
- Missing start or completion time → excluded from average, flagged as "time not recorded" data quality warning
- Partial weeks (new hires, etc.) → display "X of Y reviewed" for context
- Single submission in a period → avg time shown with low-sample indicator

---

## 13. Reports

All reports filterable before generation by: property, checklist type, staff, date range (daily/weekly/monthly/custom), and checklist status.

### Checklist Completion Report
Full log of all submitted checklists with: property, room, checklist title, checklist type, shift, staff, completion date, start time, completion time, duration, issues noted, Completion Check result, PM verification status, review notes.
Export: CSV or PDF.

### Issues Report
All checklists where issues were flagged. Includes issue text, photos, corporate notification flag, OOO/deposit/replacement flags, resolution status.
Filterable: open vs. resolved.

### Staff Performance Report
Quality score (Completion Check pass %) and average completion time per checklist type, per staff member, for the selected period. Comparable across staff at the same property.

### Property Summary Report
Per-property rollup: total checklists assigned, completed, pending, pass rate, open issues count, average completion time by checklist type. One row per property for cross-portfolio view.

### Pending Review Report
All submitted checklists not yet PM-verified. Sorted by submission date ascending (oldest first). Manager action list.

### Unsubmitted / Overdue Report
Checklists assigned but not submitted past their scheduled date. Broken down by property and staff.

### Preventive Maintenance Report
Per-property PM compliance: scheduled PMs vs. completed on time, overdue count, corrective actions open, parts/materials requested. Filterable by asset type and property.

### Export Behavior
- All exports include active filter parameters in header row
- Filename follows RISE8 convention: `CompletionReport_6802_070126.csv`
- Photo export: download all photos for a submission or a date range per property

---

## 14. Dashboard

### Admin Dashboard (Cross-Portfolio)
- **Property tiles** — one per property showing:
  - Today's checklist completion count
  - Open issues count
  - Pending PM review count
  - Green/yellow/red health indicator
- Portfolio-level completion rate for the current week
- Issues flagged for corporate notification (across all properties)
- Rooms currently OOO
- **Checkout Queue** — rooms pending housekeeping scheduling (Cloudbeds-triggered, not yet assigned)
- Pending PM reviews — total count, click to drill in
- Staff performance leaderboard — top and bottom performers across all properties for the current week
- **PM Compliance tile** — portfolio-level: upcoming PMs due within 7 days, overdue PM count

### Manager Dashboard (Single Property)
- Today's checklist queue: assigned vs. submitted vs. verified
- Submitted checklists pending review — sorted oldest first
- Open issues for the property
- Staff performance cards for their team (current week quality score + avg completion time per checklist type)
- Checkout queue for their property
- PM tasks due within 7 days and overdue PM count

### Staff Dashboard
- My assigned checklists today — with status (Not Started / In Progress / Submitted)
- My upcoming assignments for the week
- My quality score this week and this month
- My avg completion time per checklist type this week
- Review notes from manager on recent submissions — surfaced as notification if new

---

## 15. Insights

Trend and pattern analysis surfaced automatically.

### Recurring Issues Tracker
If the same issue type or similar text appears on the same room or property more than a configurable threshold (e.g., 3× in 30 days), flag it as a recurring issue rather than a one-off.

*Example from current data: "Inside of trash can not visible" appeared on multiple Angela submissions across May–June. Should be auto-grouped and flagged as a recurring photo quality issue.*

### Completion Check Failure Patterns
Group all failed submissions by reason (manager review note text) and surface top failure reasons per staff and per property.

*Useful for distinguishing: "80% of Angela's failures are the same photo composition issue" vs. a staff member with varied problems requiring different coaching.*

### Checklist Timing Anomalies — Auto-Flag
- Duration under configurable minimum (e.g., < 10 min for housekeeping)
- Start time = completion time (data quality issue seen in current Smartsheet export)
- Photos with identical or near-identical timestamps across multiple "different" time checkpoints

*Example from current data: manager note "photos of 7pm, 10pm, and EOD look like taken at same time" — this should be auto-detected, not require manual flagging.*

### Property Health Trend
- Week-over-week pass rate per property displayed as a sparkline
- Admin can see a property trending down before it becomes a problem

### Staff Consistency Score
- Separate from quality score
- Measures how consistently a staff member submits on time, regardless of pass/fail
- A staff member who always submits but sometimes fails is a different problem from one who frequently doesn't submit at all

### Shift Coverage Gaps (PA Checklists)
- For properties with AM and PM PA checklist shifts: flag if one shift was submitted but the other was not for a given property on a given day

### PM Insights
- Rooms with the most recurring corrective actions flagged as high-maintenance units
- Asset type trend: is a specific asset type (e.g., PTACs at Kiss East) failing more frequently than at other properties?
- Preventive vs. reactive ratio: how many issues are caught by PM vs. surfaced during operational checklists (HK/Arrival)

---

## 16. Integrations

### Cloudbeds PMS
- Real-time webhook or polling for checkout events → triggers Checkout Queue entry
- Real-time sync for same-day arrival events → triggers Arrivals Checklist creation
- Room number pulled from Cloudbeds reservation data (no manual entry)
- Room reassignment events → update or delete pending Arrivals Checklists per rules in Section 3

### Smartsheet (Optional / Migration)
- Export capability to replicate current Smartsheet column structure for backward compatibility during transition
- Columns to match: Property, Room, Checklist Title, Completed By, Completion Date, Start Time, Completion Time, Total Time, Issues, Corporate Notify, Return Deposit, Replace Items, Items for Replacement, OOO, Verified by PM, Checklist Status, Reviewed Date, Completion Check, Week, Month

---

## 17. Data Model Notes (from Current Smartsheet Analysis)

The following edge cases were identified from the live Smartsheet data and must be handled in the app:

| Issue | Source | Required Handling |
|---|---|---|
| Room field is "-" (no number) | St. Aug data | Room field must accept free text, not numeric only |
| Room field is "Suite" | Orlando Arrival data | Room field must accept non-numeric labels |
| Start time = completion time | Multiple properties | Flag as data quality issue; exclude from duration averages |
| Checklist titles with inconsistent date formats | Various | System-generated titles only; no manual date suffix entry |
| Week and Month stored as numeric (e.g., Week 27, Month 6) | All sheets | Auto-compute from scheduled/completion date |
| Photos with identical timestamps across time-spaced tasks | Orlando PA data | Auto-flag as timing anomaly in Insights |
| Completion Check and Employee Bonus are separate columns | PA sheet | Map both to single "Completion Check" field in StayCheck |
| PA checklists have AM/PM shift designation | PA sheet | Shift field on all PA checklist templates; used for coverage gap detection |
| Lease Arrival/Lease Flip is a distinct checklist type | Arrival sheet | Separate template, separate benchmarks, manual trigger |
| PTAC/HVAC and AC vent issues surfaced in Arrival notes | Arrival sheet | PM follow-up task should auto-generate from flagged issues; not just sit as review note |

---

## 18. Preventive Maintenance Module

### PM Schedule Management
- Admin creates PM schedules per asset type and property with configurable intervals
- Default PM schedule starters:
  - PTAC/HVAC filter cleaning: every 30 days per unit
  - Smoke detector test: every 90 days
  - Water heater inspection: every 6 months
  - Appliance check (fridge, microwave, range): every 60 days
  - Plumbing/drain inspection: every 90 days
  - Exterior/grounds walkthrough: weekly
- Schedule tied to specific room or common area, not just property-level
- Due dates auto-calculated from last completion date + interval
- Overdue PM tasks flagged red on dashboard

### PM Checklist Execution
- Same mobile-first flow as operational checklists
- Required photos with timestamp and GPS on every PM task
- PM-specific fields per task:
  - Asset/equipment tag (e.g., "PTAC Unit – Room 277")
  - Condition rating: Good / Needs Attention / Out of Service
  - Corrective action required: Yes/No → free-text if yes
  - Parts/materials needed: Yes/No → item list if yes
- Cannot mark a task "Good" if a corrective action is noted — forces honest recording
- Corrective actions automatically create an open issue in the Issues tracker

### PM Tracking Dashboard
- Per property:
  - Upcoming PMs due within 7 days
  - Overdue PMs (count + list)
  - PMs completed this month
  - PM compliance % (completed on time ÷ total scheduled)
- Per room: full PM history — last completed date per task type, next due date
- Color-coded status: green (on schedule), yellow (due within 7 days), red (overdue)
- Admin cross-property PM compliance view

### PM Reports
- PM Compliance Report: scheduled vs. completed on time by property, asset type, and date range
- Open Corrective Actions Report: all unresolved PM issues with age and responsible property
- High-Maintenance Rooms Report: rooms with most recurring PM corrective actions

### PM + Operational Checklist Bridge
- Issues flagged in Arrival or HK checklists (e.g., "PTAC filter dirty", "AC vent dusty") can be escalated to generate a PM follow-up task directly from the review screen — no manual re-entry

---

## 19. Room Status Board

Live view of all rooms at a property showing current status at a glance.

| Status | Meaning |
|---|---|
| **Occupied** | Guest checked in |
| **Checkout** | Checked out, pending housekeeping scheduling |
| **Cleaning** | Housekeeping checklist in progress |
| **Clean** | Housekeeping complete, ready for arrival |
| **Arrival Pending** | Arrival checklist not yet started |
| **Arrival In Progress** | Arrival checklist in progress |
| **Ready** | Arrival checklist complete |
| **OOO** | Out of Order (flagged via checklist) |
| **PM Due** | Preventive maintenance scheduled or overdue |

- Driven by Cloudbeds occupancy data + checklist completion status
- Admin/Manager view per property; Admin can switch between properties
- Tap any room to see: current checklist queue, recent submission history, PM schedule, open issues

---

## 20. Issue Resolution & Work Order Tracking *(Phase 1.5)*

Currently issues flagged in checklists have no lifecycle beyond the review note. This module adds:
- Assign an issue to a responsible person with a target completion date
- Issue status: Open → In Progress → Resolved
- Closing photo required to mark resolved
- Recurrence tracking: if the same issue reappears on the same room within 60 days, auto-flag as recurring

*Data model must account for this in Phase 1 even if the UI ships in Phase 1.5.*

---

## 21. Offline Mode

- Full checklist completion and photo capture work without network connectivity
- Data and photos cached locally on device
- Auto-sync when connectivity is restored
- "Pending Sync" status shown clearly to staff member — never silently loses a submission
- Conflict resolution: if a submission was made offline and the checklist was reassigned in the interim, surface a conflict notice to the manager

---

## 22. Checklist Template Library

Pre-built industry-standard starter templates for Admin to pull, customize, and publish:

- Extended-stay room turn (standard housekeeping)
- Extended-stay arrival / move-in
- Lease flip / lease arrival
- PTAC/HVAC filter PM
- Appliance inspection PM
- Smoke detector / life safety PM
- Pool/amenity inspection
- Fire safety walkthrough
- Monthly deep clean
- Grounds/exterior inspection
- AM Property Attendant
- PM Property Attendant

Admin selects a template, customizes tasks and required photos for the property, then publishes. Templates are versioned — changes don't affect in-progress or historical submissions.

---

## 23. Out of Scope (Phase 1)

- Time clock / GPS clock-in (Connecteam time tracking — separate system)
- Payroll or actual bonus payment processing
- Guest-facing features
- Guest review score correlation (future analytics layer)
- In-app staff messaging / chat
- Integrations beyond Cloudbeds and optional Smartsheet export

---

## 24. Data Model Notes (from Current Smartsheet Analysis)

The following edge cases were identified from the live Smartsheet data and must be handled in the app:

| Issue | Source | Required Handling |
|---|---|---|
| Room field is "-" (no number) | St. Aug data | Room field must accept free text, not numeric only |
| Room field is "Suite" | Orlando Arrival data | Room field must accept non-numeric labels |
| Start time = completion time | Multiple properties | Flag as data quality issue; exclude from duration averages |
| Checklist titles with inconsistent date formats | Various | System-generated titles only; no manual date suffix entry |
| Week and Month stored as numeric (e.g., Week 27, Month 6) | All sheets | Auto-compute from scheduled/completion date |
| Photos with identical timestamps across time-spaced tasks | Orlando PA data | Auto-flag as timing anomaly in Insights |
| Completion Check and Employee Bonus are separate columns | PA sheet | Map both to single "Completion Check" field in StayCheck |
| PA checklists have AM/PM shift designation | PA sheet | Shift field on all PA checklist templates; used for coverage gap detection |
| Lease Arrival/Lease Flip is a distinct checklist type | Arrival sheet | Separate template, separate benchmarks, manual trigger |
| PTAC/HVAC and AC vent issues in Arrival notes | Arrival sheet | PM follow-up task should auto-generate from flagged issues |

---

*Document prepared by Kate Ome, Director of Asset Management, RISE8 Companies*
*For build use by Claude Code / development team*
*Version 1.1 — adds PM module, Room Status Board, Offline Mode, Issue Resolution (Phase 1.5), Template Library, Lease Flip type*
