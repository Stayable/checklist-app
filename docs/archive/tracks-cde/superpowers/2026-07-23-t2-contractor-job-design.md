# T2 — Minimal Contractor Job — Design Spec

**Date:** 2026-07-23
**Component:** II.A — Contractor Dispatch MVP (ADR-025)
**Depends on:** T1 — Contractor directory (commit `0f86b2b`, `Contractor` / `ContractorProperty` / `Trade`)
**Feeds:** T3 (match & rank) · T4 (one-tap WhatsApp dispatch)
**Status:** Design approved (Kyle, 2026-07-23). Not yet planned/built.

---

## 1. Purpose

Give a dispatcher (MANAGER role) a lean record of a contractor job — what's wrong, where, which
trade, how urgent, with photos — so it can be matched to the right contractor (T3) and dispatched
over WhatsApp (T4). This is the first job/ticket record of Component II.

It is deliberately a **strict subset of the future unified `Ticket`** (Phase II.1). II.1 folds this
table (and the existing `Issue` table) into `Ticket`; because the field set is a subset, that
migration is **additive** (rename + add `kind`/`source`/lifecycle columns), not a data reshape.

**Non-goals (YAGNI for the MVP):** no SLA field, no scheduling/calendar (T6), no cost capture
(II.7), no assignment history, no auto-create-from-checklist, no two-way Accept/Decline/ETA states
(that is L2, the last II.A task). No contractor accounts — contractors never log in.

## 2. Data model

New model `ContractorJob` + new enum `JobStatus`. Additive migration; safe to apply to the shared
Neon dev/prod DB (no changes to existing tables except one nullable column on `Photo`).

```prisma
enum JobStatus {
  OPEN         // created, not yet dispatched
  DISPATCHED   // contractor assigned + WhatsApp sent (T4)
  IN_PROGRESS  // contractor working
  COMPLETED    // done
  CANCELLED    // cancelled (requires a completionNote reason)
}

model ContractorJob {
  id              String     @id @default(uuid()) @db.Uuid
  propertyId      String     @map("property_id") @db.Uuid
  roomLabel       String?    @map("room_label")             // free-text ("Rm 212", "lobby", "roof")
  trade           Trade                                      // single trade (reuses T1 enum)
  problem         String                                     // what's wrong
  urgent          Boolean    @default(false)                 // manual toggle (Gerardo rule pending)
  status          JobStatus  @default(OPEN)
  contractorId    String?    @map("contractor_id") @db.Uuid  // set at dispatch (T3/T4)
  createdByUserId String     @map("created_by_user_id") @db.Uuid
  completionNote  String?    @map("completion_note")         // required on COMPLETED/CANCELLED
  createdAt       DateTime   @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime   @updatedAt @map("updated_at") @db.Timestamptz

  property   Property    @relation(fields: [propertyId], references: [id])
  contractor Contractor? @relation(fields: [contractorId], references: [id])
  createdBy  User        @relation("ContractorJobCreatedBy", fields: [createdByUserId], references: [id])
  photos     Photo[]

  @@index([propertyId, status])
  @@index([contractorId])
  @@index([urgent, status])
  @@map("contractor_jobs")
}
```

Back-relations added: `Property.contractorJobs`, `Contractor.jobs`,
`User.createdContractorJobs @relation("ContractorJobCreatedBy")`.

### Room representation
Free-text `roomLabel` (nullable). Rooms are only seeded for Lakeland today (no PMS in v1; 7 of 8
properties have zero `Room` rows), and jobs are portfolio-wide. A free-text label is enough for a
dispatch message and matches StayCheck's free-text-room direction (S1). A structured `Room` FK can
be added later when rooms are populated.

### Urgent
Boolean, not a priority enum. Manual toggle for the MVP because Gerardo's emergency-classification
rule is still pending. `urgent = true` sorts the job to the top of the queue and is the trigger the
later "emergency alert" task fires on. Maps to `IssuePriority.URGENT` / the future ticket priority.

## 3. Photos — reuse the `Photo` table

Add a third nullable owner FK to `Photo`, extending the existing exactly-one-owner pattern
(`responseId` | `issueId` today; ADR-016 added `issueId` the same way):

```prisma
model Photo {
  responseId      String? ...
  issueId         String? ...
  contractorJobId String? @map("contractor_job_id") @db.Uuid   // NEW
  ...
  contractorJob   ContractorJob? @relation(fields: [contractorJobId], references: [id], onDelete: Cascade)
  @@index([contractorJobId])   // NEW
}
```

