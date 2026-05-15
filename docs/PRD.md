# RISE8 Operations Platform — Product Requirements Document (PRD)

**Version:** 1.0
**Date:** May 15, 2026
**Prepared by:** Kate, Director of Asset Management

---

## 1. Executive Summary

The RISE8 Operations Platform is a custom web application that replaces the operational checklist functionality currently delivered by Connecteam, while integrating directly into the existing Smartsheet ecosystem for historical archival. It serves field staff (Housekeeping, Property Attendants, Maintenance Technicians) and management (Property Managers, Corporate, Asset Management) across all 7 Stayable extended-stay properties.

The platform addresses three core problems with the current Connecteam + Smartsheet workflow:

1. Manual re-upload of completed checklist PDFs from Connecteam into Smartsheet (currently consuming 1–2 hours/day of corporate staff time)
2. Loss of structured data fidelity — photos and individual question responses are buried in PDFs and not queryable
3. Lack of integrated workflows for issue resolution, employee performance tracking, and bulk operational planning

This document defines the v1 scope. Out-of-scope items (time tracking, payroll, HR, scheduling) remain with Paycom.

---

## 2. Goals and Non-Goals

### 2.1 Goals (v1)

- Eliminate manual PDF re-upload from Connecteam to Smartsheet
- Provide a single mobile-and-desktop responsive web application for all operational checklist activities
- Capture photos with EXIF timestamp and GPS coordinates to verify on-property completion
- Support recurring and bulk checklist creation
- Provide real-time dashboards segmented by property, user, role, and checklist type
- Replace Connecteam's operational functionality for all 7 properties within 8 weeks of v1 launch

### 2.2 Non-Goals (v1)

- Time clock / time tracking (handled by Paycom)
- Payroll, benefits, HR records (handled by Paycom)
- Shift scheduling (use Paycom)
- Hiring and onboarding workflows
- Chat or messaging between staff
- Knowledge base, training, or courses (use SharePoint)
- Guest-facing functionality
- Native iOS or Android app (build as Progressive Web App / PWA only)

---

## 3. Users and Roles

The platform supports six user roles. Each role has defined permissions and a tailored interface.

| Role | Primary Activities | Permissions |
|---|---|---|
| **Housekeeping (HK)** | Complete assigned room cleaning checklists, capture photos | Fill own assignments only; view own history |
| **Property Attendant (PA)** | Complete arrival/due-out checklists, guest-facing tasks | Fill own assignments only; view own history |
| **Maintenance Tech (MT)** | Complete maintenance reports, pressure washing, roof PM, respond to flagged issues | Fill own assignments; view assigned issues |
| **Property Manager** | Review submissions, approve/flag, manage assignments, mark unavailable users | Full access to their property; cannot edit other properties |
| **Corporate** | Cross-property oversight, dashboard review, escalation handling | Read-write across all properties |
| **Admin** | User management, template configuration, system settings | Full system access including user provisioning |

---

## 4. Properties

The platform supports all active Stayable properties. Property records include name, internal property ID, street address, room count, and a geofence boundary (GPS polygon) used for photo verification.

| Property | Property ID | Location | Short Code | Active |
|---|---|---|---|---|
| Jacksonville West | 6802 | 6802 Commonwealth Ave, Jacksonville FL | Jax West | Yes |
| Jacksonville North | 812 | Jacksonville FL | Jax N | Verify |
| St. Augustine | 2535 | St. Augustine FL | St. Aug | Yes |
| Lakeland | 4645 | 4645 N. Socrum Loop Rd, Lakeland FL | Lakeland | Yes |
| Orlando OBT | 8700 | Orlando FL | Orlando | Yes |
| Kissimmee East | 2295 | 2295 E. Irlo Bronson, Kissimmee FL | Kiss E | Yes |
| Kissimmee West | 5399 | 5399 W. Irlo Bronson, Kissimmee FL | Kiss West | Yes |
| Davenport | 44199 | 44199 US Hwy 27, Davenport FL | Davenport | Yes |

> **Open question:** Jacksonville North (812) appears in Smartsheet Maintenance Report data but is not in the canonical 7-property list. Confirm before Week 2 seed.

---

## 5. Checklist Templates

