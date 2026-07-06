# Maintenance / Ticketing — Design Review & Sign-off

**Matter:** Component II (Ticketing System) and its collisions with the StayCheck design
**Prepared by:** Kyle (via Claude Code)
**Date:** 2026-07-07
**Status:** Draft — routing for staged review

---

## How this document works

This is a **staged review**. It moves in order and each stage gates the next:

1. **Kate** (Part 1) — Director of Asset Management, author of the StayCheck PRD. **Fix the design inconsistencies** below (her PRD vs. the new three-component direction, plus a few internal contradictions in the PRD itself). Answer each `Decision:` line — write **"confirm"** to accept my recommendation, or edit it.
2. **Crystal** (Part 2) — Head of Operations, owner of the Maintenance Dispatch brief. After Kate reconciles, **approve the design and add what you want.**
3. **Rob** (Part 3) — Sponsor. After Crystal, **approve scope/budget and add suggestions.**

Detailed, build-level questions (filter lists, SLA hours, form spam guards, etc.) live in the companion doc `MaintenanceTicketingScopingQuestions_RISE8_070726.md` and get worked **after** this chain settles the foundation. Don't build anything until Part 1 is done and Parts 2–3 approve.

### Sign-off ledger
| Stage | Owner | Status | Date |
|---|---|---|---|
| 1. Design reconciliation | Kate | ☐ pending | |
| 2. Ops approval + additions | Crystal | ☐ waiting on Kate | |
| 3. Sponsor sign-off | Rob | ☐ waiting on Crystal | |

---

## Background (one paragraph)

We restructured the project into three components (ADR-025): **I. Checklist App (StayCheck)** — live in prod; **II. Maintenance / Ticketing System** — new; **III. Construction Progress/Scheduling** — parked, gated on Rob's separate brief. Component II is a Zoho Desk replacement (email `blake@` + tenant form → AI triage → tickets) that also becomes the front of the maintenance workflow: a ticket can dispatch a maintenance checklist, and completing that checklist closes the ticket. The problem: **Kate's PRD already placed "issues" and "work orders" inside the checklist app**, and the app already shipped an `/issues` pipeline. So before building, the design has to be reconciled — that's Part 1.

---

# PART 1 — KATE: Design reconciliation

Six items. Each shows what the PRD says, what conflicts, the impact, and a decision.

### 1.1 — Where do issues & work-orders live? *(the big one)*
- **PRD says:** issue tracking and the work-order lifecycle live **inside the checklist app** — §7 (Issues & Issue Tracking), §18 (PM→issue bridge), §20 (Issue Resolution & Work Order Tracking, Phase 1.5: assign + target date + Open→In Progress→Resolved + closing photo + recurrence).
- **Conflicts with:** the new direction that **Ticketing is a separate system** where issues *and* maintenance come in and users work them. The app also already ships a standalone `/issues` page (SLA, assignment, resolution photos).
- **Impact:** if we don't decide, we build **two** issue trackers — one in checklists, one in Ticketing — which is exactly the "users get lost" problem.
- **Recommendation:** the **checklist app detects and *emits* issues** (failed task, structured flag, PM corrective action); the **Ticketing system owns the lifecycle** (triage → assign → work → close). **Migrate the existing `/issues` into Ticketing** and retire the standalone page — its SLA/assignment/photo logic is reused, not thrown away. §20 becomes a Ticketing capability, not a checklist-app one.
- **Kate's decision:** _______________

### 1.2 — Ticketing is *new scope* beyond the PRD — who owns it?
- **PRD says:** §23 Out of Scope explicitly excludes **"integrations beyond Cloudbeds and optional Smartsheet export."** Email ingestion (`blake@`), the tenant form, AI triage, and WhatsApp are **not in the StayCheck PRD at all.**
- **Conflicts with:** Component II being built now. It's genuinely new product surface, and Crystal's Maintenance Dispatch brief covers the crew/dispatch half of it.
- **Impact:** unclear design ownership → conflicting specs.
- **Recommendation:** **Kate owns the Checklist App (I) design; Crystal owns the Ticketing/Dispatch (II) design; the maintenance connection between them (dispatch-a-checklist-and-close-the-ticket) is jointly owned.** Ticketing gets its own spec, not a bolt-on to the StayCheck PRD.
- **Kate's decision:** _______________

### 1.3 — Roles: PRD says three, the app has six
- **PRD says:** §1 "Three roles: **Admin, Manager, Staff**." No "Corporate" role.
- **Built reality (ADR-023):** the DB keeps **six** roles (HK, PA, MT, MANAGER, CORPORATE, ADMIN) for RBAC/shift logic, with a 3-role **display** grouping. Current mapping (`lib/role-display.ts`): HK/PA/MT → **Staff**, MANAGER → **Manager**, **CORPORATE → "Admin"**, ADMIN → **Admin**.
- **Impact:** "Corporate" (read-write across all properties — e.g., ops staff) is invisible in the PRD's role language, and Ticketing needs to know who the **agents** are.
- **Recommendation:** (a) accept the display grouping (Corporate shows as "Admin"); (b) **Ticketing agents = Admin + Corporate + Manager**; field staff (HK/PA/MT) are **not** agents — they only receive dispatched checklists.
- **Kate's decision:** _______________

