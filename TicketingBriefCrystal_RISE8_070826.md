# Maintenance / Ticketing System — Overview & Questions for Crystal

**For:** Crystal Johnson — Head of Operations
**From:** Kyle (via Claude Code)
**Date:** 2026-07-08
**Matter:** Component II (Ticketing / Dispatch). You own this system's design — this doc gets you the full picture and asks what we need from you.
**Status:** Ready for your review. Kate has already reconciled the design conflicts (Part 1 of the formal sign-off); you're next.

> **Companion doc:** the formal, staged sign-off ledger lives in `MaintenanceTicketingDesignReview_RISE8_070726.md` (Kate → **you** → Rob). This doc is the plain-language version so you don't have to read the whole PRD. Answer here or there — I'll reconcile.

---

## 0. How to use this document (easiest: talk it through with Claude)

**Recommended path:**

1. Open **claude.ai** and **upload this file** into a new chat.
2. **Talk it through.** Ask Claude to explain anything, walk you question-by-question through §4, and pressure-test your answers. Answer conversationally — you don't have to write formal prose.
3. **Add anything you want** — before generating the file, this is your chance to bring up whatever's on your mind: extra features or capabilities you'd want, how you actually run maintenance/dispatch day-to-day, concerns, comments, or anything about the wider project you want on the record. Tell Claude to fold it into the file. The structured questions in §4 are a starting point, not a limit.
4. When you're done, paste this prompt to get your answers as a clean file to send back:

   > *"Based on our whole discussion, generate `TicketingAnswersCrystal_RISE8_<today's date MMDDYY>.md` — a filled-in copy of §4 with my answer to every question, plus a short section capturing any extra features, comments, or project notes I raised, ready to send to Kyle."*

5. Send Kyle the file it produces. That's it.

*(Prefer to skip the chat? You can also just type answers into the blanks in §4 and send this file back directly.)*

**Helps the discussion (optional attachments):** drop in the diagram **`IngestionEngineSketch_RISE8_070726.png`** (the one-front-door sketch) and your own **`ProjectBrief_MaintenanceDispatch_062226.docx`** so Claude can reference them directly. Not required — this brief stands on its own — but it makes the construction and dispatch questions richer.

