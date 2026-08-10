# Contractor Scheduling + Daily Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contractor scheduling feature under the Maintenance section — a contractor directory, date-scheduled jobs, a day/week/work-week/month calendar with an unscheduled-backlog rail, and a daily dashboard with a five-tile rollup plus an append-only written log.

**Architecture:** All new schema (3 enums, 5 tables) in one additive migration. Calendar math isolated in a pure unit-tested `lib/contractor-schedule.ts`; labels, Zod schemas, sorting and note-author resolution in a pure unit-tested `lib/contractors.ts`. Every page is a server component reading view state from `searchParams`; every mutation is a server action that re-checks property scope and writes `audit_log`. The existing `Maintenance` nav stub flips to a real section with three children.

**Tech Stack:** Next.js 15 App Router · TypeScript strict · Prisma · Postgres (Neon) · Tailwind + shadcn · Vitest · `date-fns-tz` via `lib/datetime.ts`. **No calendar library is added.**

**Source spec:** `docs/superpowers/specs/2026-08-11-contractor-scheduling-design.md`

## Global Constraints

- **This is a NEW feature, not a revival.** `docs/archive/tracks-cde/superpowers/2026-08-10-contractor-schedule-and-daily-design.md` is superseded and **off-limits** — do not open it, read it, or port anything from it. Kyle's explicit instruction.
- **Nothing sends anything.** No WhatsApp, SMS, Twilio, `wa.me`, email, or Teams notification. No `NotificationChannel` change. `Contractor.whatsapp` is contact text only — no code may transmit to it. Building a send path is out of scope and would contradict ADR-028.
- **No contractor-facing surface.** No public route, no signed/magic link, no token table, no contractor login. Contractors are records, not users.
- **`Photo` must not be touched.** It stays exactly-one-of(response, issue) per ADR-016. Jobs have no photos.
- **ET calendar date only. No times, no durations.** Day and week views are lists, never hour grids. No UI element may imply a time of day.
- **Append-only notes.** `ContractorJobNote` and `ContractorDailyNote` get **no `updatedAt` and no soft-delete column**. Never write an update or delete action for them, and never render an edit/delete affordance.
- **Access control on every route and action:** `requireManager()` for reads, plus `accessiblePropertyIds(user)` → `resolveScopedPropertyIds(accessible, activeId)` for scoping. Writes re-check `canAccessProperty(actor, propertyId)` server-side — never trust the client. Portfolio-wide daily entries require `isPortfolioRole`.
- **All datetime display goes through `lib/datetime.ts`.** Never call `toLocaleString`/`toLocaleDateString` — an ESLint rule forbids it (ADR-013). `formatInET` already appends the `ET` suffix.
- **`@db.Date` vs `@db.Timestamptz`:** `scheduledFor`/`forDate` are dates → compare against **UTC-midnight** `Date`s. `completedAt`/`createdAt` are timestamps → bound with **`etDayStartUtc(ymd)`**. Wrong choice shifts results by the ET offset.
- **⚠ ymd format mismatch in existing helpers:** `etYYYYMMDD()` returns **compact** `"20260811"`; `etDayStartUtc()` and `nextYMD()` consume **dashed** `"2026-08-11"`. Work in **dashed** internally; normalise only at the URL boundary. Never pass compact to `etDayStartUtc`/`nextYMD`.
- **Week = Sunday–Saturday. Work week = Monday–Friday. Default view = `workweek`.**
- **Terminal jobs (`DONE`, `CANCELLED`) are immutable** — no reschedule, reassign, or status change. `DONE`/`CANCELLED` require a `closeNote`; `DONE` stamps `completedAt`.
- **Notes stay writable on terminal jobs.** Only the job's own fields freeze.
- **Empty states must never read as an all-clear.** State what is absent explicitly.
- **Commits:** Conventional Commits, subject under 72 chars, body explains *why*.
- **Verification gate per task:** `pnpm test` all pass · `pnpm typecheck` clean · `pnpm lint` clean. Tasks touching schema also run `pnpm prisma generate`; tasks adding routes also run `pnpm build`.
- **Branch:** work on `feat/contractor-scheduling-v2`, cut from `main` at `610119b`. Do **not** commit to `main`.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | 3 enums + `Contractor`, `ContractorProperty`, `ContractorJob`, `ContractorJobNote`, `ContractorDailyNote`; back-relations on `User` + `Property`. |
| `prisma/migrations/20260811120000_add_contractor_scheduling/migration.sql` (create) | The one additive migration. |
| `lib/contractor-schedule.ts` + `.test.ts` | **Pure** calendar math: view parsing, dashed-ymd arithmetic, grid cells, range bounds, anchor stepping, overdue. No DB, no React. |
| `lib/contractors.ts` + `.test.ts` | **Pure** trade/status labels + order, job sort, Zod schemas, note-author resolution. No DB, no React. |
| `app/maintenance/page.tsx` (replace) | Redirect to `/maintenance/schedule`. Delete the `UnbuiltSection` stub. |
| `app/maintenance/MaintenanceNav.tsx` (create) | Sub-nav tabs: Schedule · Daily · Contractors. |
| `app/maintenance/contractors/page.tsx` + `ContractorsClient.tsx` + `actions.ts` (create) | Directory list + create/edit/archive. |
| `app/maintenance/jobs/actions.ts` (create) | `createJob`, `updateJobStatus`, `assignContractor`, `rescheduleJob`, `appendJobNote`. |
| `app/maintenance/jobs/new/page.tsx` + `NewJobForm.tsx` (create) | Create a job, honouring `?scheduledFor=`. |
| `app/maintenance/jobs/[id]/page.tsx` + `JobControls.tsx` + `JobThread.tsx` (create) | Job detail: status/assign/reschedule + append-only thread. |
| `app/maintenance/schedule/page.tsx` + `ScheduleToolbar.tsx` + `CalendarGrid.tsx` + `BacklogRail.tsx` (create) | The calendar. |
| `app/maintenance/daily/page.tsx` + `DailyNoteComposer.tsx` + `actions.ts` (create) | Five tiles, activity table, written log. |
| `lib/nav.ts` (modify) | `MAINTENANCE` from `unbuilt` leaf → parent with three children. |
| `lib/nav.test.ts` (modify) | Update the Maintenance expectations. |
| `docs/DECISIONS.md`, `TODO.md`, `CLAUDE.md` (modify) | ADR-030 + tracker + status. |

