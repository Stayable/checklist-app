# Template Library, Batch Create & Review Notes — Design

**Date:** 2026-08-31 (Eastern, derived — ⚠ the harness reported 2026-09-01 and was a day ahead)
**Branch:** `main` (deployed; auto-deploys to Vercel production on push)
**Decided by:** Kyle + Kate (no sign-off chain — CLAUDE.md §Project Roles)
**Amends:** ADR-009 (human label format), ADR-020 (template access)
**ADRs owed on merge:** ADR-034 (template multiplicity), ADR-035 (note-driven flagging)
— ADR-031 is taken (close-out/stayover), 032 reserved for Instant On uplink flaps, 033 for
contractor update fan-out.

---

## 0. The deadline governs everything below

**Kyle authors the templates Mon–Wed (Aug 31 – Sep 2). Soft launch Thu or Fri (Sep 3–4).**

Three build days, and it re-orders the work. The chain **W1 → W2 → W3 → W5 → W4** is the only part
that must land before Kyle can author, because he cannot fill in templates that do not exist.
Everything else is post-launch.

| | Workstreams | Why |
|---|---|---|
| **Before Kyle authors (today)** | W1, W2, W3 | He needs 28 shells with the right scope and the old 9 out of the way |
| **Before soft launch (Wed)** | W5, W4, W8, W7 | Naming, the wizard that creates the launch checklists, two cheap UI fixes |
| **After soft launch** | W6, W9, W10, W11 | Permissions can wait (Kyle is already ADMIN); Teams is blocked on §Q4; notes and the review filter are additive |

**W6 is not launch-blocking** even though it looks it — Kyle can author all 28 himself today with no
permission change. It matters when Bea/Erika/JJ start authoring, which is after launch.

---

## 1. Why

Eleven asks from the 2026-08 test round. The blocker behind them was that **the 9 seeded templates
hold placeholder questions** while the templates the business actually runs in Connecteam have no
home in the app. **Kyle owns that content and is writing it this week** — no longer owed by Karla or
Christopher, no longer an external dependency.

Everything lands on `main`. **A push to `main` deploys to production and the testers see it
immediately**, so work is committed freely and pushed in completed chunks, not per commit.

---

## 2. Decisions taken

Settled 2026-08-31. **D18–D23 are Kyle's revisions to the first pass and supersede the rows above
them where they conflict.**

| # | Decision | Chosen |
|---|---|---|
| D1 | Base branch | `main`, single branch. `rv9B6` abandoned in place |
| D2 | The 475 WIP lines | Ported to `main`, uncommitted. Authored by session `checklist-app-c0` — see `HandoffMultiRoomCreate_RISE8_083126.md` |
| D3 | Scope model | **Two axes** — subject × copies. Subject enum **unchanged** (D19) |
| D4 | Who is on shift | **Creator picks people at create time.** No Paycom, no roster inference |
| D5 | The 16 property variants | **28 separate templates**, different questions per property |
| D6 | "To Create" section | **No new feature.** Draft templates + one `Needs questions` filter chip |
| D7 | Permissions | Six named people → **`ADMIN`**. MANAGER / AGENT / CORPORATE → **view-only** templates |
| D8 | Instance name format | `{Template} {ShortCode} {ScopeToken} {MMDDYY}` — **six digits** (D21) |
| D9 | Save as Draft | **Batch definition only.** No instances, no new `InstanceStatus` |
| D10 | Issues filters | `Open · Unassigned · Resolved` + 4 priorities. Duplicate killed |
| D11 | `WONT_FIX` | Hide the chip and the setter. **Enum value stays** |
| D12 | Note → flag | **Any note, anywhere, flags.** Clean approve renamed **"No Error"** |
| D13 | Per-field notes | Visible to submitter, **no reply thread**, no resolve loop |
| D14 | Teams target | New per-property field; **build it, leave unset** until Kate supplies IDs (§Q4) |
| D15 | Property picker | **"All my properties"** — spans only what the user can access |
| D16 | Room source | **DB only.** Connector supplies no room inventory. Verified twice — §3a |
| D17 | Wizard editing | **Per-batch assignee + due time** |
| **D18** | **Template ↔ property** | **Templates are GLOBAL.** No per-property locking, no `TemplateProperty` work. Every template visible at every property |
| **D19** | **`PER_ZONE`** | **Dropped.** `TemplateScope` gains nothing. Zone stays a *filter in the room picker*, not a subject |
| **D20** | **"AM" and "PM"** | **Shift labels, not roles.** AM PA = morning PA, PM PA = afternoon/evening PA. **No Area Manager role exists and none is added** |
| **D21** | **Date digits** | **`MMDDYY`** — `090126`, not `09012026`. Matches `Title_PropertyID_MMDDYY` and the PDF filenames |
| **D22** | **The 3 loose templates** | `Lock Installation`, `Stayable Renovation Completion`, `Daily Contractor Checklist` — **parked. Kyle sets frequency and scope.** Not seeded in W2 |
| **D23** | **Template content** | **Kyle's, this week.** Not owed by Karla / Christopher. No longer an external blocker |

