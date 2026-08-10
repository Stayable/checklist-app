# ⛔ SUPERSEDED — Contractor Schedule (Calendar) + Daily Dashboard — Design

> **DO NOT BUILD FROM THIS DOCUMENT. Superseded by ADR-028 before it was written.**
>
> **Superseded 2026-08-10** (Kyle's decision, same day it was drafted). Archived here with the
> other Track C/D/E reference material rather than deleted, because the reasoning is worth keeping.
>
> **Why it is dead:** this design is built entirely on `ContractorJob` and `Contractor`. Both were
> **deleted from `main` on 2026-08-03** — a week before this was written — by commit `94ce338`
> (*"feat!: drop the Track D contractor/dispatch rail"*) under **ADR-028**, along with the `Trade`
> and `JobStatus` enums, `Photo.contractorJobId`, `app/contractors`, `app/dispatch`, `app/j` and
> `lib/{contractors,contractor-jobs,dispatch-message,job-link}`. Migration
> `20260803120000_drop_contractor_dispatch` dropped the three tables from the production DB after
> they were verified empty. **Spec decision 1 — "a task is a `ContractorJob` assigned to a
> `Contractor`" — has no referent in this codebase.**
>
> **How the error happened, so it doesn't repeat.** §0 and the "⚠ Verified against the repo" claims
> below were verified against branch `claude/rise8-operations-platform-rv9B6`, which was already 7
> days behind this decision. A branch was checked and called "the repo". **Diff against
> `origin/main` before designing anything** — a stale branch reads as a healthy codebase.
>
> An 8-task implementation plan was written from this spec and discarded unexecuted. No code, no
> schema change and no migration ever existed.
>
> **Standing decision:** contractor scheduling is **out of scope for this repository**. ADR-028's own
> stated context is that the maintenance/dispatch capability is being built as a separate system
> outside this repo, which is the reason the rail was removed. Track D is archived; `TODO.md` records
> that whether it ever returns is undecided and that it is "the expensive one to bring back".
> Reviving this design means reverting `94ce338`, re-applying the dropped schema to production, and
> an ADR amending ADR-028 — not simply picking this document back up.
>
> **Also note:** the ADR number this design proposed (ADR-027) is taken, as are 028 and 029. The next
> free number is ADR-030.

---

**Date:** 2026-08-10
**Tracker:** Track D → D6 (was §SPEC-5) + new D9 — **all three archived, see `docs/archive/tracks-cde/`**
**Status:** ⛔ **SUPERSEDED — never built.** Scope and data model were approved by Kyle 2026-08-10 and the §8 UI decisions were closed the same day; the whole design then proved to be built on deleted tables. Retained as reference only.

---

## 0. Why this exists, and a scope warning

Track D was **parked 2026-07-30** (Twilio/A2P consent work halted; active scope narrowed to Track A + B). Kyle reopened this one slice on 2026-08-10 to design a contractor schedule and a daily dashboard. **This design reopens D6 only** — the parked Twilio/consent rail (D7, D8) stays parked and stays unmerged on the branch.

Contractor scheduling lives in Smartsheet today. This build does **not** replace it. The calendar runs **in parallel as a test**; mirroring the Smartsheet process is a later phase and an explicit non-goal here.

---

## 1. Decisions made (Kyle, 2026-08-10)

| # | Question | Decision |
|---|---|---|
| 1 | What is scheduled, and who is a task assigned to? | **Contractors only.** A "task" is a `ContractorJob` with a scheduled date, assigned to a `Contractor`. No new task entity — so no overlap with the never-built Quick Tasks module (ADR-012) and no third task model. |
| 2 | How far does MS Calendar integration go? | **In-app only. Zero Microsoft dependency.** A signed ICS subscription feed is a possible later follow-on. Two-way Graph sync is rejected for now. |
| 3 | Date, or date and time? | **ET calendar date only.** No start time, no duration. |
| 4 | Who can write comments? | **Staff/admin users + automation.** Contractors cannot write. An automation currently being built in another project will post comments here later. |
| 5 | What is the "daily dashboard update"? | **Both halves:** an auto-generated rollup of the day's contractor activity, plus an append-only written daily entry. |

### 1.1 Consequences worth stating plainly

- **Date-only makes the day and week views lists, not hour grids.** Day view is one list; week/work-week are 7/5 columns of lists; month is a day grid with job chips. This tradeoff was named before the decision and accepted. Nothing in the UI should imply a time.
- **"Assign to users" resolves to assigning a Contractor**, not a staff `User`. That is what decision 1 means. If staff assignment is wanted later it is a different entity.
- **Contractors have no accounts and no company mailboxes** (magic links only, ADR-012). Any future Outlook sync would surface the schedule in *Gerardo's and Jesús's* Outlook, never in a contractor's. This is why decision 2 was cheap to make.

### 1.2 §Q16 is now an explicit assumption, not an answered question

§Q16 asks whether contractor scheduling is separable from the internal daily maintenance schedule (in Connecteam, which Track A replaces). Choosing a **contractor-only** calendar *assumes* separable. That assumption is now load-bearing and recorded here rather than resolved. If it turns out entangled, D6 must either coexist with Connecteam through the parallel run or absorb internal scheduling — a different data model either way.

---

## 2. Scope

### In

1. **`/contractors/schedule`** — day / week / work-week / month views over `ContractorJob`, keyed on ET calendar date. Create a job from a day cell, reschedule an existing job, append comments.
2. **`/contractors/daily`** — auto rollup of the day's contractor activity + an append-only written daily entry.

Both property-scoped, manager-and-above, mirroring `/dispatch` exactly (`requireManager()` + `accessiblePropertyIds` + `resolveScopedPropertyIds`).

### Out — each is something a reader might otherwise assume

| Not building | Why |
|---|---|
| MS Graph / Outlook two-way sync | No Graph client exists. `lib/network/teams-graph.server.ts` is a scaffold that sends nothing; `MS_GRAPH_*` env vars are read but unset. Needs an Azure app registration + tenant admin consent. Separate project on the scale of the NETWORK epic. |
| ICS subscription feed | Deferred. Cheap to add later; no Azure app needed. Caveat when it happens: read-only in Outlook, and Outlook refreshes ICS subscriptions on its own slow schedule (often hours). |
| Smartsheet mirroring or sync | Smartsheet stays the live schedule. Also consistent with the standing no-Smartsheet-write-through decision. |
| Auto-reschedule when an emergency bumps a job | D6's original second half. Still gated on §Q16 (§1.2). |
| Contractor commenting via `/j/[token]` | Would add a write path behind a **reusable** 72h token (D4 made it reusable on purpose). Needs a single-use write token + rate limiting first. |
| Automation ingest endpoint | The seam is modeled now (`source = SYSTEM`, `authorLabel`); the endpoint is built when the other project is ready. |
| Times on jobs | Decision 3. |
| Drag-and-drop rescheduling | No calendar library is installed and none is being added. Reschedule through the job. |
| Editing or deleting comments | Append-only is the requirement. Enforced by schema shape (§3). |

---

## 3. Data model

### 3.1 `ContractorJob` — one additive column

```prisma
scheduledFor  DateTime?  @db.Date   // ET calendar day; null = unscheduled backlog

@@index([scheduledFor, propertyId])
```

**Nullable is load-bearing.** Every existing job in prod has no date, and the unscheduled backlog must stay visible on the calendar rather than vanish. Additive-only, so it is safe to apply to the live prod DB ahead of the code (the established order in this repo).

Precedent followed: `ChecklistInstance.scheduledFor DateTime @db.Date` and `RecurringRule.effectiveFrom/effectiveTo @db.Date` — date-only columns for calendar days, never timestamptz.

### 3.2 `ContractorJobNote` — new, append-only

```prisma
model ContractorJobNote {
  id            String   @id @default(uuid()) @db.Uuid
  jobId         String   @db.Uuid
  source        ContractorNoteSource
  authorUserId  String?  @db.Uuid
  authorLabel   String?
  body          String
  createdAt     DateTime @default(now()) @db.Timestamptz

  job    ContractorJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  author User?         @relation(fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([jobId])
  @@map("contractor_job_notes")
}

enum ContractorNoteSource {
  STAFF
  SYSTEM
}
```

**Deliberately has no `updatedAt` and no soft-delete field.** "Never overwritten" is therefore a property of the schema, not of developer discipline — there is no column to write an edit into. Mirrors the existing `TicketNote` pattern; `ConsentRecord` is the same idea taken further.

`authorUserId` is nullable **and** `SetNull`: a comment must survive its author's account being removed. `authorLabel` carries the display name for `SYSTEM` rows (e.g. `"Dispatch automation"`) and is the fallback when an author has been nulled.

New enum rather than reusing `TicketNoteSource { TEAMS_REPLY, MANUAL }` — different domain, different values, and the ticket enum's values would be misleading here.

### 3.3 `ContractorDailyNote` — new, append-only

```prisma
model ContractorDailyNote {
  id            String   @id @default(uuid()) @db.Uuid
  propertyId    String?  @db.Uuid   // null = portfolio-wide entry
  forDate       DateTime @db.Date   // the ET day the entry is about
  source        ContractorNoteSource
  authorUserId  String?  @db.Uuid
  authorLabel   String?
  body          String
  createdAt     DateTime @default(now()) @db.Timestamptz

  property Property? @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  author   User?     @relation(fields: [authorUserId], references: [id], onDelete: SetNull)

  @@index([forDate, propertyId])
  @@map("contractor_daily_notes")
}
```

**No unique constraint on `(propertyId, forDate)`.** Append-only means several entries for one day is correct behaviour, not a conflict to resolve.

`propertyId` is nullable so a dispatcher covering the portfolio can write one entry instead of eight. A null-property entry renders on every property view.

### 3.4 Two proposals inside this, flagged for a second look

1. **Status and assignment changes auto-append a `SYSTEM` note.** This duplicates `audit_log` on purpose — `audit_log` is not user-facing, and without this the thread reads as a chat rather than a history. Cheap to cut if the thread should stay human-only.
2. **`ContractorJob.completionNote` stays as-is.** It is required by the existing action on `COMPLETED`/`CANCELLED` and enforced there. Leave the column alone and have the transition *also* land in the thread, rather than migrate a live column.

---

## 4. Routes and navigation

- `/contractors` — existing directory, unchanged.
- `/contractors/schedule` — the calendar.
- `/contractors/daily` — the daily dashboard.

No route collision: `app/contractors/` has no `[id]` segment today (editing happens inside `ContractorsClient`).

**Nav stays one item.** `lib/nav.ts` keeps the single `{ href: "/contractors", label: "Contractors" }` entry in `MAIN_MANAGER`; the three pages get a sub-nav component following the existing `ReportsNav` pattern. `isNavItemActive` already does prefix matching, so the sidebar item stays highlighted on children with no change to `lib/nav.ts`.

---

## 5. Date math

All grid and range math goes in a **pure, unit-tested `lib/contractor-schedule.ts`**, matching the repo convention that date logic lives in a tested `lib/` module (`lib/recurrence.ts` is the precedent).

- `CalendarView = "day" | "week" | "workweek" | "month"`
- A grid builder returning ET day cells (`ymd` + in-current-month flag)
- A range-bounds helper returning `{ startYMD, endExclusiveYMD }` for the DB query

Built **only** on `lib/datetime.ts` helpers — `etDayStartUtc`, `nextYMD`, `etYYYYMMDD`, `etDateOnly`. No raw `Date` arithmetic, per ADR-013 and the existing ESLint rule against direct `toLocaleString`.

**Work week = Mon–Fri.** Week = Sun–Sat, matching Outlook's default and the existing `Wk of` label convention in ADR-009.

**View state lives in the URL** (`?view=week&date=20260810`), server-rendered, mirroring how `/dispatch` and `/reports` already handle filters via `searchParams`. No client-side date state, so a view is shareable and a reload is stable.

---

## 6. Behaviour rules

- **Terminal jobs stay immutable.** `COMPLETED`/`CANCELLED` jobs cannot be rescheduled — same rule the existing dispatch actions enforce.
- **Rescheduling is an audited action** (`rescheduleJob`), setting or clearing `scheduledFor`, and re-checks `canAccessProperty` server-side rather than trusting the UI. This mirrors how `assignContractor` re-validates eligibility.
- **Creating from a day cell reuses `/dispatch/new`** with `scheduledFor` prefilled, rather than adding a second create path. Costs a page hop; avoids two divergent validation paths over one model.
- **Appending a note re-checks property scope** against the job's property before writing.
- **Overdue** = `scheduledFor` before today (ET) and status not terminal.

---

## 7. Testing

Follows the repo convention — pure `lib/` unit tests (Vitest) plus clean typecheck/lint/build. No new test framework.

- `lib/contractor-schedule.test.ts` — grid construction per view, range bounds, month edges, work-week boundaries, and **DST transition days** (the ET-anchored helpers are exactly where this breaks silently).
- Note-author resolution: `STAFF` with a live author, `STAFF` with a nulled author falling back to `authorLabel`, `SYSTEM` rows.

---

## 8. UI decisions — CLOSED 2026-08-10 (Kyle)

Sections 1–3 (scope + data model) were approved when this was written. Sections 4–7 were proposals; they are now confirmed as written, and the four open items below are decided. **§8 no longer blocks a plan.**

| # | Question | Decision |
|---|---|---|
| 6 | Daily dashboard tiles | **All 5 as proposed** — Scheduled today · Unscheduled backlog · Urgent open · Overdue · Completed today. Table columns: Property · Room · Trade · Contractor · Status · Latest comment. Per-property split was offered and **not** taken — it can follow later if Kate wants the `/network` treatment here too. |
| 7 | Auto-append `SYSTEM` note on status/assignment change (§3.4.1) | **Yes.** The thread is a history, not a chat. Accepts the deliberate `audit_log` duplication for the stated reason: `audit_log` is not user-facing. |
| 8 | Unscheduled backlog placement | **Persistent side rail on the calendar**, visible in every view — so undated jobs stay in sight. This is the payoff of `scheduledFor` being nullable (§3.1). |
| 9 | Default view | **Work week (Mon–Fri).** `?view=workweek` is the default when no `view` param is present. |

### 8.1 Empty states — my call, not asked

Following the honest-empty-state precedent set by the network dashboard (an empty grid must never read as an all-clear):

- **Calendar, no jobs in range** — "No contractor jobs scheduled for this week" + a create affordance. Never a bare grid.
- **Backlog rail, empty** — "No unscheduled jobs" stated positively; this one *is* good news.
- **Daily, no activity** — "No contractor activity recorded for {date}" and the tiles render `0`, not blank. The written-entry composer stays available regardless, since a day with no jobs can still warrant a note.

---

## 9. Migration note

Three schema changes, all additive: one nullable column on `contractor_jobs`, two new tables, one new enum. No drops, no type changes on existing columns. Safe to apply to the prod DB before deploying code, which is the required order in this repo.

⚠ **Branch reality:** `claude/rise8-operations-platform-rv9B6` is 20 ahead / 1 behind `origin/main` and holds the unmerged consent rail plus migration `20260730120000_add_invites_and_consent`, which is **not on prod**. Any migration authored for this work must not be stacked on top of that one, or applying it to prod would drag the parked consent schema along with it. Author it offline via `prisma migrate diff` from `origin/main`'s schema state — the established workaround in this repo for exactly this drift.