App-level invariant stays "exactly one owner set", validated server-side (Prisma cannot express a
CHECK). This reuses the entire R2 pipeline unchanged: presign, client capture, `PhotoFigure`
display (ET capture-time + coords + geofence badge), server-side geofence at write time. Geofence
status is computed exactly as for checklist/issue photos using the job's `propertyId`.

## 4. Server actions (`app/dispatch/actions.ts`)

Mirror `/issues` and T1 `/contractors`: MANAGER-or-above, property-scoped, Zod-validated, every
mutation written to `audit_log` (`entityType = "ContractorJob"`).

- `createContractorJob` — property + trade + problem required; roomLabel/urgent/photos optional.
  Scoped managers may only create at their own properties (`canAccessProperty`). Photos uploaded via
  the presign flow (new scope, §6) then persisted in-transaction with server-computed geofence.
- `updateJobStatus` — advance status; `COMPLETED`/`CANCELLED` require a `completionNote`. Assigning a
  contractor (`contractorId`) + moving to `DISPATCHED` is one action, driven from T4 in the next task.
- `assignContractor` — set/clear `contractorId` (validated: contractor must cover the job's property
  and carry the job's trade). Thin in T2; T4 wires the WhatsApp send on top.

All actions revalidate the `/dispatch` paths. No contractor mutation auto-sends anything — dispatch
is human-initiated (T4).

## 5. Routes / UI (`/dispatch`)

Mirrors the `/issues` structure and the app shell / property-scope conventions.

- **`/dispatch`** — job queue: list rows (property short code · trade · roomLabel · problem · status ·
  urgent badge · contractor if assigned). Filters: property, trade, status, urgent-only.
  **Sort: urgent-first, then newest.** Property-scoped by the global header filter + RBAC.
- **`/dispatch/new`** — create form (property, trade, roomLabel, problem, urgent toggle, photo capture
  reusing the checklist/issue photo component).
- **`/dispatch/[id]`** — job detail: fields + photo grid (`PhotoFigure`) + status controls +
  assign-contractor control. **This page is where T4's one-tap WhatsApp button lands next.**
- **Nav:** add "Dispatch" to the manager nav next to Issues / Contractors (`lib/nav.ts`).

## 6. Presign scope

Add a `contractorJob` scope to `/api/photos/presign` (alongside `test`/`response`/`issue`):
MANAGER-or-above + property-access-gated, capped at a per-job photo max (reuse the issue cap of 5).
Key prefix validated server-side at submit, same as the existing scopes.

## 7. Pure helpers (`lib/contractor-jobs.ts`) + tests

- `JOB_STATUS_LABELS`, `jobStatusOrder`, `TRADE`-aware helpers as needed.
- `sortJobs(jobs)` — urgent-first then `createdAt` desc (pure, testable).
- `canAssignContractor(contractor, job)` — contractor covers `job.propertyId` ∧ has `job.trade` ∧
  `active` (pure; the action calls it, T3 reuses it).
- Zod schemas for create/update.

Vitest coverage mirrors `lib/contractors.ts` (T1). No new test framework.

## 8. How this feeds T3 / T4

- **T3 (match & rank):** input is the job's `propertyId + trade`. `canAssignContractor` + a
  contracted-first ordering over the `Contractor` directory is the whole matcher — pure, testable.
- **T4 (one-tap dispatch):** `problem + roomLabel + property + photos` become the pre-filled bilingual
  WhatsApp (`wa.me`) message payload (language from `contractor.language`), plus the Phase-9 signed
  single-use magic-link so the contractor can view the job with no account. Setting `contractorId`
  and moving to `DISPATCHED` happens here.

## 9. Migration & deploy safety

Single additive migration: new `contractor_jobs` table, new `JobStatus` enum, one nullable
`photos.contractor_job_id` column + index. No existing rows change. Safe to apply to the shared
dev/prod Neon DB (same posture as T1's `20260713164200`). **Branch only — deploy is a separate call,
gated on the prod/dev DB split before any real contractor PII is entered.**

## 10. Definition of done

- Migration applies clean; `pnpm prisma generate` green.
- `/dispatch` list + `/dispatch/new` + `/dispatch/[id]` work behind MANAGER RBAC + property scope.
- Create a job with photos → photos land in R2 with geofence status → visible on detail.
- Status transitions audit-logged; COMPLETED/CANCELLED enforce a note.
- `lib/contractor-jobs.ts` unit tests pass; full suite green; types + lint clean; build succeeds.