### What D18–D20 removed from the build

- **The 34-site `TemplateScope` audit is gone.** No new enum member means no `{ in: [...] }` / `notIn`
  hazard and no exhaustiveness sweep across `app/rules/*`, `lib/recurrence*`, `prisma/templates.ts`.
  This was the single largest risk in the first pass.
- **`TemplateProperty` wiring is gone** from W2 — templates seed with `allProperties: true` and no
  join rows.
- **No new `Role`.** The open `AM` question is answered: `Property Inspection` draws from `PA` like
  the other PA checklists.

**One residual, noted not blocking:** Kyle's original list wrote `Property Inspection Checklist —
Monthly — per AM (Area Manager), per location`, spelling out *Area Manager*. D20 says AM means morning
PA. Built as `PA`; one line to change if that template really means someone else.

---

## 3. Schema changes

All additive. No enum value removed, no column dropped. **`TemplateScope` is untouched.**

```prisma
// D3 — the multiplicity axis. The subject axis stays on the existing
// TemplateScope { PER_ROOM, PER_PROPERTY, AD_HOC } — unchanged, no PER_ZONE (D19).
enum InstanceMultiplicity {
  ONE           // one instance per subject
  PER_ASSIGNEE  // one per person the creator ticks (D4)
  PER_TASK      // one per task the creator names
}

model ChecklistTemplate {
  // ...existing...
  copies InstanceMultiplicity @default(ONE)
  // The assignee role pool for PER_ASSIGNEE reuses the existing defaultRole
  // column. No new field, and no new Role member (D20).
}

model ChecklistInstance {
  // ...existing...
  // Scope token for PER_TASK. Deliberately NOT parsed back out of `title`:
  // title is a composed display string and parsing it is fragile.
  taskLabel String? @map("task_label")
}

// D13 — one table covers text, date and photo answers, because every answer of
// every type is a Response row and photos hang off Response.
model ResponseNote {
  id         String   @id @default(uuid()) @db.Uuid
  responseId String   @map("response_id") @db.Uuid
  authorId   String   @map("author_id") @db.Uuid
  body       String
  createdAt  DateTime @default(now()) @map("created_at") @db.Timestamptz

  response Response @relation(fields: [responseId], references: [id], onDelete: Cascade)
  author   User     @relation(fields: [authorId], references: [id])

  @@index([responseId])
  @@map("response_notes")
}

// D9 — the wizard's saved state. No ChecklistInstance rows exist until Create.
model ChecklistBatchDraft {
  id              String   @id @default(uuid()) @db.Uuid
  createdByUserId String   @map("created_by_user_id") @db.Uuid
  propertyId      String   @map("property_id") @db.Uuid
  // [{ templateId, roomIds[], assigneeIds[], taskLabels[], dates[],
  //    assignedUserId, dueTime }]
  batches         Json
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz

  createdBy User     @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)
  property  Property @relation(fields: [propertyId], references: [id], onDelete: Cascade)

  @@index([createdByUserId])
  @@map("checklist_batch_drafts")
}

