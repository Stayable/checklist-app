# StayCheck v1.1 — Adaptation Spec

**Adapts:** `StayCheckPRD_RISE8_070126.md` (Kate, v1.1, 2026-07-01) onto the **live** RISE8 Operations Platform (prod at https://ops.rentstayable.com).
**Author:** Claude Code · **Date:** 2026-07-02 · **Status:** Draft for Kate review
**Supersedes framing of:** `docs/PRD.md` where they diverge (this doc wins for StayCheck-era scope). New ADRs 022–02x below.

---

## 0. Three settled forks (Kate, 2026-07-02)

| Fork | Decision | Consequence |
|---|---|---|
| **Cloudbeds PMS** | In scope. Kate provisions a **read-only API key per property (8)**. Build **manual-first room-status model + Cloudbeds as a pluggable sync adapter**. | Reverses ADR-009 "no PMS in v1". Room lifecycle logic is testable without the vendor; one property's key failing never blocks others. → **ADR-022**. |
| **Role model** | PRD's 3 roles (Admin/Manager/Staff) are a **display grouping**; keep the 6-value `Role` enum in DB. | No migration, no RBAC rewrite. Add `lib/role-display.ts`: `HK\|PA\|MT → Staff`, `MANAGER → Manager`, `CORPORATE\|ADMIN → Admin`. AM/PM shift logic keeps PA distinct. → **ADR-023**. |
| **Product name** | Rename end-user product to **StayCheck**. | Supersedes ADR-010 ("Stayable Operations"). UI/emails/PDF wordmark → StayCheck. Internal repo name unchanged. → **ADR-024**. |

**Not a conflict:** PRD's Quality Score is a Pass/Fail *quality metric*, not bonus pay (bonus scrapped, ADR-014). Compatible.

---

## 1. Gap analysis — PRD section → current system

### A. Already built — extend, don't rebuild
| PRD § | Have today | Delta to close |
|---|---|---|
| §2, §22 Templates | `ChecklistTemplate` + `Question` (11 types) + builder + `version` int | Version **snapshot** (see §2 gap), condition-rating type, asset-tag field, AM/PM shift field, Lease-Flip type, starter library |
| §4, §6 Photo capture | In-app capture, client GPS, geofence, R2, no camera-roll, `capturedAt` | Per-photo annotation; before/after compare; per-room gallery |
| §5 Manager review | `/review` queue + 3-col detail, Approve/Flag/Re-do, `managerNote`, audit | **Completion Check Pass/Fail**, **Verified-by-PM** checkbox, **immutability after verify**, review-note → staff notification |
| §7, §20 Issues | `Issue` + SLA + resolution note/photo, auto-issue from PASSFAIL | Structured submission flags, work-order lifecycle, recurrence detection (→ Maintenance Ticketing, §Ticketing) |
| §3 Assignment | Recurrence engine + 5 AM cron + `/rules` | Bulk-create UI, PM interval scheduling (distinct from calendar recurrence), checkout/arrival triggers |
| §13, §14 Reports/Dash | `/dashboard` (5 tiles) + `/reports/*` + PDF | Property tiles w/ health, checkout queue, PM compliance, leaderboard, per-role dashboards |
| §1, §11 RBAC | 6-role RBAC, `user_properties`, property scope | 3-role display mapping only |

### B. Net-new modules (build from scratch)
- **Room lifecycle**: `RoomStatus` enum today = `OCCUPIED\|VACANT\|OOO`. PRD §19 needs 9 states (Occupied, Checkout, Cleaning, Clean, Arrival Pending, Arrival In Progress, Ready, OOO, PM Due). → Room Status Board + Checkout Queue.
- **Cloudbeds sync adapter** (§3, §16).
- **Preventive Maintenance module** (§18) — asset registry, interval-from-last-completion scheduling, condition ratings, corrective-action → issue bridge.
- **Staff Performance / Quality Score** (§12) — scoring, cards, leaderboard, benchmarks, consistency score.
- **Insights engine** (§15) — recurring issues, timing anomalies, failure patterns, shift coverage gaps, property health trend, PM insights.
- **Maintenance Ticketing / Work Orders** (§20 + incoming `.md`).
- **Smartsheet export** (§16) — column-parity CSV export (additive; does not revive write-through).
- Full **offline sync** hardening (§21) + conflict notice.
- **Push notifications** (§9) — currently email-only.

### C. Data-model notes to honor (PRD §17/§24)
- Room field must accept **free text** (`"-"`, `"Suite"`). Current `Room.roomNumber` is `String` ✓; instances allow `roomId` null + free-text room on batch — need a free-text room field on instance for non-`Room` labels.
- Start = completion time → flag as data-quality, exclude from averages (Insights §15).
- Week/Month auto-computed from date, never stored numeric.
- Map "Completion Check" + "Employee Bonus" columns → single `completionCheck` field.

---

## 2. Key schema deltas (additive migrations, shared prod DB)

> All additive; no destructive changes. Prod shares the dev Neon DB — **split prod/dev DB before enabling any Cloudbeds cron** (existing open item).

1. **Review upgrade** — `ChecklistInstance`: `completionCheck` enum `PASS\|FAIL\|null`, `verifiedByPm Boolean`, `verifiedAt`, `lockedAt` (immutability stamp). New enum `CompletionCheck`.
2. **Structured flags** — `ChecklistInstance` (or a `submission_flags` sidecar): `notifyCorporate`, `returnDeposit`, `itemsToReplace Boolean` + `itemsToReplaceList` text, `placeOOO`. Alternatively model as reserved question types on templates; **decision needed** — recommend dedicated columns (they drive dashboards/reports, not per-template).
3. **Room lifecycle** — new `RoomLifecycleStatus` enum (9 states) as a **derived/cached** field on `Room` (`lifecycleStatus`), computed from occupancy + checklist status; keep existing `RoomStatus` for occupancy source. Add `Room.commonArea Boolean` for PM areas.
4. **Cloudbeds** — `CloudbedsConnection` (per-property: `propertyId`, encrypted key ref, scopes, lastSyncAt, status); `CheckoutQueueEntry` (property, room, cloudbedsReservationId, checkedOutAt, scheduledFor?, status `PENDING\|SCHEDULED\|DISMISSED`).
5. **PM module** — `Asset` (property, room?/commonArea, type, tag e.g. "PTAC – Rm 277"); `PmSchedule` (asset/scope, intervalDays, lastCompletedAt, nextDueAt); PM answer fields on responses: condition rating, corrective-action text, parts-needed list. Condition rating = new `QuestionType.CONDITION` (`GOOD\|NEEDS_ATTENTION\|OUT_OF_SERVICE`).
6. **Template versioning snapshot** — instances must bind to the question set as it was at generation. Options: (a) `TemplateVersion` table snapshotting questions JSON, instance FK to version; (b) copy questions into instance at creation. **Recommend (a)**. Closes PRD §2 "historical submissions stay linked to version used."
7. **Shift** — `ChecklistTemplate.shift` enum `AM\|PM\|null`.
8. **Lease-Flip** — no schema change; a distinct template (`code=LSF`) with its own benchmarks; manual trigger only.
9. **Ticketing** — extends `Issue` (already has status lifecycle, assignee, SLA, resolution photo). Add `targetCompletionDate`, recurrence linkage. Full shape from incoming `.md`.
10. **Drop dead field** — `ChecklistInstance.bonusEligible` (ADR-014). Include in the first StayCheck migration.

---

## 3. Cloudbeds integration — API-key scopes Kate should create

Cloudbeds issues credentials **per property** (each Stayable property = its own Cloudbeds property/account), which matches "generate for each property (8)". Create **read-only** keys — StayCheck never writes back to Cloudbeds.

**Requested scopes (verify exact scope names against current Cloudbeds API docs at build time — do not assume):**
- Reservations read (check-in / check-out / status) — drives Checkout Queue + Arrivals trigger.
- Rooms / room assignments read — room numbers, reassignment detection.
- Property/hotel read — property metadata.
- **Webhooks** (preferred over polling): subscribe to reservation lifecycle events (`created`, `status_changed` incl. checkout/checkin, `deleted`, room reassignment). Polling fallback if webhooks unavailable on the plan.

**No write scopes. No guest PII beyond room mapping unless a checklist needs guest name.**

Adapter design: `lib/cloudbeds/` — normalize each property's feed into internal `CheckoutQueueEntry` / arrival events. Per-property failure isolated + logged to `notification_log`. Manual room-status model (S2) is the source of truth; Cloudbeds is an input.

---

## 4. Phase plan (S-series — layered on the live platform)

Ordered by dependency. Priority is flexible — **Ticketing (S7) and Cloudbeds (S3) can be pulled earlier** if ops value demands. Each phase = subagent-driven, spec+quality reviewed, final Opus whole-branch review before merge (same cadence as Plans 1–5).

| Phase | Title | Depends on | Core deliverables |
|---|---|---|---|
| **S0** | Foundations & rename | — | ADRs 022–024; `lib/role-display.ts` (3-role mapping); StayCheck rename (UI/email/PDF wordmark); drop `bonusEligible`; **prod/dev DB split** |
| **S1** | Review workflow upgrade | S0 | Completion Check Pass/Fail; Verified-by-PM; immutability-after-verify (+audit); structured submission flags; review-note → staff notification; free-text room on instance |
| **S2** | Room lifecycle (manual-first) | S1 | 9-state room lifecycle (derived); **Room Status Board**; **Checkout Queue** (manual entry); OOO wiring from checklist flags |
| **S3** | Cloudbeds sync adapter | S2 | `CloudbedsConnection` + `lib/cloudbeds/`; webhook/poll → checkout queue + arrivals trigger; room-reassignment rules (§3); per-property isolation |
| **S4** | Preventive Maintenance | S1 | `Asset` registry; interval-from-last-completion scheduling; `CONDITION` question type; PM submission fields; corrective-action → Issue bridge; PM dashboard/compliance |
| **S5** | Staff Performance & Quality Score | S1 | Scoring (`Quality Score` = pass ÷ verified; `Completion Rate` = submitted ÷ assigned); per-staff cards; leaderboard; benchmarks; consistency score; staff self-view; outlier flags |
| **S6** | Insights engine | S4, S5 | Recurring issues tracker; Completion-Check failure patterns; timing anomalies (auto-flag <min duration, start=complete, identical photo timestamps); property health trend; shift coverage gaps; PM insights |
| **S7** | **Maintenance Ticketing / Work Orders** | S1 | See §Ticketing below — **detailed from Kate's incoming `.md`** |
| **S8** | Reports + export + photo tooling | S5 | Report suite (§13); Smartsheet column-parity CSV export; before/after compare; per-room photo gallery; PDF parity |
| **S9** | Offline + push + versioning + library | S1 | Full offline sync + conflict notice; push notifications; template version-snapshot; starter template library; Lease-Flip type; AM/PM shift on PA templates |

---

## Ticketing — Maintenance Ticketing / Work-Order System (S7) — FRAMEWORK (pending Kate's `.md`)

> Kate is sending a dedicated `.md` from another chat. This section is the **integration frame**; fill in from that doc. Do not build until it lands.

**Anchor:** PRD §20 "Issue Resolution & Work Order Tracking (Phase 1.5)". Builds **on the existing `Issue` model** (already has `status` lifecycle OPEN→ASSIGNED→IN_PROGRESS→RESOLVED/WONT_FIX, `assignedUserId`, `slaTargetAt`, `resolutionNote`, dual-owner resolution `Photo`).

**Known requirements from PRD §20 (extend when `.md` arrives):**
- Assign issue → responsible person + **target completion date** (add `targetCompletionDate` to `Issue`).
- Lifecycle Open → In Progress → Resolved (have it; confirm mapping to ticket states in `.md`).
- **Closing photo required** to mark resolved (resolution-photo capture already exists — enforce required-on-close).
- **Recurrence**: same issue on same room within 60 days → auto-flag recurring (overlaps Insights §15 recurring-issues tracker — build once, share).

**Open integration questions to resolve against the `.md`:**
1. Is "ticket" a new entity or the existing `Issue` renamed/extended? (Recommend extend `Issue` unless the `.md` needs a separate work-order object with its own numbering.)
2. Sources: only checklist-flagged issues, or manually-raised tickets too? (PRD Quick Tasks are separate per ADR-012 — clarify boundary.)
3. Assignment pool — MT role only, or any user? SLA vs target-date relationship.
4. Notifications on assignment / due / overdue (push + email).
5. Parts/materials tracking from PM corrective actions → ticket line items?

**Placeholder tasks (refine on receipt):**
- [ ] Ingest Kate's ticketing `.md`; reconcile with `Issue` model + this frame
- [ ] Decide entity: extend `Issue` vs new `WorkOrder`
- [ ] Schema delta (target date, recurrence link, ticket #, states)
- [ ] Ticket board UI (kanban or list by status) + assignment + due dates
- [ ] Required closing photo enforcement
- [ ] Recurrence auto-flag (shared with Insights)
- [ ] Notifications (assign/due/overdue)

---

## 5. What I need from Kate to unblock

1. **Cloudbeds API keys** — create per-property read-only keys with the §3 scopes; drop them (or a secrets-vault ref) so S3 can start. (S2 does not need them.)
2. **The maintenance ticketing `.md`** — unblocks S7 detail.
3. **Structured-flags modeling** — confirm dedicated columns (recommended) vs reserved question types (§2 item 2).
4. **Prod/dev DB split** — required before any Cloudbeds cron writes; existing open item, now hard-blocking for S3.
5. Confirm this **S-phase order** or re-prioritize (Ticketing / Cloudbeds pull-forward candidates).
