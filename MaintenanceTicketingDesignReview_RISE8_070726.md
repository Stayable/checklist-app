# Maintenance / Ticketing — Design Review \& Sign-off

**Matter:** Component II (Ticketing System) and its collisions with the StayCheck design
**Prepared by:** Kyle (via Claude Code)
**Date:** 2026-07-07
**Status:** Draft — routing for staged review

\---

## How this document works

This is a **staged review**. It moves in order and each stage gates the next:

1. **Kate** (Part 1) — Director of Asset Management, author of the StayCheck PRD. **Fix the design inconsistencies** below (her PRD vs. the new three-component direction, plus a few internal contradictions in the PRD itself). Answer each `Decision:` line — write **"confirm"** to accept my recommendation, or edit it.
2. **Crystal** (Part 2) — Head of Operations, owner of the Maintenance Dispatch brief. After Kate reconciles, **approve the design and add what you want.**
3. **Rob** (Part 3) — Sponsor. After Crystal, **approve scope/budget and add suggestions.**

Detailed, build-level questions (filter lists, SLA hours, form spam guards, etc.) live in the companion doc `MaintenanceTicketingScopingQuestions\_RISE8\_070726.md` and get worked **after** this chain settles the foundation. Don't build anything until Part 1 is done and Parts 2–3 approve.

### Sign-off ledger

|Stage|Owner|Status|Date|
|-|-|-|-|
|1. Design reconciliation|Kate|☑ reconciled (1.3 label + 1.2 ownership left for Crystal)|2026-07-07|
|2. Ops approval + additions|Crystal|◧ in review|2026-07-07|
|3. Sponsor sign-off|Rob|☐ waiting on Crystal||

\---

## Background (one paragraph)

We restructured the project into three components (ADR-025): 
**I. Checklist App (StayCheck)** — live in prod; 
**II. Maintenance / Ticketing System** — new; 
**III. Construction Progress/Scheduling** — parked, gated on Rob's separate brief. 
Component II consolidates maintenance intake into one queue. **Today's reality (confirmed Kyle 2026-07-08):** tenant maintenance requests come via **TurboTenant + Jotform**, consolidated in **Smartsheet** (current source of truth for maintenance status/progress); maintenance also arrives as **email to `admin@`/`blake@`** that is hard to track and often missed; and staff spot problems on checklists. **Property managers** own triage/assignment/daily scheduling; **Gerardo & Jesus** schedule contractors downstream. Component II absorbs all of that (replacing the Smartsheet maintenance tracker + catching the missed emails). It's also a **Zoho Desk replacement** for the email side (shared inbox on the two mailboxes → AI triage) and the front of the maintenance workflow: a ticket can dispatch a maintenance checklist, and completing that checklist closes the ticket. 
The problem: **Kate's PRD already placed "issues" and "work orders" inside the checklist app**, and the app already shipped an `/issues` pipeline. So before building, the design has to be reconciled — that's Part 1.

\---

# PART 1 — KATE: Design reconciliation

Six items. Each shows what the PRD says, what conflicts, the impact, and a decision.

### 1.1 — Where do issues \& work-orders live? *(the big one)*

* **PRD says:** issue tracking and the work-order lifecycle live **inside the checklist app** — 
§7 (Issues \& Issue Tracking), 
§18 (PM→issue bridge), 
§20 (Issue Resolution \& Work Order Tracking, Phase 1.5: assign + target date + Open→In Progress→ Resolved + closing photo + recurrence).
* **Conflicts with:** the new direction that **Ticketing is a separate system** where issues *and* maintenance come in and users work them. The app also already ships a standalone `/issues` page (SLA, assignment, resolution photos).
* **Impact:** if we don't decide, we build **two** issue trackers — one in checklists, one in Ticketing — which is exactly the "users get lost" problem.
* **Recommendation:** the **checklist app detects and *emits* issues** (failed task, structured flag, PM corrective action); 
the **Ticketing system owns the lifecycle** (triage → assign → work → close). 
**Migrate the existing `/issues` into Ticketing** and retire the standalone page — its SLA/assignment/photo logic is reused, not thrown away. 
§20 becomes a Ticketing capability, not a checklist-app one.
* **Kate's decision:** ok with the recommendation. Issues in checklist app is usually based from the checklist created and from the staff who observed the issu. the ticketing system was more on tenant input on which they enter details of items that needs fixing by management. 


