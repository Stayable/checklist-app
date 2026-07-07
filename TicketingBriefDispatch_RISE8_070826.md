# Maintenance / Ticketing System — Contractor Scheduling & Construction: Questions for Gerardo & Jesus

**For:** Gerardo and Jesus — contractor scheduling
**From:** Kyle (via Claude Code)
**Date:** 2026-07-08
**Matter:** Component II (Ticketing / Dispatch). We're building a system to pull all maintenance into one place. You two schedule the **contractors**, so this brief asks about **that** part — contractor dispatch and construction. **Crystal oversees and signs off** — your answers feed up to her.
**Status:** Kate has reconciled the overall design (Part 1 of the formal sign-off). We need your input on the contractor/construction side next.

> **Companion doc:** the formal sign-off ledger lives in `MaintenanceTicketingDesignReview_RISE8_070726.md` (Kate → **Crystal** → Rob). This is the plain-language version. Answer here — I'll reconcile it up to Crystal.

---

## 0. How to use this document (easiest: talk it through with Claude)

**Recommended path:**

1. Open **claude.ai** and **upload this file** into a new chat.
2. **Talk it through.** Ask Claude to explain anything, walk you question-by-question through §4, and pressure-test your answers. Answer conversationally — you don't have to write formal prose.
3. **Add anything you want** — before generating the file, bring up whatever's on your mind: how contractor scheduling actually works today, extra features you'd want, pain points, concerns, or anything about the wider project you want on the record. Tell Claude to fold it in. The questions in §4 are a starting point, not a limit.
4. When you're done, paste this prompt to get your answers as a clean file to send back:

   > *"Based on our whole discussion, generate `TicketingAnswersDispatch_RISE8_<today's date MMDDYY>.md` — a filled-in copy of §4 with my answer to every question, plus a short section capturing any extra features, comments, or project notes I raised, ready to send to Kyle."*

5. Send Kyle the file it produces. That's it.

*(Prefer to skip the chat? You can also just type answers into the blanks in §4 and send this file back directly.)*

**Helps the discussion (optional attachments):** drop in the diagram **`IngestionEngineSketch_RISE8_070726.png`** and the **Maintenance Dispatch brief** (`ProjectBrief_MaintenanceDispatch_062226.docx`) so Claude can reference them directly. Not required — this brief stands on its own.

**One caveat:** Claude in that chat won't have the app's code, so keep it at the *how-it-should-work* level — not technical detail. That's exactly what §4 asks anyway.

---

## 1. What this is, and where you two fit

We're building a **ticketing system** that pulls **all maintenance into one place** — inside the same app as the checklists. Today, maintenance requests are scattered: tenants submit through **TurboTenant** and **Jotform** (consolidated in Smartsheet), some come as **emails** that get missed, and staff spot problems on **checklists**. This system consolidates all of that into **one queue**.

**Who does what:**
- **Property managers** run the day-to-day: they triage incoming requests, assign them, and set each property's maintenance schedule.
- **You two (Gerardo & Jesus)** come in when a job needs a **contractor** — you schedule the contractors, and you get pulled in for **property emergencies that need one** (the Teams chat with Shayla Shane, Shay Harper, Kyle, and you two).

**This brief is about your part** — contractor dispatch, scheduling, and construction. The property-manager side is being worked separately.

---

## 2. How the whole thing works (context)

The design principle from our whiteboard (`IngestionEngineSketch_RISE8_070726.png`):

> **One front door for the field. Three desks behind it.**

Everything comes in **one door**, gets AI-read once (extract property/room/problem, translate Spanish→EN, flag priority — **a human always approves, AI never decides alone**), lands in a **review queue**, and routes into one of three lanes:

| Lane | What it handles | Who works it |
|---|---|---|
| **Maintenance** | Requests → triage → assign → daily schedule | Property managers |
| **Contractor dispatch** *(your part)* | When a job needs a contractor / emergency contractor | **Gerardo & Jesus** |
| **Construction** | Renovation/buildout progress, punch-list, draw docs | See §4.3 |

**Where requests come from (v1):**
- **TurboTenant + Jotform** — tenant maintenance requests (today consolidated in Smartsheet; this replaces that).
- **Email** — `admin@rentstayable.com` + `blake@rentstayable.com`, to catch maintenance emails that are hard to track and often missed today.
- **Checklists** — staff spot a problem, it becomes a ticket.
- **Manual create** — a manager opens one directly.

A ticket can **dispatch a maintenance checklist** to a tech; completing it closes the ticket. Payments/refunds/extensions are held as **"concerns,"** not work orders — the queue stays about repairs.

---