**One caveat:** Claude in that chat won't have the app's code or the other project docs, so keep it at the *design and ops* level (what it should do, how construction should work, what's v1) — not implementation detail. That's exactly what §4 asks anyway.

---

## 1. What this is (the 30-second version)

We're building a **ticketing system** to replace **Zoho Desk**. It turns maintenance requests — from tenants, staff, and email — into **tickets** that your team can see, claim, assign, and close, all inside the same app as the checklists.

Two things make it more than a shared inbox:
1. **AI triage** — an incoming email or form is read by AI, which extracts the property, room, problem, and priority, translates Spanish → English, and drafts the ticket. **A human always approves before anything is created** — the AI never decides alone.
2. **It connects to the checklists** — a ticket can **dispatch a maintenance checklist** to a tech, and when they complete it, the ticket closes. One loop, no double entry.

**Cost/effort:** reuses ~70% of what's already built (logins, roles, SLA timers, audit trail, geofence, Teams digest). The new cost is a modest per-message AI charge on top of existing infrastructure.

---

## 2. How it works (the flow)

The design principle from our whiteboard (`IngestionEngineSketch_RISE8_070726.png`):

> **One front door for the field. Three desks behind it.**

Everything messy from the field — email, the tenant form, and (later) WhatsApp with photos/voice/Spanish — comes in **one door**, gets normalized and AI-read **once**, lands in a **human review queue**, and is then **routed by who sent it + what it's about** into one of three lanes:

| Lane | What it handles | Status |
|---|---|---|
| **Maintenance** *(yours)* | Dispatch queue, scheduling, cost-per-repair | Building now |
| **Issues (existing)** | Failed-checklist issues, SLA, Teams digest | Already live; folding in |
| **Construction** | Progress %, punch-list, draw docs | Concept — see §4.3 |

**Intake sources (v1):**
- **Email** — the system monitors **two mailboxes, `admin@rentstayable.com` and `blake@rentstayable.com`** (replaces Zoho Desk's inbox).
- **Tenant maintenance form** — a public web form; tenants enter what needs fixing and can upload photos.
- **Manual create** — you or a manager can open a ticket directly.
- **From checklists** — when staff find a problem on a checklist, it *emits* an issue that flows into this same queue.

**Ticket vs. "concern":** payments / refunds / extensions come in too, but those aren't repairs — they're **concerns**, held for a human to decide, and don't create a work order. The ticket queue stays about repairs.

---

## 3. What Kate already settled (so you're not re-deciding it)

Kate reconciled the design conflicts between her checklist PRD and this new system. The ones that affect you:

- **Issues + work-orders live *here*, not in the checklist app.** The checklist app *detects and emits* issues (staff-observed); the **Ticketing system owns the full lifecycle** (triage → assign → work → close). The old standalone `/issues` page gets migrated in and retired — its SLA/assignment/photo logic is reused, not rebuilt.
- **Where items come from:** staff checklist findings **or** tenant input (tenants enter items needing management's fix).
- **Agents** (who works tickets) = Admin, Corporate, and Managers. Managers can both **manage** and **receive** dispatched checklists. Field staff (housekeeping/attendants/techs) only *receive* dispatched work — they don't triage.
- **Recurrence flag:** a repeat problem = **same room + similar issue ≥2× in 60 days**.
- **Structured flags** like "Place Out-of-Order," "Return Deposit," "Items to Replace" stay in the checklist dashboard — only actual **maintenance problems** become tickets.
- **Tenant form photos** may be normal uploads (tenants aren't app users, so the "in-app camera only" rule doesn't apply to them).

---

## 4. What we need from you

### 4.1 — Do you approve the design in §1–§2?

Issues (from checklists) and maintenance requests (email + tenant form, AI-triaged) flow into **one ticket queue**; agents triage, assign, and can dispatch a maintenance checklist; completing it closes the ticket.

- **Approve as-is / approve with changes / hold:** ______________
- **Changes, if any:** ______________

### 4.2 — Your Maintenance Dispatch brief — what's in v1?

Your brief (`ProjectBrief_MaintenanceDispatch_062226.docx`) includes things beyond the week-1 desk. For each, tell us **v1 / later / drop**:

| Item | Your call |
|---|---|
| **Crew scheduling** — plan the week, reserve 20–25% capacity, roll bumped work forward, Davenport renovation as a standing block | |
| **Cost capture per job** — labor time + parts, to drive in-house-vs-outsource decisions | |
| **WhatsApp crew channel** — crews report Property/Location/Problem/Photo, receive assignments (needs Meta Business setup + a pilot) | |
| **Dispatcher role + named backup** — you named Gerardo; who's the backup so dispatch never stalls? | |
| **Emergency definition** — lock the URGENT list (no power, water leak, no hot water, unsafe/uninhabitable) → immediate notify + phone call | |
| **Crew skills + location tracking** — assign the right nearby tech (electrical/plumbing/HVAC/cosmetic/general) | |
| **Translation** — crews report in Spanish; back-office reads English. Auto-translate, keep original | |
| **Guest-reported issues** — do front-desk / guest reports feed this same system? | |

### 4.3 — Construction (Component III): how should it work?

*Your answers here **greenlight and shape the construction build** — this is where we decide how the construction side gets built. The whiteboard puts Construction, Maintenance, and Issues **behind one shared intake engine**, so we want your picture of the construction side **before** we design the engine, so it's built to serve all three lanes from the start instead of retrofitted later. "Don't know yet" is a fine answer for any single item.*

**How it works today**
- **C-1.** Who is the "construction team" — **renovation/buildout contractors**, a **dedicated in-house crew**, or **both**? (Davenport renovation is already a standing block in your dispatch brief.)
- **C-2.** Roughly how many active crews/contractors and concurrent projects across the properties right now?
- **C-3.** How do they report progress **today** — WhatsApp, text, photos, voice, in person, nothing systematic? Same channels as maintenance crews, or different?
- **C-4.** **Single biggest pain** — no visibility into progress, chasing for updates, work slipping late, punch-list/quality tracking, or documentation for draws/billing?

**What the system should produce** (the diagram's Construction lane = *progress %, punch-list, draw docs*)
- **C-5.** Rank what matters most: progress %/milestones · punch-list tracking · blocker/delay alerts · photo-verified sign-offs · draw/billing docs · daily summary.
- **C-6.** Who needs to *see* construction status — you, Rob, property managers, asset management, accounting?

**How it connects to what we're building**
- **C-7.** When a construction update comes in, should it become a **Ticket** in this same system (a `construction`-type ticket), a **dispatched checklist** (like a maintenance work order), or a **separate progress view** that only shares the intake engine? *(Our lean: separate progress view, but reuse the intake engine + review queue + Teams digest so nothing's rebuilt — tell us if that's wrong.)*
- **C-8.** Should a construction crew's photo/voice update flow through the **same human-review queue** as maintenance, or does construction need its own reviewer?
- **C-9.** Does construction scheduling overlap with the **crew scheduling** in §4.2, or are they separate calendars? (Is a renovation just a big standing block on the same crew schedule, or its own thing?)
- **C-10.** Who reviews/approves construction items day-to-day — you, Gerardo, a PM, a project lead?

### 4.4 — Anything else you want in this system

______________

---

## 5. What happens next

Once you're done, this goes to **Rob** for scope/budget sign-off. After that, Kyle + Claude Code turn your answers into the Component II build spec → implementation plan → build, with review checkpoints along the way. The detailed build-level questions (exact SLA hours, email filter lists, form spam guards) get worked alongside the spec — you don't need to touch those here.

Thanks, Crystal — your answers shape how the whole maintenance side gets built.