---

## Task 1: Schema + additive migration

**Files:** Modify `prisma/schema.prisma` · Create `prisma/migrations/20260811120000_add_contractor_scheduling/migration.sql`

**Interfaces produced:** Prisma types `Contractor`, `ContractorProperty`, `ContractorJob`, `ContractorJobNote`, `ContractorDailyNote`, and enums `Trade` (`PLUMBING ELECTRICAL HVAC ROOFING PEST LANDSCAPING PRESSURE_WASHING GENERAL`), `ContractorJobStatus` (`PLANNED IN_PROGRESS DONE CANCELLED`), `ContractorNoteSource` (`STAFF SYSTEM`).

**Context you need:** `Contractor`/`ContractorJob`/`Trade`/`JobStatus` were dropped from schema **and from prod** on 2026-08-03 by `20260803120000_drop_contractor_dispatch`. You are **creating new, narrower models that happen to reuse two names**, not reverting that. Say so in the migration header comment, or a future reader diffing drop-against-create will conclude the removal was undone.

- [ ] **Step 1: Add the three enums** near the other enums in `prisma/schema.prisma`, each with a comment explaining it is new (not the dropped `JobStatus`) and that `ContractorJobStatus` has no `DISPATCHED` because nothing dispatches.

- [ ] **Step 2: Add the five models.** Exact field sets from spec §4.2–4.4. Required specifics:
  - `Contractor`: `id` uuid pk · `name` · `company String?` · `trades Trade[]` · `phone String?` · `whatsapp String?` · `active Boolean @default(true)` · `notes String?` · `createdAt`/`updatedAt` timestamptz · relations `properties ContractorProperty[]`, `jobs ContractorJob[]`. Comment that `whatsapp` is contact text only and nothing sends to it.
  - `ContractorProperty`: `contractorId` + `propertyId`, `@@id([contractorId, propertyId])`, both `onDelete: Cascade`.
  - `ContractorJob`: `id` · `propertyId` · `roomLabel String?` (comment: free text, not a Room FK — rooms are only seeded for Lakeland) · `trade Trade` · `description String` · `urgent Boolean @default(false)` · `status ContractorJobStatus @default(PLANNED)` · `contractorId String?` · `scheduledFor DateTime? @db.Date` (comment: **nullable is load-bearing — null is the unscheduled backlog, a real state, not missing data**) · `createdByUserId` · `completedAt DateTime? @db.Timestamptz` (comment: a real column so "completed today" never has to be inferred from `updatedAt`) · `closeNote String?` · timestamps · `notes ContractorJobNote[]`. Indexes: `[propertyId, scheduledFor]`, `[scheduledFor]`, `[contractorId]`, `[status]`, `[urgent, status]`.
  - `ContractorJobNote`: `id` · `jobId` (`onDelete: Cascade`) · `source ContractorNoteSource` · `authorUserId String?` (`onDelete: SetNull`, named relation) · `authorLabel String?` · `body String` · `createdAt`. `@@index([jobId])`.
  - `ContractorDailyNote`: `id` · `propertyId String?` (`onDelete: Cascade`) · `forDate DateTime @db.Date` · same `source`/`authorUserId`/`authorLabel`/`body`/`createdAt`. `@@index([forDate, propertyId])`.
  - **Both note models: NO `updatedAt`, NO soft-delete column.** Add the comment explaining append-only is enforced by schema shape — there is no column an edit could be written into.
  - **No unique constraint** on `ContractorDailyNote(propertyId, forDate)` — several entries per day is correct.
  - Use `@map` snake_case for every column and `@@map` for every table, matching the file's convention.