## 3. What Kate already settled (so you're not re-deciding it)

- **Issues + work-orders live in this system**, not the checklist app. The checklist app *detects and emits* issues; this system owns the lifecycle (triage → assign → work → close).
- **Recurrence flag:** a repeat problem = **same room + similar issue ≥2× in 60 days**.
- Only actual **maintenance/repair problems** become tickets (out-of-order, deposits, replacements stay on the checklist dashboard).

---

## 4. What we need from you

### 4.1 — Does §1–§2 match how contractor scheduling actually works?

You schedule contractors; you get pulled in for emergencies that need one; those emergencies run through the Teams chat with Shayla, Shay, Kyle, and you two.

- **Matches / needs changes / here's how it really works:** ______________
- **What did we get wrong or leave out?** ______________

### 4.2 — Contractor & crew scheduling — what's in v1?

The Maintenance Dispatch brief (`ProjectBrief_MaintenanceDispatch_062226.docx`) lists these. For each, tell us **v1 / later / drop** based on what you actually need:

| Item | Your call |
|---|---|
| **Crew/contractor scheduling** — plan the week, reserve 20–25% capacity, roll bumped work forward, Davenport renovation as a standing block | |
| **Cost capture per job** — labor time + parts, to drive in-house-vs-outsource decisions | |
| **WhatsApp crew channel** — contractors report Property/Location/Problem/Photo, receive assignments (needs Meta Business setup + a pilot) | |
| **Dispatcher role + named backup** — who dispatches contractors, and who's the backup so it never stalls? | |
| **Emergency definition** — lock the URGENT list (no power, water leak, no hot water, unsafe/uninhabitable) → immediate notify + phone call | |
| **Crew skills + location tracking** — assign the right nearby contractor (electrical/plumbing/HVAC/cosmetic/general) | |
| **Translation** — contractors report in Spanish; back-office reads English. Auto-translate, keep original | |

### 4.3 — Emergency-contractor coordination (the Teams chat)

Right now, property emergencies needing a contractor get raised in a Teams chat (Shayla Shane, Shay Harper, Kyle, Gerardo, Jesus).

- **C-0a.** Should that emergency coordination be **captured in this system** (a flagged urgent ticket the group sees + acts on), or stay a separate Teams conversation? ______________
- **C-0b.** When you pull a contractor off scheduled work for an emergency, should the system **auto-reschedule** the bumped job, or do you handle that manually? ______________

### 4.4 — Construction: how should it work?

*Your answers here **greenlight and shape the construction build**. Since you schedule the contractors doing the buildouts, this is largely yours. "Don't know yet" is fine for any single item.*

**How it works today**
- **C-1.** Who is the "construction team" — **renovation/buildout contractors**, a **dedicated in-house crew**, or **both**? (Davenport renovation is already a standing block.)
- **C-2.** Roughly how many active crews/contractors and concurrent projects across the properties right now?
- **C-3.** How do they report progress **today** — WhatsApp, text, photos, voice, in person, nothing systematic?
- **C-4.** **Single biggest pain** — no visibility into progress, chasing for updates, work slipping late, punch-list/quality tracking, or documentation for draws/billing?

**What the system should produce** (the diagram's Construction lane = *progress %, punch-list, draw docs*)
- **C-5.** Rank what matters most: progress %/milestones · punch-list tracking · blocker/delay alerts · photo-verified sign-offs · draw/billing docs · daily summary.
- **C-6.** Who needs to *see* construction status — you, Rob, property managers, asset management, accounting?

**How it connects to what we're building**
- **C-7.** When a construction update comes in, should it become a **Ticket** (a `construction`-type ticket), a **dispatched checklist**, or a **separate progress view** that only shares the intake engine? *(Our lean: separate progress view, but reuse the intake engine + review queue + Teams digest so nothing's rebuilt — tell us if that's wrong.)*
- **C-8.** Should a construction crew's photo/voice update flow through the **same review queue** as maintenance, or does construction need its own reviewer?
- **C-9.** Does construction scheduling overlap with the **crew scheduling** in §4.2, or are they separate calendars?
- **C-10.** Who reviews/approves construction items day-to-day — you two, Crystal, a PM, a project lead?

### 4.5 — Anything else you want in this system

______________

---

## 5. What happens next

Your answers go to **Crystal** to review and sign off, then to **Rob** for scope/budget. After that we turn them into the build spec → plan → build. The property-manager side of maintenance (intake triage, daily scheduling) is being worked in a separate brief, so you only need to cover the contractor and construction pieces here.

Thanks, Gerardo and Jesus — your input shapes how contractor dispatch and construction get built.