model Property {
  // ...existing...
  // D14 — SEPARATE from teamsChannelId, which is the Network/IT ticket channel.
  // A flagged Housekeeping checklist must not land in the IT feed.
  checklistTeamsChannelId   String? @map("checklist_teams_channel_id")
  checklistTeamsChannelName String? @map("checklist_teams_channel_name")
}
```

**`Response.notes` is not reused.** It exists and holds the *filler's* note, written at fill time.
Reviewer notes are a different author, a different moment, a different audience. Keeping them apart
is deliberate.

### The `perRoom` boolean still has to go

D19 removed the *enum* hazard but not this one. `copies` is a new axis the create path cannot
express, and it is currently hidden behind a boolean threaded through six sites in
`app/checklists/new/actions.ts`:

1. **`validateRoomSelection({ perRoom: boolean })`** (`lib/manual-create.ts`) — must take the
   `TemplateScope` **and** `copies`, so the compiler forces a decision rather than defaulting.
2. **The `perRoom` guard** (`actions.ts:94-95`) decides whether `roomIds` is honoured at all. A
   `PER_PROPERTY` + `PER_ASSIGNEE` template needs assignees honoured the way rooms are.
3. **The `roomLabel` fallback** (`actions.ts:117`, `:192`) keeps free text only when there is no real
   `Room` row — so every `PER_ASSIGNEE` and `PER_TASK` instance falls into the free-text path by
   default. Must be decided explicitly.

Replacing the boolean is part of W1, not a later cleanup.

---

## 3a. Rooms and Cloudbeds — settled, do not re-derive

Two sessions checked this independently on 2026-08-31 and agree:

- **There is no room-inventory endpoint through MCP.** Both connectors (`Cloudbeds` and
  `Stayable Dashboard - Shared`) are the same server with the same 14 tools. `get_today` is
  counts-only. `get_daily_report` is per-property aggregates. **Room-level detail exists for exactly
  one thing: blocked rooms, via `get_ooo_rooms`** — verified live against Lakeland (real numbers
  `119`, `183`, `240`, `APT1`, with types and reasons).
- **The room inventory is already here and it already came from Cloudbeds.** `scripts/load-rooms.ts`
  + `scripts/data/RoomZoning_Stayable_081226.json`, migration `20260812130000_add_room_zone_and_type`,
  loaded 2026-08-12. **1,172 rooms with `zone` and `roomType`.**
- **`§Q12` ("Cloudbeds per-property read-only API keys") is stale.** The keys exist and work — in the
  `dashboard.rentstayable.com` project, not in this repo.
- **The real remaining gap is occupancy, not inventory.** The export deliberately excluded occupancy
  and OOO state, so every room sits at the `VACANT` default. D16 leaves it there; `get_ooo_rooms` is
  the lever if it is ever closed.

---

## 4. Workstreams

W1 → W2 → W3 → W5 → W4 is the launch chain (§0). W6–W11 are independent.

### W1 — The `copies` axis · **launch chain**

Add `InstanceMultiplicity`, `ChecklistTemplate.copies`, `ChecklistInstance.taskLabel`. Template
builder gains a second selector. Replace the `perRoom` boolean at all six sites (§3).
**`TemplateScope` is not touched** (D19), so there is no cross-codebase audit.

All 28 mapped. Zone appears nowhere as a subject — `Monthly Room Inspection` is `PER_ROOM`, and
"per building" is served by the zone grouping already in the room picker:

| Template | subject | copies | assignee pool |
|---|---|---|---|
| Lease Arrival / Lease Flip | `PER_ROOM` | `ONE` | — |
| Arrival Checklist | `PER_ROOM` | `ONE` | — |
| Due Out Room Walk | `PER_PROPERTY` | `ONE` | — |
| Due Out Checklist | `PER_ROOM` | `ONE` | — |
| Housekeeping Checklist | `PER_ROOM` | `ONE` | — |
| Maintenance Checklist | `PER_PROPERTY` | `PER_TASK` | — |
| AM PA Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` | `PA` (morning shift) |
| 8 × `{id}` PM PA Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` | `PA` (afternoon/evening) |
| 8 × `{id}` Manager Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` | `MANAGER` |
| Monthly Room Inspection | `PER_ROOM` | `ONE` | — (zone filter in picker) |
| Property Inspection | `PER_PROPERTY` | `PER_ASSIGNEE` | `PA` (D20 — see §2 residual) |
| Roof Preventive Maintenance | `PER_PROPERTY` | `ONE` | — |
| Monthly Pressure Washing | `PER_PROPERTY` | `ONE` | — |
| Property Task Checklist | `PER_PROPERTY` | `PER_TASK` | — |