- [ ] **Step 3: Add back-relations.** `User` gets `contractorJobsCreated ContractorJob[]`, `contractorJobNotes ContractorJobNote[]`, `contractorDailyNotes ContractorDailyNote[]` (named relations matching Step 2). `Property` gets `contractors ContractorProperty[]`, `contractorJobs ContractorJob[]`, `contractorDailyNotes ContractorDailyNote[]`. Prisma fails validation without both sides.

- [ ] **Step 4: Validate + generate.** Run `pnpm prisma validate && pnpm prisma generate`. Expected: schema valid, client generated. A missing-opposite-relation error means Step 3 is incomplete.

- [ ] **Step 5: Author the migration.** The dev DB `ep-falling-moon` may be unreachable (P1001, suspended as of 2026-08-03), so generate without a database by diffing datamodels:
```bash
git show HEAD:prisma/schema.prisma > /tmp/base-schema.prisma
mkdir -p prisma/migrations/20260811120000_add_contractor_scheduling
pnpm prisma migrate diff --from-schema-datamodel /tmp/base-schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/20260811120000_add_contractor_scheduling/migration.sql
```
Then prepend a header comment: what this adds, that it is a **new scheduling feature and NOT a revert of `94ce338`**, and that it is additive so it may be applied to prod before the code deploys.

- [ ] **Step 6: Verify the SQL is additive.** Read the file. It must contain only `CREATE TYPE` ×3, `CREATE TABLE` ×5, their indexes, and `ADD CONSTRAINT … FOREIGN KEY`. It must contain **no `DROP`**, **no `ALTER TABLE "photos"`**, and no change to any pre-existing table. If it touches `photos`, stop and report — ADR-016 must not be reopened.

- [ ] **Step 7: Run the suite** (`pnpm test && pnpm typecheck && pnpm lint`) and commit.
```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(contractors): schema for contractor scheduling

New, narrower models for a scheduling feature: Contractor, ContractorProperty,
ContractorJob and two append-only note tables. NOT a revert of 94ce338 — the
dropped rail's dispatch fields (contracted, onCall, userId link, photos) are
deliberately absent because nothing dispatches or messages.

scheduledFor is nullable because null is the unscheduled backlog, a real state.
completedAt is a real column so 'completed today' is never inferred from
updatedAt. Note tables omit updatedAt and any delete column, so append-only is
enforced by schema shape. Photo is untouched (ADR-016)."
```

---

## Task 2: Pure calendar math

**Files:** Create `lib/contractor-schedule.ts` + `lib/contractor-schedule.test.ts`

**Interfaces produced:**
- `type CalendarView = "day" | "week" | "workweek" | "month"`; `CALENDAR_VIEWS`; `VIEW_LABELS: Record<CalendarView,string>`; `DEFAULT_VIEW = "workweek"`
- `parseView(raw: string | undefined): CalendarView`
- `parseDateParam(raw: string | undefined): string` — accepts dashed **or** compact, returns **dashed**, falls back to today (ET)
- `todayYMD(): string` · `toCompact(ymd: string): string` · `ymdOf(date: Date): string`
- `addDaysYMD(ymd, n)` · `weekStartYMD(ymd)` (Sunday) · `monthStartYMD(ymd)`
- `type DayCell = { ymd: string; inCurrentMonth: boolean; isToday: boolean }`
- `buildCells(view, anchorYMD, todayYmd): DayCell[]`
- `rangeBounds(cells): { startDate: Date; endDateInclusive: Date }` — UTC-midnight, for `@db.Date`
- `shiftAnchor(view, ymd, dir: -1 | 1): string`
- `formatViewTitle(view, cells): string`

**Design requirements:**
- Work in **dashed `yyyy-MM-dd`** throughout; the only compact conversion is `parseDateParam` in / `toCompact` out. Document the `etYYYYMMDD`-vs-`etDayStartUtc` mismatch as the reason.
- Arithmetic on **UTC-midnight `Date`s**, which is DST-immune — a calendar day has no time, so UTC is the correct frame for stepping between days.
- `day` → 1 cell. `week` → 7 from the Sunday. `workweek` → 5 from `addDaysYMD(weekStartYMD(anchor), 1)` — one rule that makes a Saturday show that week's Mon–Fri and a Sunday show the following Mon–Fri, matching Outlook. `month` → **always 42 cells** from the Sunday on/before the 1st (fixed height; a variable grid jumps on navigation), with `inCurrentMonth` flagged.
- `rangeBounds` is **inclusive** at both ends — exact on a date column, no `nextYMD` needed.
- `shiftAnchor` steps day-by-1, week/workweek-by-7, and **month by calendar month clamping the day** so 31 Mar → 28 Feb rather than overflowing.
- `parseDateParam` must reject impossible dates (`2026-02-31`) by round-tripping through `ymdOf`, not just regex.

