# S1 — Review Workflow Upgrade — Implementation Plan

**Epic:** StayCheck v1.1 · **Phase:** S1 · **Spec:** `docs/superpowers/specs/2026-07-02-staycheck-v1.1-adaptation.md` (§2 items 1–2, §1 "Manager review")
**Status:** ✅ **LOCKED — design approved by Kate 2026-07-25** (answers in `StayCheckS1DesignQueries_RISE8_072426_reviewed.md`). Ready for subagent-driven execution.
**Cadence:** subagent-driven, each task spec+quality reviewed, final Opus whole-branch review before merge (same as Plans 1–5).

---

## Locked decisions (Kate)

| Q | Decision | Build impact |
|---|---|---|
| **Q1 Completion Check** | **Manager, manual at review** (A) | Pass/Fail control in the review rail; auto-derive shown as a hint only. |
| **Q2 Flags who/when** | **Staff capture at fill → manager confirms at review** (B) | ⚠️ Bigger than rec. Flag capture UI in the **field-staff fill flow** (→ **bilingual EN+ES**, ADR-013) + persisted at submit + manager can edit/confirm at review. |
| **Q3 Flags storage** | **Dedicated columns** (A) | Fixed columns on `ChecklistInstance`. |
| **Q4 Unlock** | **Admin-only, audited** (A) | Verify locks; `requireAdmin` unlock, audit-logged. |
| **Notes** (extra) | **Not every review note notifies staff** | Add an "internal note" path: manager chooses whether a note is sent to the submitter. Internal notes are stored + manager-visible but do **not** notify. |

### Two consequences worth calling out
- **Q2=B makes flags field-facing → Spanish is required.** Under the (rejected) manager-only option flags would've been English-only manager UI. Because staff now capture them while filling, all flag labels/help are field-staff surfaces and must ship EN+ES (ADR-013).
- **"Manager confirms" = manager can edit the staff-set flag values at review; the values lock at Verify.** No separate per-flag confirmation state needed — review + optional edit + verify-lock is the confirmation.

---

## What's already done (adjust, don't rebuild)
- Review-note → submitter notification exists (`approveSubmission`/`flagSubmission`/`requestRedo` in `app/review/actions.ts`: `audit_log` + `logNotification` IN_APP + post-commit `deliverNotificationEmail`, bilingual). **Delta:** gate it behind the new internal/staff toggle, and add the verify event.
- Three-column review UI, `managerNote`, `reviewedAt`/`reviewedByUserId`, Approve/Flag/Re-do.

---

## Schema delta — one additive migration `add_s1_review_upgrade`

`ChecklistInstance`:
- `completionCheck CompletionCheck?` — new enum `CompletionCheck { PASS FAIL }`.
- `verifiedByPm Boolean @default(false)`, `verifiedAt DateTime? @db.Timestamptz`, `verifiedByUserId String? @db.Uuid` (+ `User` relation `"InstanceVerifier"`), `lockedAt DateTime? @db.Timestamptz`.
- Flags (Q3=columns): `notifyCorporate Boolean @default(false)`, `returnDeposit Boolean @default(false)`, `itemsToReplace Boolean @default(false)`, `itemsToReplaceList String?`, `placeOOO Boolean @default(false)`.
- `roomLabel String?` — free-text room (PRD §17/§24: "-", "Suite").

