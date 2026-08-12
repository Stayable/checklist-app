# Contractor update fan-out — app-side readiness review

**Reviews:** `docs/ContractorUpdateFanout_Contract_081226.md` (read-only mirror; canonical copy lives in
`Stayable/contractors-update-whatsapp`).
**Scope of this document:** what the contract means *for this repo*, checked against the code and the
production database rather than against the contract's own description of them. Nothing here changes
the contract. Two findings are corrections that belong back in the canonical copy and are marked
**→ upstream**.
**Date:** 08/13/26. Nothing is built on either side.

---

## Verdict

The contract is implementable here and its two hardest calls — keying on `(workDate,
contractorPhone)` instead of `smartsheetRowId`, and deleting the sync's update path rather than
leaving it dormant — are both right, for the reasons it gives.

**But its central resolution key does not exist in this database.** §7 says *"Contractor identity is
the phone number. `Contractor.phone` / `.whatsapp` already exist."* The columns exist. The values do
not: **0 of 13 contractors in production have either.** Verified 08/13/26 against `ep-summer-cloud`
with `scripts/check-contractor-identity.ts` (read-only).

That is not a code problem and no amount of receiver quality fixes it. It is **F1** below, and it
should become a precondition of §10 step 4 before anyone points the pipeline at production.

---

## F1 — The resolution key is empty in production · **blocker, data not code**

```
contractors: 13
  with phone:    0
  with whatsapp: 0
```

All 13 came from `scripts/import-contractor-schedule-0810-0814.ts`, which states the reason at line
31: *"Contractors are created with NO phone and NO whatsapp per Kyle (2026-08-11, 'will add later')."*
It is a known gap, not an accident — but the contract was written as though it were already closed.

**Why it is worse than a missing field.** §7's rule is *phone first, name second*. With phone empty,
**every** update on day one takes the name path — the exact path §7 calls unsafe, citing the
schedule's own variants (`Joycer A. Parra Munoz` vs `Joycer Antonio Parra Munoz`, `Ronal S.` vs
`Ronal Stevent`). This roster holds the long forms (`Joycer Antonio Parra Munoz`, `Ronal Stevent
Rojas Mora`). Whether an exact-string match succeeds therefore depends on two rosters, maintained in
two repos, agreeing character-for-character — and **nobody has diffed them.** §2 and §11 already
concede those lists can drift; §7 then quietly depends on them not having.

**And the failure is silent by construction.** No job resolved → `ContractorDailyNote` (§7) → the
calendar is unchanged and nothing errors. That is precisely the ambiguity §10.6 warns about:
*"silence looks the same as success from the outside."* A week could pass looking fine.

**What closes it, in order:**

1. Backfill the 13 numbers in **E.164**. The pipeline's Table Storage allowlist is keyed by exactly
   that; this repo has no source for them. It is a cross-repo data hand-off, not a build task.
2. Normalize on both sides before comparing. This repo has **no phone-normalization helper** and no
   unique constraint on `Contractor.phone` — `(904) 555-1234` and `+19045551234` are different
   strings today. Store E.164, compare E.164.
3. Diff the two rosters once, by hand, before step 4 of §10. Thirteen names.
4. Have the receiver **report** a name-path match rather than accept it quietly — the note should say
   which key resolved the job, so a phone-less roster is visible in the notes instead of inferred
   from an unchanged calendar.

Until (1), a `ContractorDailyNote` fallback rate near 100% is the *expected* outcome, and step 4 of
§10 ("watch one real crew message end to end") would be watching the fallback path, not the feature.

---

## F2 — There is no generic webhook-source enum to add a value to

§4: *"The app persists the raw body to `RawWebhookPayload` … with a new `source` value, exactly as
the UniFi receiver does."*

`RawWebhookPayload.source` is typed **`DeviceSource`** (`schema.prisma:711`), and `DeviceSource` is
`UNIFI_PROTECT | UNIFI_NETWORK | ARUBA` — a *device* enum, also carried by `Device` and consumed by
the network device labelling and filters. A `CONTRACTOR_UPDATE` value in it is a non-device value in
a device enum, reachable from every place that enumerates device sources.

Two honest options:

| | |
|---|---|
| **(a)** Introduce `WebhookSource` and widen the column | Correct modelling, but it retypes a column on a table two live receivers write to. A type change under a running ingest path, for a feature that has no traffic yet |
| **(b) Recommended.** Give the fan-out its own capture row | No shared table, no enum edit, no risk to the network receivers — and it is needed anyway for **F3** |