- [ ] **Step 1: Write the failing tests** in `lib/contractor-schedule.test.ts`, anchored on `"2026-08-10"` (a Monday). Required cases: view defaulting + junk rejection · dashed/compact/invalid date parsing · `addDaysYMD` across month, year and leap-day boundaries · `weekStartYMD` from Mon/Sun/Sat · day=1 cell · week=7 cells Sun→Sat · workweek=5 cells Mon→Fri · workweek from a Saturday → that week's Mon–Fri · workweek from a Sunday → following Mon–Fri · month = 42 cells starting `2026-07-26` with 31 in-month · February month = 28 in-month · **spring-forward week of 2026-03-08 has 7 distinct consecutive days** · **fall-back week of 2026-11-01 has 7 distinct consecutive days** · exactly one `isToday` when today is in range and none when it is not · `rangeBounds` returns `2026-08-10T00:00:00.000Z`→`2026-08-14T00:00:00.000Z` for the workweek · `shiftAnchor` per view incl. month clamping `2026-03-31` back to `2026-02-28`.

- [ ] **Step 2: Run and confirm failure.** `pnpm vitest run lib/contractor-schedule.test.ts` — fails to resolve the module.

- [ ] **Step 3: Implement `lib/contractor-schedule.ts`** to the interface and design requirements above. Import only `etYYYYMMDD` from `./datetime`. Top-of-file comment must explain the dashed-internal choice and the UTC-arithmetic/DST reasoning.

