# Handoff — multi-room manual create + Kate's 7 checklist questions

**Written:** 2026-08-31 ~11:52 AM ET · session `checklist-app-c0` · for session `checklist-app-4b`
**Repo state at writing:** on `main`, level with `origin/main` (0 ahead / 0 behind).

---

## ⚠ READ FIRST — the shared working tree is in a broken half-state, and it is mine

Three files carry **my uncommitted edits**; a fourth was reverted to `main`'s version while I worked
(deliberately, by the other session — I have not touched it back).

| File | State |
|---|---|
| `app/checklists/new/actions.ts` | **MY EDIT** — `createInstanceManually` now takes `roomIds: string[]`, not `roomId` |
| `lib/manual-create.ts` | **MY EDIT** — adds `planRoomInstances`, `validateRoomSelection`, `summarizeCreateResult`, `MAX_ROOMS_PER_CREATE` |
| `lib/manual-create.test.ts` | **MY EDIT** — 14 new tests, all passing (15/15 in that file) |
| `app/checklists/new/ManualCreateClient.tsx` | **`main`'s version** — still sends singular `roomId` |

**Consequence: manual per-room checklist creation is currently broken in the working tree.**
The client posts `roomId`; the action's Zod schema no longer has that key, so `roomIds` falls to `[]`
and every PER_ROOM create fails with *"This checklist is per-room — select at least one room."*
Not committed, not deployed — working tree only.

**RESOLVED 2026-08-31 (Kyle): carry it over, don't commit yet.** Session `checklist-app-4b` switched the
tree to `main`, my three files applied cleanly and stay uncommitted; `ManualCreateClient.tsx` conflicted
on the 3-way and was reverted to `main`'s version rather than resolved, because the new batch-create
wizard replaces that file wholesale. The 707-line patch at `<scratchpad>/multiroom-wip.patch` is
preserved but **must not be re-applied — it is already applied.**

**Tree ownership handed to `checklist-app-4b` on 2026-08-31.** This session is done editing
`lib/manual-create.ts`, `app/checklists/new/actions.ts` and `lib/manual-create.test.ts`.

---

## What Kyle asked for

> "for the room number, make it a selector (for multiple rooms to be created for the same checklist)"

One manual-create action selects **many rooms** and creates **one checklist per room**.
This effectively absorbs TODO `§A7`'s *"Bulk create UI (template + property + date range + room list)"*
into the existing `/checklists/new` form rather than a separate screen — minus the date range, which
is still not built.

### Design decisions already made (flagged to Kyle, not overruled)

1. **N instances, one per room** — never one instance spanning rooms. `ChecklistInstance.roomId` is a
   singular FK, and ADR-009 gives each instance its own system ID, its own PDF and its own review
   queue row. A multi-room instance would break all three.
2. **Duplicates skipped by default.** A room already holding a live (non-`INVALIDATED`,
   non-`EXPIRED`) instance of that template on that ET day is skipped, and the count is reported.
   An explicit *"Create even if one already exists"* checkbox forces it — mirrors ADR-009's
   force-create path.
3. **No wrapping transaction.** Creates run sequentially, each with the existing P2002 seq retry.
   A `P2002` inside a transaction poisons it and defeats the retry — the same trap already
   documented in `lib/network/ticketing.server.ts`. A single contended sequence number therefore
   loses one room, not the batch; the result reports `created` / `duplicates` / `failed`.
4. **Server re-validates room ownership** — every submitted room id must belong to the target
   property. Client-supplied ids are never trusted.
5. **One title and one assignee for the whole batch.** Rooms are distinguished by the `Unit #`
   column and `roomDisplay()`, not by the title. Worth revisiting if the review queue reads badly.

### ⚠ The client still to be written MUST keep zone grouping

`main` groups the room picker by `zone` (building), with this comment in
`ManualCreateClient.tsx`:

> *A property here has 127-167 rooms, so a flat list of numbers is a scroll with no landmarks;
> the building is how staff actually locate a room.*

My first attempt was built on a stale branch that predated `zone` and **would have deleted
`groupRoomsByZone`**. Caught before commit. The multi-select must be **grouped by zone with a
per-zone "select all"** — at 167 rooms that is the difference between usable and not, and
"Building A today" is exactly how the work is split.

### ❌ `MAX_ROOMS_PER_CREATE = 60` IS WRONG, AND SO IS ITS COMMENT — mine, measured 2026-08-31

The comment I shipped on that constant — *"60 is above the biggest Stayable property's room count"* —
is **false and must not survive into a commit.** Measured from
`scripts/data/RoomZoning_Stayable_081226.json`:

| | | | | | | | |
|---|---|---|---|---|---|---|---|
| KE 167 | KW 160 | LL 157 | DP 153 | SA 140 | OR 135 | JW 133 | JN 127 |

**1,172 rooms total. Largest single zone: 80 (DP, Building B)** — then KW Building C 60, LL Building B
56, JW Building E 52, JN Building A 40, OR 37, KE/SA 36.

So 60 blocks a whole-property create **and** blocks a single-building create at DP — the exact
"Building A today" case `groupRoomsByZone` exists to serve. `checklist-app-4b` measured this
independently and reached the same figures; its spec sets **200**, plus
`MAX_INSTANCES_PER_CREATE = 400` to bound subjects × dates.

---

## How I got here — a stale-branch mistake worth not repeating