The platform launches with nine checklist templates migrated from the current Connecteam configuration. Each template defines its question set, default assignee role, recurrence pattern, and review requirements.

| Template | Default Role | Recurrence | Scope | Review Required |
|---|---|---|---|---|
| Arrival Checklist | HK / PA | Daily, per room | Per room | Yes — Manager |
| DueOut / Departure | HK | Daily, per room | Per room | Yes — Manager |
| HK Review | HK Lead / Mgr | Weekly | Per property | Yes — Corporate |
| PA Review | Manager | Weekly | Per property | Yes — Corporate |
| Manager Review | Manager | Weekly | Per property | Yes — Corporate |
| Maintenance Report | MT | Daily | Per task/area | Yes — Manager |
| Pressure Washing | MT | Monthly | Per property | Yes — Manager |
| Roof Preventive Maintenance | MT | Quarterly | Per property | Yes — Manager |
| Room Inspection | Manager / Corp | Ad-hoc | Per room | Yes — Corporate |

Each template is configurable through the Admin interface — questions, photo requirements, conditional logic, and recurrence patterns can be edited without code changes.

### 5.1 Question Types Supported

- Single-select (radio)
- Multi-select (checkboxes)
- Yes/No
- Pass/Fail (with auto-flagging on Fail)
- Numeric input (with optional min/max validation)
- Short text
- Long text / notes
- Photo capture (single or multiple, with required/optional flag)
- Signature (touch/stylus)
- Date / time picker
- Section divider (organizational, not answered)

### 5.2 Conditional Logic

Questions can be set to appear conditionally based on prior answers. Example: "If smoke detector test = Fail, show Issue Description (required) and Photo (required)."

---

## 6. Core Workflows

### 6.1 Checklist Lifecycle

Each checklist instance moves through the following states:

- **Scheduled** — Created by recurring rule or bulk creation. Has assigned user and due date in future.
- **Assigned** — Confirmed. User notified via in-app and email. Active window.
- **In Progress** — User has opened the instance and started filling responses.
- **Submitted** — User completed and submitted. Awaits manager review.
- **Reviewed** — Manager approved. Counts toward bonus and metrics.
- **Flagged** — Manager flagged for follow-up. Issues auto-generated.
- **Invalidated** — Assigned user unavailable. Marked invalid by manager.
- **Reassigned** — Invalidated then reassigned to another user; new instance created, old retained as audit trail.
- **Expired** — Past due date, never submitted, never invalidated. Counts as miss.

### 6.2 Recurring and Bulk Creation

**Recurring rules:**
Admins configure recurrence rules per template per property. The system runs a daily 5:00 AM ET job that generates checklist instances for the upcoming work day based on each rule. Example rule: "Generate one Arrival Checklist instance for each occupied room at Lakeland every day at 5:00 AM ET, assign to the on-duty HK staff."

**Bulk creation (Property Manager / Corporate):**
Manager opens "Bulk Create" interface, selects: template, property, date(s), and either a room range (e.g., 100–410) or a list of specific rooms. The system creates one instance per (room, date) combination. Assignment can be done at creation time or left for the manager to assign later.

### 6.3 Assignment and Invalidation

At creation, each instance is assigned to either a specific user, a role (e.g., "any HK on shift today"), or left unassigned. If unassigned, the platform sends a daily morning email to the property manager listing unassigned instances.

If an assigned user becomes unavailable (sick, no-call, etc.), the property manager opens the instance and selects "Mark Invalid → Reason". Available reasons:

- Employee called out sick
- Employee no-call / no-show
- Employee reassigned to higher-priority task
- Room unavailable (guest extended, repair in progress)
- Other (free text)

After invalidation, the manager chooses: (a) reassign to a specific user, (b) reassign to a role, or (c) leave invalidated with no replacement. Choice (a) and (b) create a new instance with status "Assigned". The invalidated instance remains in history with reason.

### 6.4 Photo Capture and Verification

All photo questions trigger the device's native camera (no upload from gallery, to prevent stale photos). Each photo is captured with:

- EXIF timestamp (automatic — used as completion timestamp evidence)
- GPS coordinates (if device permits — captured separately via geolocation API since iOS strips EXIF GPS)
- Compressed to max 1920px on long edge, JPEG quality 85, ~500KB target