- [ ] **Step 4: Run tests — all pass.** Then `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit.** `feat(contractors): pure ET calendar math for scheduling` — body notes DST coverage and why UTC-midnight arithmetic is used for calendar days.

---

## Task 3: Pure labels, schemas, sort, note authors

**Files:** Create `lib/contractors.ts` + `lib/contractors.test.ts`

**Interfaces produced:**
- `TRADE_LABELS: Record<Trade,string>` · `TRADES_ORDERED: Trade[]` · `tradeLabel(t)`
- `JOB_STATUS_LABELS: Record<ContractorJobStatus,string>` · `JOB_STATUS_ORDER` · `jobStatusLabel(s)` · `OPEN_JOB_STATUSES = [PLANNED, IN_PROGRESS]` · `TERMINAL_JOB_STATUSES = [DONE, CANCELLED]` · `isTerminalJobStatus(s)` · `requiresCloseNote(s)`
- `sortJobs<T extends { urgent: boolean; createdAt: Date }>(jobs: T[]): T[]` — urgent first, then oldest first (a scheduler asks "what has been waiting", not "what is newest"); stable, non-mutating
- `isOverdue(scheduledFor: Date | null, isTerminal: boolean, todayYmd: string): boolean`
- `resolveNoteAuthor({ source, authorLabel, author })` → live author name › `authorLabel` › `"System"` for `SYSTEM` › `"Removed user"` for `STAFF`. Never returns empty.
- Caps: `DESCRIPTION_MAX = 2000` · `ROOM_LABEL_MAX = 60` · `CLOSE_NOTE_MAX = 2000` · `NOTE_BODY_MAX = 2000`
- Zod: `contractorSchema` (name required; **≥1 trade**, **≥1 property**, **≥1 of phone/whatsapp** — each with a distinct message) · `createJobSchema` (propertyId uuid, trade, description, optional roomLabel, optional urgent, optional nullable dashed `scheduledFor`) · `updateJobStatusSchema` (status; `closeNote` required when terminal, via `superRefine`) · `assignSchema` (`contractorId` uuid-or-null) · `rescheduleSchema` (dashed-or-null) · `appendJobNoteSchema` (`body`, trimmed, non-empty, ≤ cap) · `appendDailyNoteSchema` (`body`, `propertyId` uuid-or-null, `forDate` dashed)

- [ ] **Step 1: Write the failing tests.** Cover: every trade and status has a label · `sortJobs` puts urgent first then oldest, and does not mutate its input · `isOverdue` true for a past date on a live job, false today / future / unscheduled / terminal · `resolveNoteAuthor` for live author, nulled author falling back to `authorLabel`, `STAFF` with neither → `"Removed user"`, labelled `SYSTEM`, unlabelled `SYSTEM` → `"System"`, and live author preferred over a stale label · `contractorSchema` rejecting zero trades, zero properties, and no-contact-method **each with its own assertion** · `createJobSchema` accepting/omitting `scheduledFor` and rejecting a compact date · `updateJobStatusSchema` requiring `closeNote` for `DONE` and `CANCELLED` but not for `IN_PROGRESS` · note bodies trimmed, empty/whitespace/over-cap rejected.

- [ ] **Step 2: Run and confirm failure.**

- [ ] **Step 3: Implement `lib/contractors.ts`.** Pure — imports only `zod` and enums from `@prisma/client`. Comment `sortJobs`' oldest-first choice and `resolveNoteAuthor`'s precedence (a live author's current name wins so a renamed user reads correctly; `authorLabel` is the durable fallback for `SYSTEM` rows and deleted authors).

- [ ] **Step 4: Tests pass · typecheck · lint.**

- [ ] **Step 5: Commit.** `feat(contractors): labels, schemas, sort and note-author resolution`

---

## Task 4: Contractor directory

**Files:** Create `app/maintenance/contractors/{page.tsx,ContractorsClient.tsx,actions.ts}`

**Consumes:** Task 1 types · Task 3 `contractorSchema`, `TRADES_ORDERED`, `tradeLabel`.
**Produces:** `createContractor`, `updateContractor`, `archiveContractor` actions; a working `/maintenance/contractors`.

**Pattern to follow:** `app/templates/` (server page + client editor + `actions.ts`) and `app/issues/actions.ts` for the action shape. Read those first.

**Requirements:**
- Page: `requireManager()` → `accessiblePropertyIds` → `getCurrentPropertyId` → `resolveScopedPropertyIds`. List contractors having **at least one** `ContractorProperty` in scope. Show name, company, trades, contact, property short codes, active state. Include archived (inactive) rows visually de-emphasised, not hidden — an invisible archive is how duplicates get created.
- Actions: `"use server"`, manager-or-above via `auth()` + `isManagerOrAbove`, Zod-validated, **every mutation writes `audit_log`** (`entityType: "Contractor"`), and a scoped manager may only attach properties they can access — validate **each** submitted `propertyId` with `canAccessProperty`, not just the first.
- `archiveContractor` sets `active = false`. **Never hard-delete** — jobs reference contractors.
- Return shape `{ ok: true; id?: string } | { ok: false; error: string }`.
- Empty state: "No contractors yet. Add one to start scheduling work." with the add affordance.
- `revalidatePath` for `/maintenance/contractors`, `/maintenance/schedule`, `/maintenance/daily`.

- [ ] **Step 1:** Write `actions.ts` with the three actions per the requirements above.
- [ ] **Step 2:** Write `page.tsx` (server, scoped query) and `ContractorsClient.tsx` (list + create/edit form with trade multi-select and property multi-select, inline errors from the action result).
- [ ] **Step 3:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` — all clean, `/maintenance/contractors` in the route list.
- [ ] **Step 4:** Commit. `feat(contractors): contractor directory under Maintenance` — body notes archive-not-delete and per-property scope validation.

---

## Task 5: Job actions + create + detail

**Files:** Create `app/maintenance/jobs/actions.ts` · `app/maintenance/jobs/new/{page.tsx,NewJobForm.tsx}` · `app/maintenance/jobs/[id]/{page.tsx,JobControls.tsx,JobThread.tsx}`

**Consumes:** Task 3 schemas + `isTerminalJobStatus` + `requiresCloseNote` + `resolveNoteAuthor`.
**Produces:** `createJob`, `updateJobStatus`, `assignContractor`, `rescheduleJob`, `appendJobNote`.

**Requirements:**
- A shared private `loadGuarded(jobId)` resolving actor + job + `canAccessProperty`, returning a discriminated result — mirrors the pattern the repo already uses for guarded mutations.
- A private `appendSystemNote(tx, jobId, body)` that writes inside the **same transaction** as the change it describes, so a note can never describe a rolled-back change. Used by status, assign and reschedule.
- `createJob`: Zod, `canAccessProperty`, converts dashed `scheduledFor` → `new Date(ymd + "T00:00:00.000Z")` or null, audit-logs, returns the new id.
- `updateJobStatus`: refuses when already terminal ("This job is already closed."); requires `closeNote` when moving to `DONE`/`CANCELLED`; stamps `completedAt` **only** for `DONE`; appends `Status changed to <label>.`
- `assignContractor`: refuses when terminal; when assigning, re-loads the contractor and **re-validates server-side** that it is `active`, holds the job's `trade`, and covers the job's `propertyId` — the action must not trust the picker. Appends `Assigned to <name>.` or `Contractor unassigned.`
- `rescheduleJob`: refuses when terminal; sets or clears `scheduledFor`; appends `Scheduled for <MMM d, yyyy>.` or `Returned to the unscheduled backlog.`
- `appendJobNote`: allowed on terminal jobs (recording after the fact is the point). Writes `source: STAFF`, `authorUserId`, and snapshots the author's current name into `authorLabel` so attribution survives account deletion.
- Every action `revalidatePath`s `/maintenance/schedule`, `/maintenance/daily`, `/maintenance/jobs/[id]`.
- `new/page.tsx` reads `?scheduledFor=` through `parseDateParam` and prefills a native `type="date"` input (which emits dashed — exactly what the schema expects). Blank = backlog, and the helper text must say so.
- `[id]/page.tsx` shows property/room/trade/description/urgent/status/contractor/**scheduled date**/close note, plus `JobControls` (status, assign from an eligible-contractor list, reschedule/clear) and `JobThread`.
- `JobThread`: composer + notes oldest-first; `SYSTEM` rows visually distinct from staff notes; **no edit or delete affordance**, and copy stating notes cannot be edited or deleted.

