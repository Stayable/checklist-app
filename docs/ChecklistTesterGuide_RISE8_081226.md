# StayCheck — Tester Guide

**For:** Abby · Bea · Carl · Christopher · Erika · Jeffrey · Karla · Randy · Ruby
**Date:** 12 August 2026
**App:** https://ops.rentstayable.com

You are testing the app that will replace **Connecteam checklists**. It is live software with real
property data in it, so treat what you type as real — but the **checklist questions themselves are
placeholder text** (see §5). Test how the app *behaves*, not whether the wording is right.

---

## 1. Signing in the first time

1. Go to **https://ops.rentstayable.com**
2. Email: **your own `@rentstayable.com` address**
3. Password: **`TestAgents26!`** — shared by all nine of you, and you must replace it immediately
4. You will be asked for a **6-digit code emailed to you.** Check your inbox and enter it. This
   happens on any new device or browser, then not again on that device for 30 days.
5. You will land on **Profile**, and **you cannot go anywhere else until you set your own
   password.** That is deliberate. Enter `TestAgents26!` as the current password, choose your own
   (8 characters minimum), save.

After that the app opens normally.

**If the code never arrives**, tell Kyle rather than retrying repeatedly — 5 failed sign-in attempts
in 15 minutes locks the account for 30 minutes.

---

## 2. What you can see

Two sections in the left sidebar (bottom bar on a phone):

| Section | What is in it |
|---|---|
| **Home** | Your own assigned checklists for today, what you have finished, and a resume link |
| **Checklist** | Dashboard · New checklist · Review · Issues · Rules · Templates · Completed · Reports |

There is a **property picker in the header** — you are attached to all 8 properties, so use it to
narrow any screen to one property.

**Maintenance, Construction, Network and the Admin console are hidden from you on purpose.** That is
not a bug and not a permissions error. Maintenance holds live contractor scheduling that is nothing to
do with this test.

---

## 3. Please test these, in this order

### A. Create a checklist and fill it in
1. **Checklist → New checklist.**
2. Pick a template, a property, and today's date. **Use one of these six** — the other three need
   room numbers that do not exist yet (§5):
   HK Review · PA Review · Manager Review · Pressure Washing · Roof Preventive Maintenance ·
   Maintenance Report
3. Assign it **to yourself**.
4. Open it from **Home** and fill it in. Try every kind of question you meet.
5. **Take at least one photo.** Use the camera when it asks — there is deliberately no way to pick an
   old photo from your gallery.
6. **Sign** where a signature is asked for.
7. **Submit.**

**What to look for:** does the form make sense on a phone? Is anything confusing, mis-worded (beyond
the placeholder content), or hard to tap? Does it remember your answers if you close the tab halfway
and come back?

### B. Photos and location
Photos record where they were taken and are marked **Verified**, **Off property**, or **No GPS**.

- Taking photos **while standing at a property** should read **Verified**.
- Taking them **at home or in the office** will read **Off property**. **That is correct behaviour,
  not a fault.**
- It is a label only — nothing is ever blocked because of it.

Property boundaries were drawn on 12 Aug. **If you are on site and a photo says Off property, that is
worth reporting** — it means a boundary is drawn too tightly.

### C. Review someone's work
1. **Checklist → Review.**
2. Open a submitted checklist. You see every answer, the photos with their times and location badges,
   the signatures, and how long it took.
3. Try all three: **Approve**, **Flag**, **Request re-do**. Add a note.
4. Note the **notify toggle** — approving does not email the person by default, flagging does, a
   re-do always does.

**Look for:** is it obvious what you are approving? Can you tell a good submission from a sloppy one
at a glance in the queue?

### D. Issues
1. Answering a **Pass/Fail question with Fail** creates an Issue automatically. Try it.
2. **Checklist → Issues**: assign it to someone, set a priority, add a photo, close it with a note.
3. Priorities carry a target response time (4 / 24 / 72 / 168 hours). Those numbers are placeholders —
   **tell us what they should be.**

### E. Dashboards and reports
- **Dashboard** — completion, incomplete, overdue, unassigned, open issues.
- **Reports → Daily completeness** and **Issues found** — filter, then **export the PDF**.
- **Completed** — browse finished work, filter by property, date, person.

**Look for:** is this what you would actually want to see first thing in the morning? What is missing?

### F. On your phone
Open the site on your phone and **install it** ("Add to Home Screen" on iPhone, "Install app" on
Android). It should open full-screen like an app. Fill a checklist that way — that is how field staff
will use it.

### G. Templates (optional)
You can build **new** templates for your own properties. The nine standard ones are locked to admins,
so you cannot damage them.

---

## 4. What to report, and how

Send to **Kyle**, one line each is fine:

- **What you did**, what happened, what you expected instead
- **Which property and which checklist**, if relevant
- **Phone or computer**, and which browser
- A **screenshot** whenever the screen is the point

Most useful of all: **anything that felt slower or more annoying than Connecteam.** That is the bar
this has to beat.

---

## 5. Known gaps — please do not report these

These are already known and are being worked on. Reporting them costs you time for nothing.

| What you will notice | Why |
|---|---|
| **The questions are nonsense placeholders** | The real question content for all 9 checklists has not been written yet. **Karla and Christopher own that** — if you are one of them, this test is a good moment to start. |
| **Arrival, DueOut/Departure and Room Inspection cannot be created** | They are per-room checklists and **no room numbers exist in the system yet.** Send Kyle the real room numbers per property and they light up. |
| **Nothing appears by itself each morning** | Automatic daily creation is built but no recurring rules exist yet, so it generates nothing. Everything has to be created by hand for now. Deciding *which checklist recurs how often at which property* is the other big thing we need from you. |
| **No notification bell** | Not built yet. Some emails do send: approve, flag, re-do, and issue assignment. |
| **Spanish is machine-translated** | Field-facing screens are bilingual but not yet reviewed by a person. Manager screens are English-only by design. |
| **Response-time targets look arbitrary** | They are placeholders (4 / 24 / 72 / 168 h). |
| **Maintenance / Construction / Network / Admin are missing** | Hidden from your role on purpose. |
| **The app is not branded yet** | Logo, colours and fonts are a later pass. |

---

## 6. Housekeeping

- **Change your password on first login** — it is enforced, you cannot skip it.
- The starting password `TestAgents26!` is shared by all nine of you, so it is **not** a secret. Do
  not keep using it anywhere.
- You have access to **all 8 properties**, which real staff will not — a housekeeper will see one.
- Anything you create is **real data in the live system.** Create freely, but keep it recognisable as
  a test where you can.
- Questions, or stuck: **Kyle**.