When the submission is uploaded, the platform performs geofence verification: for each photo with GPS, check whether the GPS point falls inside the property's polygon (configured per property in Admin). Results:

- **Inside geofence** — Mark photo as "Verified On-Property". No action.
- **Outside geofence** — Mark photo as "Off-Property — Verify". Manager sees a warning badge on review.
- **No GPS data** — Mark photo as "No Location". Manager sees a neutral badge. Common for indoor photos where device denied GPS.

Field staff are not punished automatically for off-property photos — many edge cases exist (taking a photo while approaching the property, or a photo of a vendor invoice from the office). The flag is informational, not enforcement.

### 6.5 Review and Approval

Submitted instances appear in the manager's review queue, sorted by oldest-first. The manager views:

- All question responses with photos rendered inline
- Geofence verification badges on each photo
- Time-to-complete (from In Progress → Submitted)
- User's history (last 30 days completion rate, flagged rate)

Manager actions:

- **Approve** — Set status to Reviewed. Counts toward bonus.
- **Flag** — Set status to Flagged. Requires reason. Auto-creates an Issue record (see 6.6). Does not count toward bonus.
- **Request Re-do** — Set status back to Assigned, notify user, with manager note.

### 6.6 Issues

When a checklist is flagged or when any Pass/Fail question is answered Fail, the platform auto-creates an Issue record:

- Property, room (if applicable), source checklist instance, source question
- Title (auto-generated from question text, editable by manager)
- Description (from response notes / manager flag reason)
- Photos (from source checklist)
- Status: Open / Assigned / In Progress / Resolved / Won't Fix
- Assignee (default: property MT)
- Priority (Low / Medium / High / Urgent — defaults to Medium)
- SLA target date (defaults based on priority)

MTs see their assigned issues in a dedicated "My Issues" view. Resolving an issue requires a resolution note and at least one resolution photo.

### 6.7 PDF Export

PDF export is on-demand, not automatic. Available actions:

- Single instance — generate a PDF mimicking the current Connecteam export format (one file per checklist)
- Bulk export — manager selects date range + property + template; system generates a ZIP of PDFs
- Audit export — corporate selects date range + property; system generates a comprehensive audit ZIP

PDF generation runs asynchronously. User receives an email when ready with a download link valid for 7 days.

---

## 7. Dashboards and Reports

### 7.1 Default Dashboards

The platform ships with the following dashboards. Each is filterable by date range, property, and (where applicable) user/role.

**Field Staff Home**
- Today's assigned checklists
- Overdue assignments
- My completion rate this week / month
- My bonus count this month

**Property Manager Home**
- Review queue (pending submissions)
- Today's checklist completion % by template
- Active issues by priority
- Staff performance heatmap (per user, last 7 days)
- Unassigned checklists for today

**Corporate Dashboard**
- Portfolio compliance % (7-day rolling)
- Per-property compliance % comparison
- Top issues by category and property
- Average review turnaround time per property
- Staff scorecard rollup (top performers, attention-needed list)

**Issues Dashboard**
- Open issues by property, priority, age
- SLA breach alerts
- Resolution time trends
- Repeat issues (same room, same problem within 30 days)

### 7.2 Custom Reports

Corporate and Admin users can build custom reports using a simple query builder: select source (checklists or issues), apply filters (property, template, user, status, date range), choose columns, and export as CSV or save as a named report.

---

## 8. Notifications

Notifications are delivered via two channels: in-app (badge counts and notification center) and email (via Resend). Push notifications are out of scope for v1.

| Event | In-App | Email | Recipient |
|---|---|---|---|
| Checklist assigned to you | Yes | Yes | Assigned user |
| Checklist overdue (1hr before due) | Yes | Yes | Assigned user + Manager |
| Submission awaiting review | Yes | Digest (every 4hr) | Property Manager |
| Your submission was flagged | Yes | Yes | Submitting user |
| Issue assigned to you | Yes | Yes | MT (assignee) |
| Issue past SLA | Yes | Yes | MT + Manager |
| PDF export ready | Yes | Yes | Requesting user |
| Daily morning summary | No | Yes (7:00 AM ET) | Property Managers |

---

## 9. Data Model (Logical)

The following entities define the platform's data model. Field details are in the Technical Architecture document.

### 9.1 Core Entities