(b) means the contract's "exactly as the UniFi receiver does" describes the *discipline*
(capture-before-trust, unconditionally, including unparseable bodies) rather than literally the same
table. The discipline is what matters and it is preserved.

**→ upstream:** §4 should say "capture before trust" without naming `RawWebhookPayload`, since that
table's `source` column cannot express a non-device source.

---

## F3 — The idempotency constraint cannot sit on the capture row

§4 says capture **before** parsing. §5 says enforce `messageSid` uniqueness **with a unique
constraint, not a `findFirst`**. Put those on the same row and the second delivery of a retried
message throws on insert *before* any code can decide it is a duplicate — a 500 at exactly the moment
Twilio is retrying, which produces more retries.

Separate the two concerns:

- **Capture row** — written unconditionally, no unique constraint, keeps every delivery including
  duplicates and unparseable bodies. This is the forensic record.
- **Applied row** — `ContractorUpdate`, `messageSid @unique`, written **inside the same transaction**
  as the note and any status change. Its presence is the answer to "has this already been applied?"

The transaction is the point: with the unique row and the effects committing together, a crash
between them cannot leave a `messageSid` marked done with no note written. §5's "two queue workers
can overlap" case then resolves in the database — the loser hits the unique violation, catches it,
and returns `200 {"ok":true,"duplicate":true}` per §5. No advisory lock needed (unlike
`mass-outage.server.ts`, which needs one because its uniqueness is a *time window*, not a key).

That row is also where `smartsheetRowId` should live for traceability. §7 says store it in
`auditLog`; a dedicated column on the update row is queryable and cannot be confused with the
`sourceRowId → jobId` link the plan loader already writes to `auditLog` and depends on (§10.6).

---

## F4 — `DELAYED`'s blast radius is larger than §8 lists, and one shape of it is silent

§8 names three touchpoints. There are more, and they split cleanly by whether the compiler catches
them:

**Caught by typecheck** — `JOB_STATUS_LABELS` is `Record<ContractorJobStatus, string>`
(`lib/contractors.ts:48`). Forget it and the build fails. Safe.

**Silent** — the plain `ContractorJobStatus[]` arrays. They compile fine while omitting the new value:

| Array | Used as | Effect of omitting `DELAYED` |
|---|---|---|
| `OPEN_JOB_STATUSES` | `status: { in: … }` — `schedule/page.tsx:98` (**the backlog rail**), `daily/page.tsx:90,93` (unscheduled + urgent tiles) | A delayed job **disappears** from the backlog rail and stops counting as urgent-open |
| `JOB_STATUS_ORDER` | the status `<select>` — `JobControls.tsx:79` | No one can set `DELAYED` by hand; only the fan-out can produce it |
| `TERMINAL_JOB_STATUSES` | `status: { notIn: … }` — `daily/page.tsx:77` | **Correct as-is.** `DELAYED` is non-terminal (§8.2), and `notIn` includes it automatically |

The general rule, worth stating once because it will recur with the next enum value: **an `in` list
silently excludes a new value; a `notIn` list silently includes it.** Adding `DELAYED` is a no-op
everywhere it is `notIn` and quietly wrong everywhere it is `in`.

**So the enum change ships with a test**, not just a migration: assert every `ContractorJobStatus`
value appears in `JOB_STATUS_ORDER` and in exactly one of `OPEN_JOB_STATUSES` / `TERMINAL_JOB_STATUSES`.
Cheap, and it closes the class rather than this instance.

`isOverdue` needs no change — it takes `isTerminal` as a boolean derived from `isTerminalJobStatus`,
so a delayed job in the past correctly reads as overdue.

**→ upstream:** §8.1 says *"the calendar needs a status colour for it."* There is **no per-status
colour map** — `CalendarGrid.tsx` renders `jobStatusLabel(job.status)` and branches only on
terminal/overdue. Nothing to extend; one less task than the contract thinks.

---

## F5 — §8.3's `STATUS_MAP` risk is real, and it forges history as well as reverting status

§8.3 warns the sync would "silently revert" delayed jobs. Traced through
`sync-contractor-schedule-from-smartsheet.ts` it is worse in kind, not just degree. With `STATUS_MAP`
still mapping `Delayed → PLANNED`:

1. `target` = `PLANNED`, job is `DELAYED` → `target !== job.status` (line 200) → a **status change** is
   queued.
2. Applying it writes a `SYSTEM` note: *"Status changed to PLANNED — Smartsheet now says
   \"Delayed\"."* (line 347).

So the next sync run does not merely lose the state — it appends an untrue sentence to an
**append-only** note thread, attributed to the sheet, which cannot then be edited or removed. §8.3's
instruction to change `STATUS_MAP` in the same commit is therefore not tidiness; it is the difference
between a recoverable field and a permanent false record.

One consequence the contract does not mention: once `Delayed → DELAYED`, the `source-status-note`
branch (line 212, "both map to the same app status") stops firing for Delayed. That branch exists
only because the enum could not express it. Leave the code — `Pending`/`Off` pairs could still hit
it — but it goes quiet, and that is the intended outcome, not a regression.

---

## F6 — What if `(workDate, contractor)` matches more than one job? · **open, small**

§7 asserts the key is unique, verified across the pipeline's populated rows. That holds for
sheet-derived rows. It is not an invariant **here**: `/maintenance/jobs/new` lets a manager create a
second job for the same contractor on the same day by hand, and no constraint prevents it. Prod today
has 65 jobs, all assigned, 0 unassigned — no collision yet, but nothing stops one.

The contract does not say what to do. Recommendation: **do not guess.** Two matches → append the note
to *neither* job's status, write a `ContractorDailyNote` naming both job ids, and report it. A wrong
guess writes a crew's report onto the wrong job, which is worse than an unresolved note a human can
place. Cheap to decide now, expensive to discover later.

---

## F7 — §9.3 confirmed: `TRADE_BY_TASK` throws, and it will

`sync-…ts:90` throws on unrecognized task text. Gerardo writes free text weekly, and the map holds
ten literal strings. §9.3 is right that this does not affect the fan-out (which never creates jobs) —
but §10.6 makes the `create` path **the only thing loading a week into the calendar**, so a throw
there stops the whole week, not one row. Default to `GENERAL` and note it, as §9.3 recommends. Do it
during the §10.6 strip, not after.

---

## Build order

Sequenced so the hard part is testable without HTTP, and so nothing touches production before F1 is
closed.

| # | Step | Why here |
|---|---|---|
| 0 | **Backfill the 13 phone numbers (E.164)** + diff the two rosters | F1. Blocks meaningful proof, not code. Start it first because it is someone else's data |
| 1 | **One additive migration:** `DELAYED` on `ContractorJobStatus`, new `ContractorUpdate` table (`messageSid @unique`, raw body, resolution outcome, `smartsheetRowId`) | F2 + F3 + F4 in one DB change. Additive ⇒ **DB first, then code** |
| 2 | **`lib/contractor-update.ts` — pure.** Zod payload schema, `contractVersion` gate, E.164 normalization, `Delayed → DELAYED` mapping, and a **decision function** returning a discriminated union: `duplicate` · `unsupported-version` · `apply-status` · `note-only` · `daily-note` · `ambiguous` | Every rule in §7, §8 and §12 becomes a table-driven unit test with no database and no HTTP. This is where the feature actually lives |
| 3 | **`STATUS_MAP` + the status arrays + the exhaustiveness test**, same commit as the enum reaching any environment | F5. A gap between step 1 and this one is the window where a sync run forges notes |
| 4 | **The route** — capture, verify HMAC (`lib/network/hmac.ts` unchanged), call the pure decision, apply in one transaction | Thin by then. Fail-closed on unset secret in production, matching the UniFi receiver |
| 5 | **Prove on preview** with a replayed payload (§10 steps 1–3) | Never point the pipeline at production first |
| 6 | **§10.6 strip** — reduce the sync to its `create` path, rename it a plan loader, fix `TRADE_BY_TASK` (F7) | Only after a full week including a rollover (§10 step 5) |

Steps 2 and 3 are the ones worth doing carefully. Step 4 is mechanical if step 2 is right.

---

## Points where this repo owes the canonical copy a correction

Both are small and neither changes a decision:

1. **§4** — `RawWebhookPayload.source` is a *device* enum; the fan-out cannot add a value to it. Say
   "capture before trust" without naming the table (F2).
2. **§8.1** — there is no per-status colour map on the calendar to extend (F4).

Per the mirror's own banner: change them in `Stayable/contractors-update-whatsapp` and refresh the
copy here. Do not edit the mirror.