`ChecklistTemplate`:
- `collectsCheckoutFlags Boolean @default(false)` — gates whether the flag-capture block appears in the fill flow + confirm block at review. Admin/manager toggles it in the template builder; on for Departure/checkout-type templates, off elsewhere (a Roof PM shouldn't show "return deposit").

Notes intent: **no schema needed** for internal-vs-staff notes — the review action takes a `notifyStaff` flag and conditionally calls `logNotification`/`deliver`. `managerNote` still stores the text; notification_log presence records whether staff were told.

All additive/nullable/defaulted → safe. **Now applies to the dedicated prod DB** (`ep-summer-cloud`, post-split 2026-07-25) via `prisma migrate deploy` sourcing `.env.production.local`; local/Preview stay on the dev DB.

---

## Tasks

### Task 1 — Schema + migration + client regen
Add the enum + `ChecklistInstance` columns + `ChecklistTemplate.collectsCheckoutFlags` to `schema.prisma`; `prisma migrate dev --name add_s1_review_upgrade`; `prisma generate`. No logic. **Verify:** typecheck, migration applies clean.

### Task 2 — Immutability core (pure + enforced)
- `lib/review-lock.ts` — pure `isLocked({lockedAt})` + `assertUnlocked`. Unit-tested.
- Enforce in `app/review/actions.ts` (approve/flag/redo/verify) **and** the fill submit/resubmit action: locked → reject before any mutation. Re-do on a locked instance is impossible by construction.
- **Verify:** vitest on `isLocked`; every mutation path checks it.

### Task 3 — Verify + admin unlock + internal/staff note toggle
- `verifySubmission(instanceId, {note?, notifyStaff})`: requires status `REVIEWED`; sets `verifiedByPm`, `verifiedAt`, `verifiedByUserId`, `lockedAt=now`; `audit_log action="verify"`; notifies submitter **only if `notifyStaff`** via a new `review_verified` event.
- `unlockSubmission(instanceId)`: `requireAdmin`; clears the 4 verify fields; `audit_log action="unlock"`.
- **Note toggle across all review actions:** add `notifyStaff` param to approve/flag/redo/verify. **Re-do always notifies** (instructional — staff must act); approve/flag/verify honor the toggle (default: internal/off for approve+verify, on for flag — confirm during build). When off, store `managerNote` but skip `logNotification` + `deliver`.
- New `review_verified` copy in `lib/notify-copy.ts` (EN+ES).
- UI: "Verify" button + verified badge + (admin) "Unlock" + a "Send to staff" checkbox on the note control in `app/review/[id]/ReviewActions.tsx`; locked state disables Approve/Flag/Re-do.
- **Verify:** typecheck/lint; action-guard + toggle reasoning.

### Task 4 — Completion Check (manager, manual)
- Pass/Fail control in the review left rail; persisted on approve or a dedicated `setCompletionCheck` action; `audit_log`. Show the auto-derived hint beside it.
- `lib/completion-check.ts deriveCompletionCheck(responses, questions)` (hint now; reusable). Unit-tested.
- **Verify:** vitest on the derive helper; UI persists + audits.

### Task 5 — Structured flags: staff capture → manager confirm (Q2=B, biggest task)
- **Fill flow (field staff, bilingual EN+ES):** when the instance's template has `collectsCheckoutFlags`, render a flag block — 4 checkboxes + `itemsToReplaceList` text (shown only when `itemsToReplace`). Threads through the draft (IndexedDB) like other answers.
- **Submit action:** persist the 5 flag columns on the instance (validate `itemsToReplaceList` only when `itemsToReplace`).
- **Review (manager):** show the staff-set flags; manager can edit/override; values lock at Verify (Task 3). Display flags on review detail + `/completed` row + dashboard-ready.
- `placeOOO=true` is captured + stored now but **room-lifecycle wiring is S2** — leave a typed hook, don't transition room state here.
- **Verify:** typecheck/lint; round-trip staff→DB→review; ES strings present; audit on manager edits.

### Task 6 — Free-text room label
- `roomLabel` fallback everywhere the room shows: review queue/detail, `/completed`, Today, PDF, `label()` in review actions (`room?.roomNumber ?? roomLabel ?? ""`).
- Settable in manual-create (`/checklists/new`) when no `Room` is chosen.
- **Verify:** fallback covered; no `Rm undefined`.

### Task 7 — i18n sweep + final review
- All field-facing new copy in `messages/en.json` + `messages/es.json`: **flag block (Task 5)**, any fill-flow strings, `review_verified` staff notification. Manager/admin-only controls (verify button, completion-check, unlock) stay EN.
- Full test run + typecheck + lint + build; Opus whole-branch review; fix wave.

---

## Out of scope for S1 (later phases)
- Room lifecycle state machine + Room Status Board + Checkout Queue → **S2** (`placeOOO` leaves a hook here).
- Quality Score / Completion Rate → **S5** (consumes `completionCheck` + `verifiedByPm`).
- Cloudbeds → **S3**.

## Risks / open build-time details
- **Default of the `notifyStaff` toggle per action** — proposed above; confirm with Kate if the defaults feel wrong.
- **Which templates get `collectsCheckoutFlags`** — admin sets per template; ensure the migrated Departure template defaults on if desired (row-count-confirmed, like the placeholder-template handling).
- Prod DB is now dedicated — migration is still additive/safe, apply with `migrate deploy` against `.env.production.local` at deploy time.