**AM / PM are shift labels, not roles** (D20). Both PA families draw from the same `PA` pool; the
distinction lives in the template name and in who the creator ticks.

### W2 — Seed 28 draft templates · **launch chain**

Extend `prisma/templates.ts`. Each: `active: false`, **`allProperties: true`** (D18 — global, no
`TemplateProperty` rows), zero questions, correct `code` / `scope` / `copies` / `defaultRole`.

`/templates` gains a **`Needs questions (n)`** filter chip and a `Draft` badge on any template with 0
questions. A template flips `active: true` when it has ≥1 question. **The chip is the only thing to
delete when beta ends.**

**28, not 31** — the three in D22 are parked until Kyle sets their frequency and scope.

Codes must be unique within `VarChar(8)` and are **permanent once an instance exists** (ADR-009 bakes
them into system IDs and PDF filenames):

`PAPM812 · PAPM2295 · PAPM2535 · PAPM4645 · PAPM5399 · PAPM6802 · PAPM8700 · PAPM44199`
`MGR812 · MGR2295 · MGR2535 · MGR4645 · MGR5399 · MGR6802 · MGR8700 · MGR44199`
`LFLIP · ARR · DOWALK · DEP · HKC · MNT · PAAM · RIN · PINSP · RPM · PWR · PTASK`

### W3 — Retire and rename the 9 seeded templates · **launch chain**

Six kept, three retired via `active: false`. **No deletions** — the 6 existing `checklist_instances`
keep their FKs, and `HKR` is embedded in every system ID they carry.

| Seeded | Becomes | Action |
|---|---|---|
| `ARR` Arrival Checklist | Arrival Checklist | keep, replace questions |
| `DEP` DueOut / Departure | Due Out Checklist | keep, rename, replace questions |
| `MNT` Maintenance Report | Maintenance Checklist | keep, rename, `copies=PER_TASK` |
| `PWR` Pressure Washing | Monthly Pressure Washing | keep, rename |
| `RPM` Roof Preventive Maintenance | Roof PM Checklist | keep |
| `RIN` Room Inspection | Monthly Room Inspection | keep, rename |
| `HKR` HK Review | — | **retire** |
| `PAR` PA Review | — | **retire** |
| `MGR` Manager Review | superseded by the 8 property variants | **retire** |

⚠ **"Housekeeping Checklist" is not a rename of "HK Review".** `HKR` is a weekly, per-property
supervisory review; the new Housekeeping Checklist is daily and per-room. Delete-and-create, not
rename. Display names change freely; **codes never do.**

### W5 — Instance naming · **launch chain**

`{Template} {ShortCode} {ScopeToken} {MMDDYY}` — **six digits** (D21):

- `Housekeeping Checklist LL 201 090126`
- `812 PM PA Checklist JN Randy R. 090126`
- `Roof PM Checklist SA 090126`
- `Property Task Checklist KE Pool gate 090126`

Scope token: room number · assignee display name · task label · empty.

Six digits matches CLAUDE.md's `Title_PropertyID_MMDDYY` and the PDF filenames these instances sit
beside (`Arrival_4645_052626_Rm312.pdf`), so a checklist and its export agree.

**Amends ADR-009's human-label format** (`Arrival Checklist — LL — Rm 312 — May 26, 2026`), which was
specified but never fully implemented — shipped code produces `Arrival Checklist — Sep 1, 2026`
(`lib/manual-create.ts`). The `systemId` `CL-4645-ARR-20260901-012` is untouched and remains the join
key. The preview is live in the wizard and is the exact string written.

### W4 — Batch create wizard · **launch chain**

Replaces `/checklists/new`. Absorbs the ported WIP (`planRoomInstances`, `validateRoomSelection`,
`summarizeCreateResult`, `MAX_ROOMS_PER_CREATE`).

Flow: **property → [batch: template → subjects → dates → assignee + due time] → `+ Add another
batch` → live name preview → Create / Save as Draft → confirmation dialog listing every instance →
Create.**

Subject picker by `scope × copies`:

- `PER_ROOM` → room list from the DB, **grouped by `zone` with a per-zone "select all"**.
  `groupRoomsByZone` already exists (`ManualCreateClient.tsx:191`) and must be kept — a property here
  has 127–167 rooms, so a flat list is a scroll with no landmarks, and "Building A today" is how the
  work is actually split. **No occupancy or OOO signal** (D16). Zoning for **JW, DP and KW is
  provisional** at the source.
- `PER_PROPERTY` + `ONE` → nothing to pick.
- `PER_PROPERTY` + `PER_ASSIGNEE` → checkbox list of users at that property whose role matches
  `defaultRole` (D4).
- `PER_PROPERTY` + `PER_TASK` → free-text task names, one per line.

Instance count = `subjects × dates`. Three rooms × two dates = six instances, each its own
`ChecklistInstance`, system ID, PDF and review row (ADR-009).

**`MAX_ROOMS_PER_CREATE` is now 200 — already fixed in code 2026-08-31.** It was 60, with a comment
claiming 60 exceeded the biggest property. False: `KE 167 · KW 160 · LL 157 · DP 153 · SA 140 ·
OR 135 · JW 133 · JN 127`, largest single zone **80** (DP Building B). At 60 the cap blocked a single
building. A second cap, `MAX_INSTANCES_PER_CREATE = 400`, bounds the whole submission across every
batch (a full property × two days).

**No wrapping transaction.** Creates are sequential, each with the existing P2002 sequence retry,
because a P2002 inside a transaction poisons it and defeats the retry — the reasoning already written
down in `lib/network/ticketing.server.ts`. The server re-validates that every submitted room belongs
to the property.

### W6 — Permissions · post-launch

`canManageTemplate` collapses to `role === ADMIN`; the `allProperties` special case disappears. That
flag — not role — is what actually blocked non-admins (`lib/template-access.ts:23`, and all 9 seeded
templates are `allProperties: true`). **With D18 making every template global, that branch would
otherwise lock out everyone but ADMIN by accident**, so removing it is required, not optional.
`/templates` renders read-only for everyone else rather than showing controls that would fail.

⚠ **Two production writes, Kyle's to run:** six role changes to `ADMIN` (Bea, Erika, Kate, Rob
`rb@rise8companies.com`, Crystal `crystal@rentstayable.com`) and **creating `jj@rentstayable.com`**,
who does not exist yet. Script to be written; the current roles of the other five are unverified.

⚠ **Security note, recorded not resolved:** this takes the system to at least seven admins while
`rosterPassword()` (`"Ops"` + mailbox letters) remains in committed code. `mustChangePassword` and the
new-device OTP are the only barriers. Already tracked as P1.

### W7 — Property picker "All my properties" · pre-launch, cheap

Explicit entry at the top of the picker, labelled with its count. `ADMIN`/`CORPORATE` see
`All properties (8)`; a scoped user sees `All my properties (2)` listing only theirs. Mechanically
this selects the existing null-cookie state that `resolveScopedPropertyIds` already handles — the gap
is purely that scoped users have no way to choose it. Single-property users still see no picker.

### W8 — Issues filters · pre-launch, cheap

Chips become `Open · Unassigned · Resolved` + `LOW MED HIGH URGENT`. The raw
`Object.values(IssueStatus)` loop is removed — it is what produced two chips both labelled "Open"
with different meanings (`app/issues/page.tsx:91` vs `:97`). `WONT_FIX` loses its chip and its setter
on the detail page; **the enum value stays** so existing rows render.

### W9 — Note-driven flagging + Teams · post-launch

`approveSubmission` is renamed **"No Error"** in the UI and refuses to run while any note exists —
whole-submission or per-field. Adding a note transitions `SUBMITTED → FLAGGED`. `flagSubmission`'s
existing note requirement and audit-log writes are reused.

On the transition to `FLAGGED`, post to the property's `checklistTeamsChannelId` via the working
Graph path (`lib/network/teams-graph.server.ts`). **When the channel is unset the notification is
skipped and logged to `notification_log`** — ships without blocking on §Q4, turns on per property as
Kate supplies IDs. A failure at one property never blocks another.

### W10 — Per-field reviewer notes · post-launch

