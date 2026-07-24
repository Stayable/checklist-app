# StayCheck v1.1 — S1 Design Queries for Kate

**Phase:** S1 — Review Workflow Upgrade (StayCheck v1.1)
**Spec:** `docs/superpowers/specs/2026-07-02-staycheck-v1.1-adaptation.md` (§2 items 1–2, §1 row "Manager review")
**Prepared by:** Claude Code / Kyle · **Date:** 2026-07-24
**Status of S1:** Approved to build (S1 → S2 manual → S4). These four calls shape the S1 database schema and review UI. Everything else in S1 is already specified.

\---

## How to answer

Each question has options with plain-English explanations and trade-offs. My recommendation is marked **★ REC**. You can either pick an option per question, or just reply **"go with all recs"** and I'll build to the recommended set. Write your pick after each ▶.

\---

## Context: what the "structured flags" are

Four specific outcomes from a departure / checkout inspection that need to drive action *beyond* the normal checklist questions. They came over from the old Connecteam/Smartsheet columns:

|Flag|Meaning|
|-|-|
|**Notify corporate**|This submission needs corporate attention.|
|**Return deposit**|Guest's deposit should be returned (room left in good order).|
|**Items to replace**|Something needs replacing — plus a free-text list of what.|
|**Place OOO**|Put the room Out Of Service.|

Questions 2 and 3 below are about *who sets these* and *how we store them*.

\---

## Q1 — Completion Check (Pass/Fail): who sets it, and how?

A single overall Pass/Fail verdict on each submission. Maps directly to the old Connecteam **"Completion Check"** column (we're folding the scrapped "Employee Bonus" column into this one per ADR-014).

|Option|What it means|Trade-off|
|-|-|-|
|**A. Manager, manual at review** ★ REC|The manager sets an overall Pass/Fail during review, as a deliberate judgment separate from the Approve / Flag / Re-do action.|Most faithful to how the Connecteam column worked (a human verdict). One extra click for the manager.|
|**B. Auto-derived from questions**|System computes it: **FAIL** if any required Pass/Fail question failed, otherwise **PASS**. Manager can override.|Zero manual effort, always consistent. But "did every question pass" isn't always the same as "was this a good job" — an auto-PASS can hide a sloppy-but-technically-complete submission.|
|**C. Staff self-reports at submit**|The field staff marks the checklist Pass/Fail when they submit it.|Puts the verdict on the person being evaluated — weak for a quality metric. Not recommended.|

**Why REC = A:** Completion Check feeds the Quality Score in S5 (pass ÷ verified). Keeping it a manager judgment keeps that metric meaningful. We can still *show* the auto-derived result (B) as a hint next to the manual control.

▶ **Kate's answer:** Manager manual review

\---

## Q2 — Structured flags: who sets them, and when?

|Option|What it means|Trade-off|
|-|-|-|
|**A. Manager at review** ★ REC|Flags are set by the manager during review.|These are routing / action decisions (notify corporate, place OOO, return the deposit) that a manager owns and is accountable for. Cleanest authority model. Downside: the manager, not the person who physically inspected the room, is entering them.|
|**B. Staff at fill, manager confirms**|Field staff raise the flags as inspection outcomes while filling the checklist; the manager confirms or overrides at review.|Most faithful to a real departure inspection — the inspector saw the room. But it adds flag UI to the fill flow and a confirm step to review (more to build, more to train).|
|**C. Staff at fill only**|Flags are pure inspection outputs set by whoever fills the checklist; the manager just sees them, can't change them.|Simplest for the manager, but no oversight — a staff member alone decides "return deposit" / "place OOO." Risky for deposit and OOO decisions.|

**Why REC = A:** Deposit return, OOO, and corporate escalation are decisions with financial/operational weight — a manager should own them. If you'd rather the inspector capture them first, pick B (more build, but arguably more accurate). Tell me if departure inspections at Stayable are done *by* the manager or by staff — that would settle this.

▶ **Kate's answer:** **Staff at fill, manager confirms**

\---

## Q3 — How do we store the structured flags?

Purely a data-model choice; invisible to end users, but it affects reporting.

|Option|What it means|Trade-off|
|-|-|-|
|**A. Dedicated columns** ★ REC|Four fixed fields on every submission record: `notifyCorporate`, `returnDeposit`, `itemsToReplace` (+ `itemsToReplaceList` text), `placeOOO`. Same four on every departure submission.|Strongly typed, trivial to roll up into dashboards ("12 rooms flagged OOO this week"). Their whole purpose is feeding reports, so this fits. Downside: the set of flags is fixed in code — adding a 5th flag later is a small migration, not a config change.|
|**B. Reserved question types**|Model each flag as a special *checklist question* a template author can drop into a template.|Flexible per-template (a property could have its own flags). But much harder to aggregate for dashboards, and it complicates the template builder. Overkill for four universal checkout flags.|

**Why REC = A:** The flags are universal to checkouts and exist to drive dashboards/reports. Dedicated columns are the spec's recommendation (§2 item 2).

▶ **Kate's answer:** **Dedicated columns**

\---

## Q4 — Immutability: after a submission is "Verified by PM," is there an unlock path?

"Verified by PM" is a new checkbox that locks a submission (makes it immutable — no more edits or re-submissions), stamped with who verified it and when.

|Option|What it means|Trade-off|
|-|-|-|
|**A. Admin-only unlock, audited** ★ REC|Verifying locks the submission. An **ADMIN** (not a regular manager) can unlock it to fix a genuine mistake; every unlock is written to the audit log.|Immutability holds for day-to-day work, but there's a controlled escape hatch for real errors, with a paper trail. Safe default.|
|**B. Hard lock, no unlock**|Once verified, permanently immutable. Any correction must go through Re-do *before* verifying.|Simpler and stricter — nothing can ever change a verified record. But a single mis-click ("Verify" on the wrong submission) is unrecoverable and would need a raw DB edit.|

**Why REC = A:** Immutability is the point, but real operations need a break-glass. Restricting unlock to ADMIN + audit keeps it honest without painting us into a corner.

▶ **Kate's answer:** **Admin-only unlock, audited**

\---

## Also confirming (no decision needed unless you disagree)

These are already settled in the spec — flagged here only so nothing is silent:

* **Verified-by-PM** is a manager-level checkbox at review; sets `verifiedByPm`, `verifiedAt`, `lockedAt`.
* **Review note → staff notification:** when a manager leaves a review note (on Flag / Re-do / verify), the submitter gets notified — email (now wired via Resend) + in-app. Bilingual EN/ES per ADR-013.
* **Free-text room on instance:** submissions can carry a free-text room label (e.g. "Suite", "-") for cases that don't map to a `Room` record.

▶ **Any objection to these three?** not all review note will be communicated to the staff. If just internal note where the staff doesn't need to know no need to send.

\---

*Reply inline, or say "go with all recs." Once answered, S1 goes to a written implementation plan.*