- [ ] **Step 1:** Write `actions.ts`.
- [ ] **Step 2:** Write the create route + form.
- [ ] **Step 3:** Write the detail route + `JobControls` + `JobThread`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` clean.
- [ ] **Step 5:** Commit. `feat(contractors): job create, detail and audited mutations` — body notes SYSTEM notes landing in the same transaction and server-side eligibility re-validation.

---

## Task 6: Nav — Maintenance becomes a real section

**Files:** Modify `lib/nav.ts`, `lib/nav.test.ts` · Replace `app/maintenance/page.tsx` · Create `app/maintenance/MaintenanceNav.tsx`

**Requirements:**
- In `lib/nav.ts`, replace the `MAINTENANCE` leaf stub with a parent carrying children in this order: `/maintenance/schedule` "Schedule", `/maintenance/daily` "Daily", `/maintenance/contractors` "Contractors". Remove `unbuilt: true` and remove its `href`. Keep icon `Wrench`. Keep `CONSTRUCTION` untouched — `UnbuiltSection` stays in use there.
- **Do not add a new top-level section.** `lib/nav.ts` documents that the mobile bar is held at five items so it never scrolls; a seventh section would break that. Restate this in the comment.
- `app/maintenance/page.tsx` becomes a `redirect("/maintenance/schedule")` (still `requireManager()` first — an unguarded route is a habit that outlives the stub). Delete the `UnbuiltSection` usage here only.
- `MaintenanceNav.tsx`: client sub-nav mirroring `app/reports/ReportsNav.tsx` exactly (same markup and active-tab classes), tabs Schedule · Daily · Contractors.
- Update `lib/nav.test.ts` wherever it asserts Maintenance is unbuilt / has no children / that `navItemsForRole` counts a specific number of items. **Run the suite and fix every failure** — do not assume only one assertion breaks.

- [ ] **Step 1:** Change `lib/nav.ts`.
- [ ] **Step 2:** Run `pnpm vitest run lib/nav.test.ts`, read each failure, and update the expectations to match the new shape.
- [ ] **Step 3:** Replace the maintenance page with the redirect; add `MaintenanceNav`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` clean.
- [ ] **Step 5:** Commit. `feat(nav): Maintenance becomes a real section with three children` — body explains the five-item mobile-bar constraint.

---

## Task 7: The calendar

**Files:** Create `app/maintenance/schedule/{page.tsx,ScheduleToolbar.tsx,CalendarGrid.tsx,BacklogRail.tsx}`

**Consumes:** Task 2 calendar math · Task 3 labels/sort/`isOverdue` · Task 6 `MaintenanceNav`.
**Produces:** `export type ScheduleJob` from `CalendarGrid.tsx`, imported by `BacklogRail.tsx` and the page.

**Requirements:**
- `page.tsx`: `requireManager()` → scope → `parseView(params.view)` / `parseDateParam(params.date)` → `buildCells` → `rangeBounds`. **Two queries in `Promise.all`**, because the dated range and the backlog answer different questions and the rail must show the whole backlog regardless of what range is on screen:
  1. dated: `propertyId in scope`, `scheduledFor: { gte: startDate, lte: endDateInclusive }`, `take: 500`
  2. backlog: `propertyId in scope`, `scheduledFor: null`, `status: { in: OPEN_JOB_STATUSES }`, ordered urgent-desc then `createdAt` asc, `take: 200`