### 1.2 — Ticketing is *new scope* beyond the PRD — who owns it?

* **PRD says:** §23 Out of Scope explicitly excludes **"integrations beyond Cloudbeds and optional Smartsheet export."** Email ingestion (`blake@`), the tenant form, AI triage, and WhatsApp are **not in the StayCheck PRD at all.**
* **Conflicts with:** Component II being built now. It's genuinely new product surface, and Crystal's Maintenance Dispatch brief covers the crew/dispatch half of it.
* **Impact:** unclear design ownership → conflicting specs.
* **Recommendation:** **Kate owns the Checklist App (I) design; Crystal owns the Ticketing/Dispatch (II) design; the maintenance connection between them (dispatch-a-checklist-and-close-the-ticket) is jointly owned.** Ticketing gets its own spec, not a bolt-on to the StayCheck PRD.
* **Kate's decision:** items in maintenance checklist can come from the findings or issues from the property checklists (found by staff) or by tenants if their expertise requires it.

### 1.3 — Roles: PRD says three, the app has six

* **PRD says:** §1 "Three roles: **Admin, Manager, Staff**." No "Corporate" role.
* **Built reality (ADR-023):** the DB keeps **six** roles (HK, PA, MT, MANAGER, CORPORATE, ADMIN) for RBAC/shift logic, with a 3-role **display** grouping. Current mapping (`lib/role-display.ts`): HK/PA/MT → **Staff**, MANAGER → **Manager**, **CORPORATE → "Admin"**, ADMIN → **Admin**.
remove corporate - "admin"
* **Impact:** "Corporate" (read-write across all properties — e.g., ops staff) is invisible in the PRD's role language, and Ticketing needs to know who the **agents** are.
* **Recommendation:** (a) accept the display grouping (Corporate shows as "Admin"); (b) **Ticketing agents = Admin + Corporate + Manager**; field staff (HK/PA/MT) are **not** agents — they only receive dispatched checklists.
* **Kate's decision:** remove corporate - "admin", managers can also receive checklists but they can also manage checklist

### 1.4 — Internal contradictions in the PRD to fix

* **(a) Duplicate section.** §17 and §24 are the **same** "Data Model Notes (from Current Smartsheet Analysis)" table, pasted twice. → Delete one. **Confirm?** ok
* **(b) Recurrence threshold conflict.** §15 says recurring = **"3× in 30 days"**; §20 says **"same room within 60 days."** Pick one rule for issue/ticket recurrence. → Rec: **≥2× same room+similar issue in 60 days.** **Your call:** **≥2× same room+similar issue in 60 days**
* **(c) Bonus is stale.** §17/§24 says "map Employee Bonus to Completion Check," but **ADR-014 scrapped bonus entirely** and the `bonusEligible` field was dropped from the DB. → Rec: confirm **bonus is fully out**, remove the mapping note. **Confirm?** instead of bonus, make it completion check which can be used for bonuses

### 1.5 — Boundary confirmations (what's a ticket vs. a checklist-app item)

