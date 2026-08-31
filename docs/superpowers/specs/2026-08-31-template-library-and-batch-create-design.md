# Template Library, Batch Create & Review Notes — Design

**Date:** 2026-08-31 (Eastern, derived — harness agreed)
**Branch:** `main` (deployed; auto-deploys to Vercel production on push)
**Decided by:** Kyle + Kate (no sign-off chain — CLAUDE.md §Project Roles)
**Amends:** ADR-009 (human label format), ADR-020 (template access)
**ADRs owed on merge:** ADR-034 (two-axis template scope), ADR-035 (note-driven flagging)
— ADR-031 is taken (close-out/stayover), 032 reserved for Instant On uplink flaps, 033 for
contractor update fan-out.

---

## 1. Why

Eleven asks from the 2026-08 test round, plus the real blocker behind all of them:
**the 9 seeded templates hold placeholder questions**, and the 31 templates the business
actually runs in Connecteam have no home in the app. Field staff cannot be trained on
placeholder content, so this work sits on the critical path to cutover.

Everything lands on `main`. **A push to `main` deploys to production and the testers see it
immediately**, so work is committed freely and pushed in completed chunks, not per commit.

---

## 2. Decisions taken (all settled 2026-08-31)

| # | Decision | Chosen |
|---|---|---|
| D1 | Base branch | `main`, single branch. `rv9B6` abandoned in place |
| D2 | The 475 WIP lines | Ported to `main`, uncommitted. 3 of 4 files clean; `ManualCreateClient.tsx` conflicted, reverted, patch kept. **Authored by session `checklist-app-c0`** — see `HandoffMultiRoomCreate_RISE8_083126.md` |
| D3 | Scope model | **Two axes** — subject × copies, not one flat enum |
| D4 | Who is on shift | **Manager picks people at create time.** No Paycom, no roster inference |
| D5 | The 16 property variants | **28 separate templates**, different questions per property |
| D6 | "To Create" section | **No new feature.** 31 draft templates + one `Needs questions` filter chip |
| D7 | Permissions | Six named people → **`ADMIN`**. MANAGER / AGENT / CORPORATE → **view-only** templates |
| D8 | Instance name format | `{Template} {ShortCode} {ScopeToken} {MMDDYYYY}` (8-digit — see W5) |
| D9 | Save as Draft | **Batch definition only.** No instances, no new `InstanceStatus` |
| D10 | Issues filters | `Open · Unassigned · Resolved` + 4 priorities. Duplicate killed |
| D11 | `WONT_FIX` | Hide the chip and the setter. **Enum value stays** |
| D12 | Note → flag | **Any note, anywhere, flags.** Clean approve renamed **"No Error"** |
| D13 | Per-field notes | Visible to submitter, **no reply thread**, no resolve loop |
| D14 | Teams target | New per-property field; **build it, leave unset** until Kate supplies IDs (§Q4) |
| D15 | Property picker | **"All my properties"** — spans only what the user can access |
| D16 | Room source | **DB only.** Connector supplies no room inventory; no occupancy sync here. **Verified twice, independently** — see §3a |
| D17 | Wizard editing | **Per-batch assignee + due time** |

---

## 3. Schema changes

All additive. No enum value removed, no column dropped.