- Layout: calendar flexes, `BacklogRail` is a persistent right rail on `lg`, stacking below on mobile.
- `ScheduleToolbar`: prev / Today / next links + view tabs, all plain `Link`s built from `shiftAnchor` and `toCompact` — **no client date state**, so a view is shareable and reloads stable. Takes `view`/`date`/`title` as props rather than reading `searchParams` itself (avoids a Suspense boundary).
- `CalendarGrid`: bucket jobs into a `Map<ymd, ScheduleJob[]>` **once** rather than filtering per cell — a month view would otherwise scan the list 42 times. Sort within a day urgent-first then by property short code. Job chip shows short code · room · trade · contractor-or-"Unassigned" · status, links to `/maintenance/jobs/[id]`, and is tinted red when urgent, amber when overdue. `day` = one list · `week`/`workweek` = 7/5 columns of lists · `month` = 7-wide grid of 42 cells with out-of-month cells dimmed. Today's cell is visually marked. **No hour grid, no time labels anywhere.**
- Empty range: explicit copy — "No contractor jobs scheduled for this period." plus a link to `/maintenance/jobs/new?scheduledFor=<first cell>`. A bare grid must not read as an all-clear.
- `BacklogRail`: header with a count; each row links to the job; urgent rows tinted. Empty state states it positively — "No unscheduled jobs. Everything open has a date." — since here that genuinely is good news.

- [ ] **Step 1:** `CalendarGrid.tsx` (+ the exported `ScheduleJob` type) and `BacklogRail.tsx`.
- [ ] **Step 2:** `ScheduleToolbar.tsx`.
- [ ] **Step 3:** `page.tsx` wiring scope, math, both queries and layout, with `MaintenanceNav` under the `PageHeader`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` clean; `/maintenance/schedule` in the route list.
- [ ] **Step 5:** Commit. `feat(contractors): schedule calendar with persistent backlog rail` — body notes date-only means lists not hour grids, and the bucket-once decision.

---

## Task 8: Daily dashboard

**Files:** Create `app/maintenance/daily/{page.tsx,DailyNoteComposer.tsx,actions.ts}`

**Consumes:** Task 2 date helpers · Task 3 labels + `resolveNoteAuthor` + `appendDailyNoteSchema`.
**Produces:** `appendDailyNote(input)`.

**Tile definitions — use exactly these:**

| Tile | Query |
|---|---|
| Scheduled today | `scheduledFor = dayDate` AND status not terminal |
| Unscheduled backlog | `scheduledFor IS NULL` AND status in `OPEN_JOB_STATUSES` |
| Urgent open | `urgent = true` AND status in `OPEN_JOB_STATUSES` |
| Overdue | `scheduledFor < dayDate` AND status not terminal |
| Completed today | `status = DONE` AND `completedAt` within the ET day |

**Requirements:**
- `dayDate = new Date(ymd + "T00:00:00.000Z")` for the `@db.Date` comparisons; `completedAt` is a **timestamp** so bound it `gte: etDayStartUtc(ymd), lt: etDayStartUtc(nextYMD(ymd))`. Getting these two crossed shifts rows into the neighbouring ET day.
- Activity table: jobs where `scheduledFor = dayDate` **OR** (`DONE` and `completedAt` in the ET day). Columns exactly: Property · Room · Trade · Contractor · Status · Latest note (latest note via `notes: { orderBy: { createdAt: "desc" }, take: 1 }`, truncated ~80 chars). Urgent rows tinted; status links to the job.
- Day navigation: prev / Today / next links using `addDaysYMD` + `toCompact`.
- Written log: `DailyNoteComposer` (client) + entries for the day, newest first. Query is `forDate = dayDate` AND (`propertyId in scope` **OR** `propertyId IS NULL`) — a null-property entry is portfolio-wide and shows on every view.
- `appendDailyNote`: manager-or-above; `propertyId === null` requires `isPortfolioRole(actor.role)` — **use that existing predicate, do not hand-roll a role comparison**; otherwise `canAccessProperty`. Snapshots the author name into `authorLabel`. Audit-logs (`entityType: "ContractorDailyNote"`). No update/delete action exists.
- Composer shows the portfolio-wide checkbox **only** to portfolio users, and copy stating entries cannot be edited or deleted once posted.
- ⚠ If `getCurrentPropertyId` can return `null` for a single-property manager, the composer would attempt a portfolio write they cannot make. Verify; if so pass `activeId ?? scopedIds[0] ?? null` and note it in the commit body.
- Empty states: tiles render `0` (never blank); no activity → "No contractor activity recorded for <date>."; no entries → "No written entries for this day yet." The composer stays available regardless — a quiet day can still warrant a note.

- [ ] **Step 1:** `actions.ts`.
- [ ] **Step 2:** `DailyNoteComposer.tsx`.
- [ ] **Step 3:** `page.tsx` — tiles, table, log, day nav, `MaintenanceNav`.
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint && pnpm build` clean; `/maintenance/daily` in the route list.
- [ ] **Step 5:** Commit. `feat(contractors): daily rollup and append-only written log` — body notes the date-vs-timestamp query split.

---

## Task 9: ADR-030 + tracker + status