* **(a) Structured flags.** §4/§7 flags — **Notify Corporate, Return Deposit, Items to Replace, Place OOO** — are issue-like but not maintenance. Do they become **tickets** in Ticketing, or stay **checklist-app dashboard items**?
→ Rec: **OOO, deposit, and replacement stay in the checklist-app operational dashboard**; only *maintenance-type* problems become tickets. (Keeps the ticket queue about repairs, not deposits.) **Decision:** agree with rec
* **(b) Tenant-form photos.** §4 mandates "**in-app camera only, no camera roll.**" But tenants submitting the public maintenance form aren't app users — the form must allow a normal **photo upload**. → Rec: confirm this **exception** for the tenant form only. **Confirm?** yes
* **(c) Checkout → checklist trigger.** §3 says checkout puts the room in a **Checkout Queue** and a manager gets a **"Ready to schedule housekeeping?"** prompt — the checklist is **not** auto-created until scheduled. (Kyle's working mental model was "auto-created when the room's dirty.") → Rec: confirm the PRD's **queue-then-schedule** (semi-manual) is correct. **Confirm?** queue then create checklist once scheduled

### 1.6 — Anything else Kate sees


> **Reconciliation status (Kyle, 2026-07-07).** Kate reconciled Part 1. Two items carried forward to Crystal rather than closed here:
> - **1.2 ownership** — Kate re-stated the sourcing model (maintenance items come from staff checklist findings *or* tenants) but did not rule on the I/II design-ownership split; that's Crystal's to confirm in Part 2.
> - **1.3 role label** — Kate wants Corporate **not** displayed as "Admin." Working interpretation: **CORPORATE → "Manager"** display (the role stays in the DB for RBAC; Corporate is a portfolio-wide manager *without* system-admin rights — it can't provision users or open `/admin`). To be confirmed with Kate; does not block Crystal.
>
> **Intake correction:** the desk monitors **two mailboxes — `admin@rentstayable.com` + `blake@rentstayable.com`** (was `blake@` only). MS Graph consent is needed on both.

PART 2 — CRYSTAL: Ops approval + additions
===

*Fill in after Kate completes Part 1. You own the Maintenance Dispatch brief (`ProjectBrief\_MaintenanceDispatch\_062226.docx`), so this system is largely yours.*

> **Input path (Kyle, 2026-07-08).** Ops input for Part 2 is **split by who actually does the work:**
> - **Contractor scheduling + construction** → **Gerardo & Jesus** (they schedule contractors; brief `TicketingBriefDispatch_RISE8_070826.md`).
> - **Maintenance-request intake/triage/daily scheduling** → **property managers** (they run this today in Connecteam, fed by TurboTenant + Jotform + Smartsheet). Recipient **TBD** (Q2 open) — a PM brief will be drafted recipient-agnostic and held until Crystal/Kyle assign it.
>
> **Crystal oversees and signs off** Stage 2 — both streams reconcile up to her before this moves to Rob.

### 2.1 — Do you approve the reconciled design?

The Ticketing System: maintenance requests (**TurboTenant + Jotform** — today in Smartsheet; plus **email `admin@`/`blake@`**, AI-triaged) and issues (from checklists) flow into **one ticket queue**; **property managers** triage/assign/schedule the day-to-day, and can **dispatch a maintenance checklist** to a tech; completing it closes the ticket. **Gerardo & Jesus** schedule contractors downstream and handle emergency-contractor coordination (the Teams chat).

* **Approve as-is / approve with changes / hold:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Changes, if any:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 2.2 — What do you want added?

Your dispatch brief includes several things **not** in the week-1 desk. For each, say **v1 / later / drop**:

* **Crew scheduling** — plan the week, reserve 20–25% capacity, defer bumped planned work and roll it forward, Davenport renovation as a standing block. → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Cost capture per job** — labor time + parts, to drive in-house-vs-outsource decisions. → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **WhatsApp crew channel** — crews report Property/Location/Problem/Photo, receive assignments (needs Meta Business setup + a pilot). → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Dispatcher role + named backup** — you named Gerardo; who's the backup so dispatch never stalls? → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Emergency definition** — lock the list of what counts as URGENT (no power, water leak, no hot water, unsafe/uninhabitable) → immediate notify + phone call. → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Crew skills + location tracking** — to assign the right nearby tech (electrical/plumbing/HVAC/cosmetic/general). → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Translation** — crews report in Spanish; back-office reads English. Auto-translate, keep original. → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_
* **Guest-reported issues** — do front-desk/guest reports feed this same system? → \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 2.3 — Construction (Component III): how should it work?

*Your answers here **greenlight and shape the construction build** — this is where the construction side gets defined. The sketch (`IngestionEngineSketch_RISE8_070726.png`) puts **Construction, Maintenance, and existing Issues behind one shared ingestion engine** — the same front door, review queue, and translate/confidence pipeline. Since you run ops, we want your picture of the construction side before the engine is designed, so it's built to serve all three lanes at once instead of retrofitted later. Answer what you can; "don't know yet" is fine for any single item.*

**How it works today**
* **C-1.** Who is the "construction team" — **renovation/buildout contractors**, a **dedicated in-house crew**, or **both**? (Davenport renovation is already a standing block in your dispatch brief.)
* **C-2.** Roughly how many active crews/contractors and concurrent projects across the properties right now?
* **C-3.** How do they report progress **today** (WhatsApp, text, photos, voice, in person, nothing systematic)? Same channels as maintenance crews, or different?
* **C-4.** What's the **single biggest pain** — no visibility into progress, chasing for updates, work slipping late, punch-list/quality tracking, or documentation for draws/billing?

**What the system should produce** (the diagram's Construction lane = *progress %, punch-list, draw docs*)
* **C-5.** Rank what matters most: progress %/milestones · punch-list tracking · blocker/delay alerts · photo-verified sign-offs · draw/billing documentation · daily summary.
* **C-6.** Who needs to *see* construction status — you, Rob, property managers, asset management, accounting?

**How it integrates with what we're building**
* **C-7.** When a construction update comes in, should it become a **Ticket** in this same Ticketing system (a `kind = construction` ticket), a **dispatched checklist** (like a maintenance work order), or a **separate project/progress view** that only shares the intake engine? *(Rec: separate progress view, but reuse the ingestion engine + review queue + Teams digest so nothing is rebuilt.)*
* **C-8.** Should a construction crew's photo/voice update flow through the **same human-review queue** as maintenance (someone approves before it's logged), or does construction need its own reviewer?
* **C-9.** Does construction scheduling overlap with the **crew scheduling** you asked for in 2.2, or are they separate calendars? (i.e., is a renovation just a big standing block on the same crew schedule, or its own thing?)
* **C-10.** Who reviews/approves construction items day-to-day — you, Gerardo, a PM, a project lead?

### 2.4 — Anything else you want

\---

\---

# PART 3 — ROB: Sponsor sign-off

*Fill in after Crystal completes Part 2.*

### 3.1 — Scope \& budget

Component II (Ticketing) is **new scope beyond the original checklist replacement** — it adds a ticketing product, AI email triage, and (later) crew dispatch. It reuses \~70% of the existing platform (auth, roles, SLA, audit, geofence, Teams). Added cost is modest per-message AI + existing infra.

* **Green-light status:** ☐ Proceed to build · ☐ Proceed to a smaller pilot first · ☐ Hold, needs discussion
* **Budget/scope concerns:** \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

### 3.2 — What do you want added or changed

\---

### 3.3 — Note on Component III (Construction)

Construction was originally gated on your answers in `docs/ConstructionAgentBrief\_RISE8\_062026.md` §5. Note the shift: **Crystal's answers in §2.3 now greenlight and shape the construction build** at the ops level, so the shared ingestion engine is designed to serve the Construction lane from the start. What remains for you here is **scope/budget sign-off** — confirm you're good with construction being built alongside Ticketing, or flag if you want it held.

* \---

\---

## After all three sign off

Kyle + Claude Code turn this into the **Component II design spec** → implementation plan → build, with Kate on page/UX review before merge. The detailed build questions in `MaintenanceTicketingScopingQuestions\_RISE8\_070726.md` get answered alongside the spec.

