# Contractor Scheduling + Daily Dashboard — Design (from scratch)

**Date:** 2026-08-11
**Decided by:** Kyle
**Status:** Scope, data model and placement approved. Not built.
**Replaces:** nothing. **This is a new feature.**

> **This document is written from scratch and deliberately inherits nothing from
> `docs/archive/tracks-cde/superpowers/2026-08-10-contractor-schedule-and-daily-design.md`**, which is
> archived, superseded and off-limits as a source (Kyle's instruction). That design assumed
> `Contractor` and `ContractorJob` already existed; they do not. Do not open it, port from it, or
> reconcile against it.

---

## 1. Why this exists

Kyle is building a contractor-update system **outside this repo**. This feature is its companion
inside the Stayable Operations platform: a place to put contractor work on a calendar, see the day's
contractor activity, and keep a written log.

**This reverses ADR-028 for Track D only, and only for scheduling.** ADR-028 (2026-08-03) narrowed the
platform to Checklist + Network and deleted the contractor/dispatch rail; its amendment brought
Maintenance and Construction back as nav stubs but left contractor work explicitly undecided. It is
now decided: contractor **scheduling** returns. **Dispatch does not** — see §2.

**ADR-030 must record this.** ADR-027, 028 and 029 are taken.

---

## 2. Scope

### In

1. **Contractor directory** — the minimum needed to have someone to schedule: who they are, what
   trades, which properties, how to reach them.
2. **Scheduled contractor jobs** — property, where, trade, what's wrong, urgency, status, assigned
   contractor, and an **ET calendar date**.
3. **Schedule (calendar)** — day / week / work-week / month, with a persistent unscheduled-backlog rail.
4. **Daily dashboard** — a five-tile rollup of the day plus an append-only written log.
5. **Append-only note threads** on jobs and on days.

### Out, and why — each is something a reader might otherwise assume

| Not building | Why |
|---|---|
| **Any messaging: WhatsApp, SMS, `wa.me` links, Twilio** | This is a calendar, not a dispatch rail. Messaging is what ADR-028 removed and what Kyle's separate project handles. No `NotificationChannel` change, no consent surface, nothing that sends. |
| **Signed no-account contractor links (`/j/[token]`)** | Contractors do not open this app. It is an internal planning surface. No public route, no HMAC helper, no token table. |
| **Contractor logins** | Same reason. Contractors are records, not users. |
| **Photos on jobs** | Scheduling does not need them, and `Photo` returned to exactly-one-of(response, issue) under ADR-016 when the rail was dropped. Not reopening that constraint for a calendar. |
| **Match/rank/eligibility scoring** | That existed to pick who to dispatch to. With no dispatch, a filtered picker is enough. |
| **Sync with Kyle's contractor project** | This repo **owns** its records (Kyle, 2026-08-11). Self-contained and buildable today; a later import can populate it. Two lists to keep in step is the accepted cost. |
| **Times of day, durations, drag-and-drop** | §3 decision. No calendar library is added. |
| **MS Graph / Outlook / ICS** | Zero Microsoft dependency. No Graph client exists in this repo (`lib/network/teams-graph.server.ts` is a scaffold that sends nothing); the only working Teams path is a send-only webhook. |
| **Editing or deleting notes** | Append-only, enforced by schema shape (§4.4). |
| **Recurring contractor jobs** | Track A already owns a recurrence engine. Coupling a second scheduler to it needs its own design pass. |

---

## 3. Decisions (Kyle)

Carried forward from the 2026-08-10 conversation — these are **Kyle's calls, made directly, not
artifacts of the archived document**:

| # | Decision |
|---|---|
| 1 | **ET calendar date only. No times, no durations.** Consequence, stated and accepted: day and week views are **lists, not hour grids**. Nothing in the UI may imply a time. |
| 2 | **In-app only. Zero Microsoft dependency.** |
| 3 | **Note authors are staff/admin users and automation** (`source = SYSTEM`). Contractors never write. The automation endpoint is **not built** — the seam is modeled (`source`, `authorLabel`) so Kyle's project can post later. |
| 4 | **Daily dashboard is both halves:** an auto rollup **and** an append-only written entry. |
| 5 | **Five tiles:** scheduled today · unscheduled backlog · urgent open · overdue · completed today. Table columns: property · room · trade · contractor · status · latest note. |
| 6 | **Status and assignment changes auto-append a `SYSTEM` note**, so the thread reads as a history rather than a chat. Accepts deliberate overlap with `audit_log`, which is not user-facing. |
| 7 | **Unscheduled backlog is a persistent side rail** on the calendar, visible in every view. |
| 8 | **Default view is work week (Mon–Fri).** Week = Sun–Sat. |
| 9 | **This repo owns contractor and job records.** |

---

## 4. Data model — all new

Nothing here extends an existing table. `Contractor`, `ContractorProperty`, `ContractorJob`, `Trade`
and `JobStatus` were **dropped from schema and from the production database** on 2026-08-03
(`20260803120000_drop_contractor_dispatch`). The names `Contractor` and `Trade` are reused because
they are the correct domain nouns and are now free — **but these are new, narrower models designed
for scheduling, not a revert of `94ce338`.** The migration and ADR-030 must say so explicitly, or a
future reader diffing drop-against-create will conclude the removal was undone.

### 4.1 Enums

```prisma
enum Trade { PLUMBING ELECTRICAL HVAC ROOFING PEST LANDSCAPING PRESSURE_WASHING GENERAL }
enum ContractorJobStatus { PLANNED IN_PROGRESS DONE CANCELLED }
enum ContractorNoteSource { STAFF SYSTEM }
```

`ContractorJobStatus` is named in full rather than reusing the dropped `JobStatus`, and its values
describe a **planning** lifecycle. There is deliberately no `DISPATCHED` — nothing dispatches.

### 4.2 `Contractor`

`id` · `name` · `company?` · `trades Trade[]` · `phone?` · `whatsapp?` · `active` (default `true`) ·
`notes?` · timestamps · `properties ContractorProperty[]` · `jobs ContractorJob[]`

Deliberately **absent**, and each was in the deleted rail: `contracted` and `onCall` (dispatch-ranking
inputs — nothing ranks), and `userId` linking a contractor to a staff `User` (existed so one person
could be both; without dispatch it buys nothing). `whatsapp` is stored as **contact information only** —
no code may send to it.

Validation: at least one trade, at least one property, and at least one of `phone`/`whatsapp`.

### 4.3 `ContractorJob`

`id` · `propertyId` · `roomLabel?` (free text) · `trade` · `description` · `urgent` (default `false`) ·
`status` (default `PLANNED`) · `contractorId?` · **`scheduledFor DateTime? @db.Date`** ·
`createdByUserId` · **`completedAt DateTime? @db.Timestamptz`** · `closeNote?` · timestamps ·
`notes ContractorJobNote[]`

- **`scheduledFor` is nullable and that is load-bearing:** null means unscheduled backlog, which is a
  real state the rail exists to surface, not missing data.
- **`roomLabel` is free text, not a `Room` FK.** Rooms are only seeded for Lakeland (no PMS in v1) and
  a schedule entry needs "Rm 212" / "lobby" / "roof". Consistent with S1's free-text-room direction.
- **`completedAt` is a real column.** Deriving "completed today" from `updatedAt` would only be
  correct while terminal rows stay immutable — a property no schema enforces. One nullable timestamp
  removes the whole argument.
- Indexes: `[propertyId, scheduledFor]`, `[scheduledFor]`, `[contractorId]`, `[status]`, `[urgent, status]`.

### 4.4 `ContractorJobNote` and `ContractorDailyNote` — append-only

Both: `id` · `source` · `authorUserId?` · `authorLabel?` · `body` · `createdAt`.
`ContractorJobNote` adds `jobId` (`onDelete: Cascade`). `ContractorDailyNote` adds `propertyId?`
(`onDelete: Cascade`) and `forDate DateTime @db.Date`.

- **Neither has `updatedAt` and neither has a soft-delete column.** "Never overwritten" is therefore a
  property of the schema — there is no column an edit could be written into. Follows the existing
  `TicketNote` pattern. No update or delete action may be written for these tables.
- `authorUserId` is nullable **and** `SetNull`: a note must survive its author's account being deleted.
  `authorLabel` carries the display name for `SYSTEM` rows and is the durable fallback once an author
  is nulled — so attribution never becomes blank.
- **`ContractorDailyNote` has no unique constraint on `(propertyId, forDate)`.** Several entries for one
  day is correct for an append-only log, not a conflict.
- `propertyId` nullable = portfolio-wide entry, rendered on every property's view. Only
  `isPortfolioRole` users may write one.

---

## 5. Placement and navigation

Lives under the **existing `Maintenance` section**, which ships today as `unbuilt: true` with a stub
page. It flips to a real section with three children:

| Route | Purpose |
|---|---|
| `/maintenance/schedule` | Calendar. The section's primary surface. |
| `/maintenance/daily` | Daily rollup + written log. |
| `/maintenance/contractors` | Directory. |
| `/maintenance/jobs/new`, `/maintenance/jobs/[id]` | Job create and detail. Not nav children. |
| `/maintenance` | **Redirects to `/maintenance/schedule`.** The `UnbuiltSection` stub is removed. |

**Why Maintenance rather than a new top-level section.** `lib/nav.ts` states the mobile bar is kept at
five items so it never scrolls: ADMIN currently sees six sections, less Admin on mobile, giving exactly
five. A seventh section would make six and break that. Contractors doing maintenance work also belongs
under Maintenance on the merits. When Track C ticketing lands it adds siblings here.

`lib/nav.ts` needs `MAINTENANCE` changed from a leaf stub to a parent with children; `isNavItemActive`
and `sectionForPathname` already handle children by prefix and need no change. `UnbuiltSection` stays
in use by Construction.

Access: **manager and above** on every route (`requireManager()`), property-scoped through
`accessiblePropertyIds` + `resolveScopedPropertyIds`, exactly as the Checklist surfaces do. Writes
re-check `canAccessProperty` server-side.

---

## 6. Behaviour rules

- **Terminal jobs (`DONE`, `CANCELLED`) are immutable** — no reschedule, no reassign, no status change.
- **`DONE` and `CANCELLED` require a `closeNote`**, and `DONE` stamps `completedAt`.
- **Reschedule is an audited action** that sets or clears `scheduledFor` and appends a `SYSTEM` note.
- **Notes remain writable on a terminal job.** Recording what happened after the fact is what an
  append-only history is for; only the job's own fields freeze.
- **Overdue** = `scheduledFor` earlier than today (ET) **and** status not terminal. Unscheduled is
  never overdue.
- **Assigning a contractor validates server-side** that the contractor is active, covers the property,
  and holds the trade — the action does not trust the picker.
- **Creating from a day cell** links to `/maintenance/jobs/new?scheduledFor=…` with the date prefilled;
  one create path, one set of validation.

---

## 7. Date handling

All calendar math goes in a **pure, unit-tested `lib/contractor-schedule.ts`**, built only on
`lib/datetime.ts` helpers. `lib/recurrence.ts` is the precedent for date logic living in a tested
pure module.

⚠ **A real footgun in the existing helpers:** `etYYYYMMDD()` returns **compact** `"20260811"`, while
`etDayStartUtc()` and `nextYMD()` consume **dashed** `"2026-08-11"`. Mixing them shifts dates silently.
The new module works in **dashed form internally** and normalises once at the URL boundary.

⚠ **`@db.Date` and `@db.Timestamptz` are queried differently.** `scheduledFor` and `forDate` are dates →
compare against **UTC-midnight** `Date`s. `completedAt` and `createdAt` are timestamps → bound with
**`etDayStartUtc(ymd)`**, or the 4–5 hour ET offset buckets boundary rows into the neighbouring day.

**View state lives in the URL** (`?view=workweek&date=20260811`), server-rendered, mirroring
`/dispatch`-era filters and `/reports`. No client date state, so a view is shareable and a reload is stable.

---

## 8. Testing

Repo convention: pure `lib/` unit tests in Vitest, plus clean typecheck / lint / build. No new framework.

- `lib/contractor-schedule.test.ts` — grid per view, range bounds, anchor stepping, month edges, leap
  day, and **both 2026 ET DST transition days** (8 Mar, 1 Nov) — where ET-anchored date code fails silently.
- `lib/contractors.test.ts` — trade/status labels, job sort order, Zod schemas incl. the
  contractor-validation rules, `isOverdue`, and note-author resolution across live author / nulled
  author / `SYSTEM` / unlabelled `SYSTEM`.

---

## 9. Migration note

**One additive migration**: three enums and five tables. No `DROP`, no change to any existing column,
and **`Photo` is not touched** — ADR-016's exactly-one-of(response, issue) stays as ADR-028 left it.

Safe to apply to prod **before** deploying code, which is this repo's required order for additive
changes. (The 2026-08-03 drop inverted that order precisely because it was a drop.)

Author it against `main` — this branch is cut from `origin/main` at `610119b` with no intervening
migrations, so `prisma migrate dev` is unnecessary and `migrate diff` from the committed schema is exact.
⚠ The **dev DB `ep-falling-moon` was unreachable on 2026-08-03** (P1001, branch appears suspended). If it
still is, generate the migration by diffing two schema *datamodels*, which needs no database — the
technique used for the drop migration.

---

## 10. Open, and honest about it

- **Two contractor lists.** This repo owning records means Kyle's separate project and this one can
  drift. Accepted 2026-08-11 as the price of building now. If the two must agree later, the import
  direction should be into this repo, since it holds the schedule.
- **No automation ingest endpoint.** `source = SYSTEM` and `authorLabel` exist so Kyle's project can
  post notes, but nothing receives them yet. Adding it is auth + rate-limit work, not schema work.
- **A10 contractor checklists stay dropped.** §Q31 recommended removing them from v1 when the magic-link
  helper was deleted. Nothing here revives that; this feature issues no contractor-facing links.