`ResponseNote` rows, authored from `/review/[id]`, rendered inline beside each answer regardless of
type. Visible to the submitter when the submission returns. No reply thread, no unread state, no
resolve loop — CLAUDE.md lists chat/messaging as out of scope and this stays short of it. Bilingual
EN+ES on the field-staff surface per ADR-013; the review surface stays English-only.

### W11 — `/review` in-page property filter · post-launch

**A different gap from W7.** W7 fixes the *header picker*; this fixes the *page*.
`app/review/page.tsx:30` accepts only `searchParams: { filter?: string }`, so property comes from the
header cookie alone. `shortCode` is already selected and rendered per row but is not filterable — so
a portfolio reviewer cannot see all 8 properties and group by property in one view.

Add a property column and property filter chips beside the existing status tabs, taking a `property`
search param that composes with `filter`. Mirrors the shipped network ticket-filter pattern. Chips
are drawn from `accessiblePropertyIds`, so a scoped user sees only theirs, and scope stays enforced
server-side through the same `scopeIds` the queue already uses — a filter narrows what the user may
see, never widens it.

Closes the ask CLAUDE.md records as Bea's: `/completed` has on-page filters and `/review` has none.
**Verified 2026-08-31** — `Export PDF` already exists at `app/review/[id]/page.tsx:180`, so that half
of her feedback needs no work; only bulk/zip export is missing and stays out of scope (§A7, P2).

---

## 5. Testing

- **Unit (Vitest):** name composition across all four scope-token kinds; batch expansion
  `subjects × dates`; `planRoomInstances` duplicate detection (already written, 15 green);
  `InstanceMultiplicity` exhaustiveness; `canManageTemplate` across all 8 roles.
- **Integration:** create a 2-batch draft, reopen it, create from it, assert instance count and that
  a draft creates **zero** instances; assert a note flips `SUBMITTED → FLAGGED`; assert a Teams post
  with no channel logs `SKIPPED` and does not throw.
- **Playwright:** the wizard end to end — 3 rooms × 2 dates → 6 instances with the expected names.
- **Migration:** applied to prod **before** the deploy that needs it and verified via
  `information_schema`, per the 2026-08-22 pattern. All changes are additive and nullable, so
  rollback is code-only (`vercel promote`); the migration stays.

## 6. Out of scope

Paycom shift data · occupancy / OOO sync · `PER_ZONE` as a subject · per-property template locking ·
an `AM` role · reply threads on notes · contractor-filled checklists (§Q31) · per-property question
variants inside one template · removing the `WONT_FIX` enum value · bulk/zip PDF export · the Network
device/ticket orphan fixes (`NetworkOrphanQueries_RISE8_083126.sql`).

## 7. Open items

1. **The 3 parked templates** (D22) — `Lock Installation`, `Stayable Renovation Completion`,
   `Daily Contractor Checklist`. **Kyle sets frequency and scope.** Note for the third: contractor
   identity was deleted by ADR-028, so it can be a template an **employee** fills *about* a
   contractor, not one a contractor fills.
2. **`Property Inspection` assignee** — built as `PA` per D20, but Kyle's original list spelled out
   *Area Manager*. One line to change if that template means someone else.
3. **§Q4 Teams channel IDs** — owed by Kate. W9 ships dark without them.
4. **Current roles of the six** named people are unverified, and `jj@rentstayable.com` may not exist.
5. **`MAX_INSTANCES_PER_CREATE = 400`** is my number, not Kyle's. Cheap to change.
6. **The sequential write loop is unmeasured at scale.** No wrapping transaction (by design, W4), so
   400 instances is 400 round trips plus retries against a Neon instance that autosuspends. Time one
   full-property create before trusting 400; if it is slow the fix is chunking with progress, not a
   transaction.
7. **The working tree is mid-port and manual per-room create is BROKEN there.** `actions.ts` takes
   `roomIds: string[]`; `ManualCreateClient.tsx` is still `main`'s version and posts singular
   `roomId`, so the Zod schema defaults `roomIds` to `[]` and every `PER_ROOM` create fails with
   *"This checklist is per-room — select at least one room."* **Typecheck passes** — the mismatch is
   across the form boundary. Nothing committed, nothing deployed. **W4 closes this, and it must close
   before the soft launch.**