- **User** — Account record. Includes role, assigned property, contact info, active flag, last login.
- **Property** — Property record. Includes property ID, name, address, geofence polygon, room count, active flag.
- **Room** — Room record. Includes property FK, room number, current status (occupied/vacant/OOO).
- **ChecklistTemplate** — Reusable definition. Includes name, version, default role, recurrence rule, review level.
- **Question** — Belongs to a template. Includes type, prompt, required flag, photo requirements, conditional logic, fail-flag flag, order.
- **ChecklistInstance** — A specific occurrence. Includes template FK, property FK, room FK (optional), scheduled date, assigned user FK (optional), status.
- **Response** — An answer to a Question on a ChecklistInstance. Includes answer value, notes, response timestamp.
- **Photo** — Belongs to a Response. Includes object storage URL, EXIF timestamp, GPS coordinates, geofence verification result, file size.
- **Issue** — A problem requiring follow-up. Includes property FK, room FK (optional), source instance FK, source question FK (optional), title, description, status, assignee, priority, SLA date.
- **Signature** — Touch/stylus signature. Belongs to a Response. PNG image in object storage.
- **AuditLog** — Every status change, assignment change, and review action. Includes actor user FK, action, before/after, timestamp.
- **NotificationLog** — Every notification sent. Includes recipient, channel, event type, status, timestamp.

---

## 10. Migration and Cutover

The cutover from Connecteam to the new platform follows a 4-week parallel run model.

### 10.1 Pre-Launch (Week -2)
- Provision all field staff user accounts (email-based, password reset link sent to each)
- Property managers complete platform training (1-hour session per property)
- Configure geofence polygons for all 7 properties
- Migrate or recreate all 9 checklist templates
- Set up recurring rules for daily and weekly checklists

### 10.2 Parallel Run (Weeks 1–4)
- Staff complete checklists in BOTH Connecteam and the new platform
- Karla and Christopher monitor for discrepancies daily
- Issues, edge cases, and feature gaps logged in a dedicated Smartsheet
- Smartsheet sync remains in Connecteam-driven workflow (no change)

### 10.3 Cutover (Week 4)
- Once new platform completion rate matches or exceeds Connecteam for 2 consecutive weeks, schedule cutover
- Cutover date communicated 1 week in advance
- Day-of cutover: Connecteam set to read-only access (history preserved)
- Karla stops manual PDF uploads to Smartsheet
- Smartsheet checklist sheets become historical archives (no new rows added)

### 10.4 Historical Data
Smartsheet sheets remain accessible read-only. New platform starts fresh — no backfill. The platform can reference "historical archive" from the corporate dashboard via a link to the Smartsheet workspace, but does not import that data.

---

## 11. Success Metrics

v1 will be considered successful if, within 8 weeks of cutover:

1. Manual PDF re-upload from Connecteam to Smartsheet drops to zero — reclaiming approximately 1–2 hours/day of corporate staff time
2. Checklist completion rate matches or exceeds Connecteam baseline (currently approximately 95% based on Smartsheet data)
3. Time from checklist submission to manager review averages under 4 hours during business hours
4. Issue resolution time decreases by at least 30% compared to current text-buried-in-Smartsheet workflow
5. Field staff adoption (defined as at least one submission per assigned shift) reaches 90% within 2 weeks of cutover
6. Number of duplicate or re-keyed data points in the operations pipeline drops to zero

---

## 12. Open Questions

The following items require decisions from leadership before or during build.

| Question | Owner | Needed By |
|---|---|---|
| Can a field user invalidate their own assignment (call in sick) or manager only? | Rob / Kate | Week 2 |
| MFA required for managers/corporate by default? Or opt-in? | Kate | Week 1 |
| Final list of recurring rules per template per property | Property Managers | Week 4 |
| Final geofence polygons per property (mapped from satellite) | Kate | Week 5 |
| Bonus rules — how does Bonus = 1 vs 0 calculate in the new platform? | Rob | Week 3 |
| SLA defaults per issue priority (Low/Med/High/Urgent) | Christopher | Week 4 |
| Subdomain final choice (ops.stayable.com vs alternatives) | Kate | Week 1 |
| Is Jacksonville North (812) in scope as the 8th property? | Kate | Week 2 |

---

*End of PRD*