### 1.4 — Internal contradictions in the PRD to fix
- **(a) Duplicate section.** §17 and §24 are the **same** "Data Model Notes (from Current Smartsheet Analysis)" table, pasted twice. → Delete one. **Confirm?** _______________
- **(b) Recurrence threshold conflict.** §15 says recurring = **"3× in 30 days"**; §20 says **"same room within 60 days."** Pick one rule for issue/ticket recurrence. → Rec: **≥2× same room+similar issue in 60 days.** **Your call:** _______________
- **(c) Bonus is stale.** §17/§24 says "map Employee Bonus to Completion Check," but **ADR-014 scrapped bonus entirely** and the `bonusEligible` field was dropped from the DB. → Rec: confirm **bonus is fully out**, remove the mapping note. **Confirm?** _______________

### 1.5 — Boundary confirmations (what's a ticket vs. a checklist-app item)
- **(a) Structured flags.** §4/§7 flags — **Notify Corporate, Return Deposit, Items to Replace, Place OOO** — are issue-like but not maintenance. Do they become **tickets** in Ticketing, or stay **checklist-app dashboard items**?
  → Rec: **OOO, deposit, and replacement stay in the checklist-app operational dashboard**; only *maintenance-type* problems become tickets. (Keeps the ticket queue about repairs, not deposits.) **Decision:** _______________
- **(b) Tenant-form photos.** §4 mandates "**in-app camera only, no camera roll.**" But tenants submitting the public maintenance form aren't app users — the form must allow a normal **photo upload**. → Rec: confirm this **exception** for the tenant form only. **Confirm?** _______________
- **(c) Checkout → checklist trigger.** §3 says checkout puts the room in a **Checkout Queue** and a manager gets a **"Ready to schedule housekeeping?"** prompt — the checklist is **not** auto-created until scheduled. (Kyle's working mental model was "auto-created when the room's dirty.") → Rec: confirm the PRD's **queue-then-schedule** (semi-manual) is correct. **Confirm?** _______________

### 1.6 — Anything else Kate sees
Free space — any other design conflict, gap, or change you want before Crystal reviews:

_______________

---

# PART 2 — CRYSTAL: Ops approval + additions

*Fill in after Kate completes Part 1. You own the Maintenance Dispatch brief (`ProjectBrief_MaintenanceDispatch_062226.docx`), so this system is largely yours.*

### 2.1 — Do you approve the reconciled design?
The Ticketing System: issues (from checklists) and maintenance requests (email `blake@` + a public tenant form, AI-triaged) flow into **one ticket queue**; agents (Admin/Corporate/Manager) triage, assign, and can **dispatch a maintenance checklist** to a tech; completing it closes the ticket.
- **Approve as-is / approve with changes / hold:** _______________
- **Changes, if any:** _______________

### 2.2 — What do you want added?
Your dispatch brief includes several things **not** in the week-1 desk. For each, say **v1 / later / drop**:
- **Crew scheduling** — plan the week, reserve 20–25% capacity, defer bumped planned work and roll it forward, Davenport renovation as a standing block. → _______________
- **Cost capture per job** — labor time + parts, to drive in-house-vs-outsource decisions. → _______________
- **WhatsApp crew channel** — crews report Property/Location/Problem/Photo, receive assignments (needs Meta Business setup + a pilot). → _______________
- **Dispatcher role + named backup** — you named Gerardo; who's the backup so dispatch never stalls? → _______________
- **Emergency definition** — lock the list of what counts as URGENT (no power, water leak, no hot water, unsafe/uninhabitable) → immediate notify + phone call. → _______________
- **Crew skills + location tracking** — to assign the right nearby tech (electrical/plumbing/HVAC/cosmetic/general). → _______________
- **Translation** — crews report in Spanish; back-office reads English. Auto-translate, keep original. → _______________
- **Guest-reported issues** — do front-desk/guest reports feed this same system? → _______________

### 2.3 — Anything else you want
_______________

---

# PART 3 — ROB: Sponsor sign-off

*Fill in after Crystal completes Part 2.*

### 3.1 — Scope & budget
Component II (Ticketing) is **new scope beyond the original checklist replacement** — it adds a ticketing product, AI email triage, and (later) crew dispatch. It reuses ~70% of the existing platform (auth, roles, SLA, audit, geofence, Teams). Added cost is modest per-message AI + existing infra.
- **Green-light status:** ☐ Proceed to build · ☐ Proceed to a smaller pilot first · ☐ Hold, needs discussion
- **Budget/scope concerns:** _______________

### 3.2 — What do you want added or changed
_______________

### 3.3 — Note on Component III (Construction)
Construction is a **separate** decision — it's gated on your answers in `docs/ConstructionAgentBrief_RISE8_062026.md` §5. Not part of this sign-off; flag if you want it pulled in.
- _______________

---

## After all three sign off
Kyle + Claude Code turn this into the **Component II design spec** → implementation plan → build, with Kate on page/UX review before merge. The detailed build questions in `MaintenanceTicketingScopingQuestions_RISE8_070726.md` get answered alongside the spec.