**Files:** Modify `docs/DECISIONS.md`, `TODO.md`, `CLAUDE.md`

- [ ] **Step 1: Append ADR-030** to `docs/DECISIONS.md` (027–029 are taken; verify before numbering). It must record: contractor **scheduling** returns to this repo as a companion to Kyle's external contractor project; this **partially reverses ADR-028**, which narrowed scope and deleted the rail; **dispatch and messaging do not return** and the new model deliberately omits `contracted`/`onCall`/`userId`/photos/signed links; **this repo owns the records**, accepting that two contractor lists can drift; it lives under the **Maintenance** section because a seventh nav section would break the five-item mobile bar; notes are **append-only by schema shape**; `Photo` is untouched (ADR-016 intact). Consequences: ADR-028's deletion is no longer wholly true and its text should point here; the 2026-08-10 design is archived and was **not** used as a source; A10 contractor checklists stay dropped (§Q31).

- [ ] **Step 2: Update `TODO.md`.** The track map's `~~D~~` row currently reads archived/deleted with "whether D returns is undecided" — that is now decided for scheduling. Add a Track D section with the shipped phases marked `[x]` and note the migration is **authored but not yet applied to prod**. Do not resurrect the archived D5–D9 rows or the Twilio/consent items; those stay archived.

- [ ] **Step 3: Update `CLAUDE.md`.** Amend the 2026-08-11 status block to record what shipped, the final test/route counts, the branch name, and that **the migration is not yet applied to prod and the code is not deployed**.

- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` clean. Commit. `docs: ADR-030 — contractor scheduling returns, dispatch does not`

---

## Post-build hand-off (human steps, not part of any task)

1. **Apply the migration to prod** (`ep-summer-cloud`, creds in gitignored `.env.production.local`). Additive, so **DB first, then deploy** — this repo's required order for adds.
2. **Deploy**, then open the three pages. Nothing in this plan has been opened in a browser; verification is tests, types, lint and build only.
3. **Enter real contractors** — the directory ships empty and the calendar has nobody to assign until it is populated. No seed roster is included: the last one shipped placeholder phone numbers into the baseline.

## Self-Review

**Spec coverage.** §2 in-scope 1–5 → Tasks 1, 4, 5, 7, 8. §2 out-of-scope → no task creates a send path, public route, token, photo relation, ranking function, sync, time field, or note edit/delete; `Photo` is explicitly guarded in Task 1 Step 6. §3 decisions 1–9 → Global Constraints + Task 7 (date-only lists, workweek default, backlog rail) + Task 5 (SYSTEM notes) + Task 8 (five tiles, both halves) + Task 1 (this repo owns records). §4 data model → Task 1. §5 placement/nav → Task 6. §6 behaviour rules → Task 5 (terminal immutability, close note, `completedAt`, audited reschedule, server-side eligibility, notes on terminal) + Task 3 (`isOverdue`) + Task 5 Step 2 (create prefill). §7 date handling → Task 2 + the `@db.Date`/timestamp constraint restated in Task 8. §8 testing → Tasks 2 and 3, DST cases named explicitly. §9 migration → Task 1 Steps 5–7 + hand-off. §10 open items → recorded in ADR-030 (Task 9).

**Placeholder scan.** No TBD/TODO/"handle edge cases". Every task names exact files, exact queries, exact enum values, exact copy, and exact commit subjects. Tasks 4–8 specify behaviour and point at named exemplar files (`app/templates/`, `app/issues/actions.ts`, `app/reports/ReportsNav.tsx`) rather than inlining JSX — deliberate, since those files are the authority on current house style and re-pasting them would let the plan drift from the codebase. Two conditionals are stated with their exact resolution: Task 1 Step 5's possibly-unreachable dev DB, and Task 8's `getCurrentPropertyId` null case.

**Type consistency.** `ContractorJobStatus` (not `JobStatus`) is used in Tasks 1, 3, 5, 7, 8. `OPEN_JOB_STATUSES`/`isTerminalJobStatus`/`requiresCloseNote`/`sortJobs`/`isOverdue`/`resolveNoteAuthor`/`tradeLabel`/`jobStatusLabel` are all defined in Task 3 and consumed with matching names later. Calendar helpers are defined in Task 2 and used in Tasks 5 (`parseDateParam`), 7 and 8 (`addDaysYMD`, `toCompact`) with matching signatures. `ScheduleJob` is defined once in Task 7's `CalendarGrid.tsx` and imported by `BacklogRail.tsx` and the page. `scheduledFor` is a dashed string at every boundary and a UTC-midnight `Date` in every query.

**Gap found and closed during review:** Task 6 originally only changed `lib/nav.ts`. `lib/nav.test.ts` asserts the current section shape and would have failed the task's own verification gate — an explicit read-every-failure step was added rather than leaving a subagent to discover it.