```prisma
// D3 — the multiplicity axis. Subject stays on TemplateScope.
enum InstanceMultiplicity {
  ONE           // one instance per subject
  PER_ASSIGNEE  // one per person the creator ticks (D4)
  PER_TASK      // one per task the creator names
}

enum TemplateScope {
  PER_ROOM
  PER_ZONE      // NEW — building. Room.zone already exists and is populated
  PER_PROPERTY
  AD_HOC
}

model ChecklistTemplate {
  // ...existing...
  copies InstanceMultiplicity @default(ONE)
  // The assignee role pool for PER_ASSIGNEE reuses the existing defaultRole
  // column. No new field.
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
  // [{ templateId, roomIds[], zoneNames[], assigneeIds[], taskLabels[],
  //    dates[], assignedUserId, dueTime }]
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

**`Response.notes` is not reused.** It exists and holds the *filler's* note, written at fill
time. Reviewer notes are a different author, a different moment, a different audience.
Keeping them apart is deliberate.

### ⚠ Required audit: adding `PER_ZONE`

`TemplateScope` has **34 references across 10 non-test files** — `app/checklists/new/actions.ts`,
`ManualCreateClient.tsx`, `app/rules/{actions,page,RulesManager}`, `app/templates/new/page.tsx`,
`lib/manual-create.ts`, `lib/recurrence{,.server}.ts`, `prisma/templates.ts`.

This is the same hazard CLAUDE.md records for `InstanceStatus`: a new enum member is silently
**excluded** by `{ in: [...] }` and silently **included** by `notIn`, and an
`if (scope === PER_ROOM) … else …` treats `PER_ZONE` as per-property with a clean typecheck and
a green build. **All 34 must be visited, and an exhaustiveness test must pin it**, in the manner
of the existing `rbac.test.ts` role test.

Three specific sites, called out because a boolean is hiding the branch:

1. **`validateRoomSelection({ perRoom: boolean })`** (`lib/manual-create.ts:67`) — a boolean cannot
   express a third subject. It must take the `TemplateScope` (and, once W1 lands, `copies`) so the
   compiler forces a decision when a member is added.
2. **The `perRoom` guard** (`actions.ts:94-95`) decides whether `roomIds` is honoured at all.
   `PER_ZONE` needs its own answer here, not `perRoom`'s.
3. **The `roomLabel` fallback** (`actions.ts:117`, `:192`) keeps a free-text label only when there is
   no real `Room` row. `PER_ZONE` has a zone but no room, so it falls into the free-text path by
   default — which is almost certainly wrong and must be decided explicitly.

The `perRoom` boolean is threaded through six sites in `actions.ts`. Replacing it with the scope is
part of W1, not a later cleanup.

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
  loaded 2026-08-12. 1,172 rooms with `zone` and `roomType`. The "get room data out of Cloudbeds"
  question was answered by that one-time export, not by an API.
- **`§Q12` ("Cloudbeds per-property read-only API keys") is stale.** The keys exist and work — in the
  `dashboard.rentstayable.com` project, not in this repo.
- **The real remaining gap is occupancy, not inventory.** The export deliberately excluded occupancy
  and OOO state, so every room sits at the `VACANT` default. D16 leaves it there for this scope; if
  it is ever closed, `get_ooo_rooms` is the lever.

## 4. Workstreams

1→2→3→4 is a chain. 5–11 are independent and can land in any order.

### W1 — Two-axis scope (blocks W2, W3, W4)

Add `InstanceMultiplicity`, add `PER_ZONE`, add `ChecklistTemplate.copies`, add
`ChecklistInstance.taskLabel`. The template builder gains a second selector. Audit the 34
references. Add the exhaustiveness test.

All 31 templates mapped:

| Template | subject | copies |
|---|---|---|
| Lease Arrival / Lease Flip | `PER_ROOM` | `ONE` |
| Arrival Checklist | `PER_ROOM` | `ONE` |
| Due Out Room Walk | `PER_PROPERTY` | `ONE` |
| Due Out Checklist | `PER_ROOM` | `ONE` |
| Housekeeping Checklist | `PER_ROOM` | `ONE` |
| Maintenance Checklist | `PER_PROPERTY` | `PER_TASK` |
| AM PA Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` (PA) |
| 8 × `{id}` PM PA Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` (PA) |
| 8 × `{id}` Manager Checklist | `PER_PROPERTY` | `PER_ASSIGNEE` (MANAGER) |
| Monthly Room Inspection | `PER_ROOM` | `ONE` (zone filter at create) |
| Property Inspection | `PER_PROPERTY` | `PER_ASSIGNEE` (**no AM role exists** — see §7.7) |
| Roof Preventive Maintenance | `PER_PROPERTY` | `ONE` |
| Monthly Pressure Washing | `PER_PROPERTY` | `ONE` |
| Property Task Checklist | `PER_PROPERTY` | `PER_TASK` |
| Lock Installation | `PER_ROOM` | `ONE` — **frequency unconfirmed** |
| Stayable Renovation Completion | `PER_ROOM` | `ONE` — **frequency unconfirmed** |
| Daily Contractor Checklist | `PER_PROPERTY` | `PER_TASK` — **see §7** |

### W2 — Seed 31 draft templates (D6)

Extend `prisma/templates.ts` with all 31: `active: false`, zero questions, correct
`code` / `subject` / `copies` / `defaultRole` / property associations. `/templates` gains a
**`Needs questions (n)`** filter chip and a `Draft` badge on any template with 0 questions. A
template flips `active: true` when it has ≥1 question. **The chip is the only thing to delete
when the beta ends.**

Codes must be unique within `VarChar(8)` and are **permanent once an instance exists** — ADR-009
bakes them into system IDs and PDF filenames:

`PAPM812 · PAPM2295 · PAPM2535 · PAPM4645 · PAPM5399 · PAPM6802 · PAPM8700 · PAPM44199`
`MGR812 · MGR2295 · MGR2535 · MGR4645 · MGR5399 · MGR6802 · MGR8700 · MGR44199`
`LFLIP · ARR · DOWALK · DEP · HKC · MNT · PAAM · RIN · PINSP · RPM · PWR · PTASK · LOCK · RENO · CONTR`

### W3 — Retire and rename the 9 seeded templates

Six kept, three retired via `active: false`. **No deletions** — the 6 existing
`checklist_instances` keep their FKs.

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

### W4 — Batch create wizard

Replaces `/checklists/new`. Absorbs the ported WIP (`planRoomInstances`,
`validateRoomSelection`, `summarizeCreateResult`, `MAX_ROOMS_PER_CREATE = 60`).

Flow: **property → [batch: template → subjects → dates → assignee + due time] →
`+ Add another batch` → live name preview → Create / Save as Draft → confirmation dialog
listing every instance → Create.**

The subject picker varies by `subject × copies`:

- `PER_ROOM` → room list from the DB, **grouped by `zone` with a per-zone "select all"**.
  `groupRoomsByZone` already exists (`ManualCreateClient.tsx:191`) and must be kept — a property
  here has 127–167 rooms, so a flat list of numbers is a scroll with no landmarks, and "Building A
  today" is how the work is actually split. **No occupancy or OOO signal** (D16) — `rooms.status`
  is a documented default, not a fact. Zoning for **JW, DP and KW is flagged provisional** at the
  source.
- `PER_ZONE` → the property's zone list.
- `PER_PROPERTY` + `ONE` → nothing to pick.
- `PER_PROPERTY` + `PER_ASSIGNEE` → checkbox list of users at that property whose role matches
  `defaultRole` (D4).
- `PER_PROPERTY` + `PER_TASK` → free-text task names, one per line.

Instance count = `subjects × dates`. Three rooms × two dates = six instances, each its own
`ChecklistInstance`, system ID, PDF and review row (ADR-009).

⚠ **`MAX_ROOMS_PER_CREATE = 60` must be raised to 200.** The constant ships with the comment
*"60 is above the biggest Stayable property's room count"*, which is **false**. Measured from
`scripts/data/RoomZoning_Stayable_081226.json`: `KE 167 · KW 160 · LL 157 · DP 153 · SA 140 ·
OR 135 · JW 133 · JN 127`, 1,172 rooms total, and the **largest single zone is 80 rooms**. At 60
the cap blocks not just a whole-property create but a single building — the exact "Building A
today" case the zone grouping exists to serve. 200 clears the largest property with headroom.

A second cap, `MAX_INSTANCES_PER_CREATE = 400`, bounds the whole submission across every batch
(a full property × two days). See §7.8 — at that size the sequential write loop needs a duration
check before the cap is trusted.

**No wrapping transaction.** Creates are sequential, each with the existing P2002 sequence retry,
because a P2002 inside a transaction poisons it and defeats the retry — the same reasoning already
written down in `lib/network/ticketing.server.ts`. The server re-validates that every submitted
room belongs to the property.

### W5 — Instance naming (D8)

`{Template} {ShortCode} {ScopeToken} {MMDDYYYY}`:

- `Housekeeping Checklist LL 201 09012026`
- `812 PM PA Checklist JN Randy R. 09012026`
- `Roof PM Checklist SA 09012026`
- `Property Task Checklist KE Pool gate 09012026`

Scope token: room number · zone name · assignee display name · task label · empty.

**Amends ADR-009's human-label format** (`Arrival Checklist — LL — Rm 312 — May 26, 2026`), which
was specified but never fully implemented — shipped code produces `Arrival Checklist — Sep 1, 2026`
(`lib/manual-create.ts:9`). The `systemId` `CL-4645-ARR-20260901-012` is untouched and remains the
join key.

The preview is live in the wizard and is the exact string written.

⚠ **The date is `MMDDYYYY`, eight digits — not the project's `MMDDYY`.** `09012026`, not `090126`.
This is deliberate: it is what Kyle wrote in the brief and what he approved in the preview. But it
**diverges from the file-naming convention in CLAUDE.md** (`Title_PropertyID_MMDDYY`), which drives
the PDF filenames these instances sit beside — `Arrival_4645_052626_Rm312.pdf` is six digits. So a
checklist named `…09012026` will export a PDF named `…090126`. Whichever way this goes, it is
inherited by the amending ADR and by every instance created after it: **a find-and-replace now, a
data migration later.** Flagged to Kyle; the eight-digit form stands until he says otherwise.

### W6 — Permissions (D7)

`canManageTemplate` collapses to `role === ADMIN`; the `allProperties` special case disappears. That
flag — not role — is what actually blocked non-admins (`lib/template-access.ts:23`, and all 9 seeded
templates are `allProperties: true`). `/templates` renders read-only for everyone else rather than
showing controls that would fail.

⚠ **Two production writes, Kyle's to run, not mine:** six role changes to `ADMIN` (Bea, Erika, Kate,
Rob `rb@rise8companies.com`, Crystal `crystal@rentstayable.com`) and **creating
`jj@rentstayable.com`**, who does not exist yet. Script to be written; the current roles of the other
five are unverified — needs `scripts/check-users.ts`.

⚠ **Security note, recorded not resolved:** this takes the system to at least seven admins while
`rosterPassword()` (`"Ops"` + mailbox letters) remains in committed code. `mustChangePassword` and the
new-device OTP are the only barriers. Already tracked as P1.

### W7 — Property picker "All my properties" (D15)

Explicit entry at the top of the picker, labelled with its count. `ADMIN`/`CORPORATE` see
`All properties (8)`; a scoped user sees `All my properties (2)` listing only theirs.
Mechanically this selects the existing null-cookie state that `resolveScopedPropertyIds` already
handles — the gap is purely that scoped users have no way to choose it. Single-property users still
see no picker.

### W8 — Issues filters (D10, D11)

Chips become `Open · Unassigned · Resolved` + `LOW MED HIGH URGENT`. The raw
`Object.values(IssueStatus)` loop is removed — it is what produced two chips both labelled "Open"
with different meanings (`app/issues/page.tsx:91` vs `:97`). `WONT_FIX` loses its chip and its
setter on the detail page; **the enum value stays** so existing rows render.

### W9 — Note-driven flagging + Teams (D12, D14)

`approveSubmission` is renamed **"No Error"** in the UI and refuses to run while any note exists —
whole-submission or per-field. Adding a note transitions `SUBMITTED → FLAGGED`. `flagSubmission`'s
existing note requirement and audit-log writes are reused.

On the transition to `FLAGGED`, post to the property's `checklistTeamsChannelId` via the working
Graph path (`lib/network/teams-graph.server.ts`). **When the channel is unset the notification is
skipped and logged to `notification_log`** — the feature ships without blocking on §Q4 and turns on
per property as Kate supplies IDs. A failure at one property never blocks another.

### W10 — Per-field reviewer notes (D13)

`ResponseNote` rows, authored from `/review/[id]`, rendered inline beside each answer regardless of
type. Visible to the submitter when the submission returns. No reply thread, no unread state, no
resolve loop — CLAUDE.md lists chat/messaging as out of scope and this deliberately stays short of
it. Bilingual EN+ES on the field-staff surface per ADR-013; the review surface stays English-only.

### W11 — `/review` in-page property filter

**A different gap from W7, not a duplicate of it.** W7 fixes the *header picker*. This fixes the
*page*: `app/review/page.tsx:30` accepts only `searchParams: { filter?: string }`, so property comes
from the header cookie alone. `shortCode` is already selected and rendered per row (`:62`, `:85`) but
is not filterable, and there is no property column heading — so a portfolio reviewer cannot see all
8 properties at once and group by property.

Add a property column and property filter chips beside the existing status tabs, taking a
`property` search param that composes with `filter`. Mirrors the shipped network ticket-filter
pattern (`lib/network/ticket-filters.ts`). Chips are drawn from `accessiblePropertyIds`, so a scoped
user sees only theirs. Scope stays enforced server-side through the same `scopeIds` the queue
already uses — a filter is a narrowing of what the user may see, never a widening.

This closes the ask recorded in CLAUDE.md as Bea's: `/completed` has on-page filters and `/review`
has none, which is what she was reacting to. **Verified 2026-09-01** — `Export PDF` already exists at
`app/review/[id]/page.tsx:180`, so that half of her feedback needs no work; only bulk/zip export is
genuinely missing, and that stays out of scope (§A7, P2).

---

## 5. Testing

- **Unit (Vitest):** name composition across all five scope-token kinds; batch expansion
  `subjects × dates`; `planRoomInstances` duplicate detection (already written, 15 green); the
  `TemplateScope` and `InstanceMultiplicity` exhaustiveness tests; `canManageTemplate` across all
  8 roles.
- **Integration:** create a 2-batch draft, reopen it, create from it, assert instance count and that
  a draft creates **zero** instances; assert a note flips `SUBMITTED → FLAGGED`; assert a Teams post
  with no channel logs `SKIPPED` and does not throw.
- **Playwright:** the wizard end to end — 3 rooms × 2 dates → 6 instances with the expected names.
- **Migration:** applied to prod **before** the deploy that needs it and verified via
  `information_schema`, per the 2026-08-22 pattern. All changes are additive and nullable, so
  rollback is code-only (`vercel promote`); the migration stays.

## 6. Out of scope

Paycom shift data · occupancy / OOO sync · reply threads on notes · contractor-filled checklists
(§Q31) · per-property question variants inside one template · removing the `WONT_FIX` enum value ·
the Network device/ticket orphan fixes (separate work — `NetworkOrphanQueries_RISE8_083126.sql`).

## 7. Open items — carried, not resolved

1. **`Daily Contractor Checklist`** — contractor identity was deleted by ADR-028 and §Q31 recommends
   dropping contractor checklists from v1. It can exist as a template an **employee** fills *about* a
   contractor; it cannot be a checklist a contractor fills. Designed as `PER_PROPERTY` + `PER_TASK`
   on that basis. **Confirm with Kyle.**
2. **Frequency and scope unconfirmed** for `Lock Installation` and `Stayable Renovation Completion` —
   assumed `PER_ROOM` + `ONE`.
3. **§Q4 Teams channel IDs** — owed by Kate. W9 ships dark without them.
4. **Real question content for all 31 templates** — owed by Karla / Christopher. This spec builds the
   shelf; it does not fill it. **Still the hard blocker for cutover.**
5. **Current roles of the six** named people are unverified, and `jj@rentstayable.com` may not exist.
6. **`MAX_INSTANCES_PER_CREATE = 400`** is my number, not Kyle's. Cheap to change.
7. **There is no `AM` (Area Manager) role.** `Role` is `HK · PA · MT · MANAGER · CORPORATE · ADMIN ·
   NETWORK_TECH · AGENT`, so `Property Inspection — per AM` has no assignee pool to draw from. Three
   ways out, none chosen: draw from `CORPORATE` (area managers span properties, so this is the
   closest fit and needs no schema change); draw from `MANAGER` (wrong — a property manager is not an
   area manager); or add an `AM` role, which touches `rbac.ts`, `role-display.ts` and the
   exhaustiveness tests. **Needs Kyle's call before W2 seeds this template.**
8. **The sequential write loop is unmeasured at scale.** No wrapping transaction (by design, see W4),
   so 400 instances is 400 round trips plus retries, against a Neon instance that autosuspends. Time
   one full-property create before trusting `MAX_INSTANCES_PER_CREATE = 400`; if it is slow the fix
   is chunking with progress, not a transaction.
9. **The working tree is mid-port and manual per-room create is currently BROKEN there.**
   `actions.ts` takes `roomIds: string[]`; `ManualCreateClient.tsx` is still `main`'s version and
   posts singular `roomId`, so the Zod schema defaults `roomIds` to `[]` and every `PER_ROOM` create
   fails with *"This checklist is per-room — select at least one room."* **Typecheck passes** — the
   mismatch is across the form boundary, so types do not catch it. Nothing committed, nothing
   deployed. W4 closes this by replacing the client; until then the tree is not runnable for that
   flow.