I spent most of this session reading `claude/rise8-operations-platform-rv9B6`, which was
**96 commits behind `origin/main`**. Two things I told Kyle were wrong as a result:

1. **"Prod has 5 demo Lakeland rooms"** — false. `main` loaded the **real Cloudbeds room inventory
   on 2026-08-12**: `scripts/load-rooms.ts`, `scripts/data/RoomZoning_Stayable_081226.{csv,json}`,
   migration `20260812130000_add_room_zone_and_type`. `Room` gained `zone` + `roomType`.
2. **The whole "how do we get room data out of Cloudbeds" question** was already answered by that
   one-time export.

That branch also does not typecheck — 15 errors, all from ADR-028 deleting the contractor rail on
`main` while the branch still carries `lib/contractors.ts` / `lib/consent.ts` against a Prisma client
generated from `main`'s schema. None were mine.

---

## Cloudbeds — what is actually reachable, verified live

Kyle asked whether room data could come from the Cloudbeds API. I tested it rather than assuming.

- **Live reads work today** via `dashboard.rentstayable.com` (both the `claude.ai Cloudbeds` and
  `Stayable Dashboard - Shared` MCP connectors — **same server, identical 14 tools**). I pulled
  Lakeland's blocked rooms live: real room numbers (`119`, `183`, `240`, `APT1`), room types, type
  codes, free-text reasons, end dates.
- **`§Q12` ("Cloudbeds per-property read-only API keys") is stale.** The keys are not missing; they
  live and work in the dashboard project, not in this repo.
- **Room-level detail exists for exactly one thing: blocked rooms** (`get_ooo_rooms`).
  `get_today` is explicitly *"Counts only: no guest names or reservation-level detail."*
  `get_daily_report` is per-property revenue/occupancy aggregates. **So there is no per-room
  arrivals/departures feed and no full-inventory endpoint through MCP.**
- **Kyle chose option 2:** per-property read-only keys in *this* repo + `lib/cloudbeds/` per ADR-022.
  Blocked on the keys themselves — none are in this repo's env.

**The real remaining Cloudbeds gap is occupancy, not inventory.** `main`'s own schema comment says
the export deliberately excluded occupancy and OOO state, so **every imported room sits at the
`VACANT` default** — *"a recurring rule filtered on occupied/vacant is filtering on a default, not
on fact."* That is the gap that matters for stayovers below.

---

## Kate's 7 questions — status as assessed against `main`

| # | Question | Status |
|---|---|---|
| 1 | "HK Review" → rename "HK Checklist"? | **Config, not code.** Template names are DB fields, editable in `/templates`. ⚠ But `HKR` is scoped **weekly, per-property, HK Lead** — a supervisor review. The per-room HK forms are **Arrival (ARR)** and **DueOut (DEP)**. Confirm which she means before renaming. Change the display name only — the 8-char code is baked into every system ID (`CL-4645-HKR-20260831-001`) |
| 2 | Room selection on the HK checklist | **This work.** Room is currently set at *create*, not by the filler. Multi-select in progress; see above |
| 3 | Stayover → enter "Stayover" and close? | **Not built.** `INVALIDATED` exists in the enum and `lib/reports.ts` already excludes it, but **no code path ever sets it**. The ADR-014 invalidation flow is `§A7`, P1, not started. Today: leave it unsubmitted (reads as incomplete/overdue) or submit with a comment (records a fake completed arrival and corrupts completion %). Recommend building it with a **reason picker** — Stayover / OOO / Duplicate / Other + note |
| 4 | Departure → stayover, same process? | **Same gap, one flow — do not build two.** Cloudbeds is the authoritative signal (a stayover *is* a reservation extension), but per ADR-022 build manual-first: it is needed for OOO/duplicate regardless and works without the vendor |
| 5 | "Manager Review" → "Manager Checklist" + list tasks | Rename is config. **"List the manager's tasks" is the P0 content blocker** — all 40 seeded questions across all 9 templates are PLACEHOLDER (`§A6`, owner Karla/Christopher). Authorable in `/templates` today, no code needed |
| 6 | Review tab filtered/separated by property | **Half there.** `/review` is scoped by the header property picker (`app/review/page.tsx:36-41`) and each row shows its short code. Missing: an **in-page property column + filter** so a portfolio reviewer sees everything at once and groups by property. Small build; mirrors the network ticket-filter pattern |
| 7 | Downloadable checklist PDFs | **Endpoint exists, no button.** `app/api/checklists/[id]/pdf/route.tsx` renders the full submission (responses, photos w/ ET capture time + geo, signatures, timings), auth + RBAC gated. **Zero UI links to it** — only the *report* PDFs have buttons (`app/reports/ReportFilters.tsx:44`). Reachable only by typing the URL. ~30 min to add. Bulk/zip export is not built (`§A7`, P2) |

**Net:** #1, #5 and the question content are config/content. #2, #3+#4, #6, #7 are four small builds.

---

## Not yet done, and deliberately not done unasked

- **Nothing written to `TODO.md`.** Offered twice, never approved. The pending edits would be:
  add #3/#4 (invalidation with reason), #6 (review property filter), #7 (PDF button) and
  room-entry-at-fill to `§A7`; open a `§Q` for the HK/Manager naming ambiguity; mark **`§Q12` stale**.
- **Nothing written to Smartsheet** (per Kyle's standing ask-first rule).
- **Nothing committed.** No branch created.
