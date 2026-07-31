# Subsystem Isolation Map — RISE8 Operations Platform

**Date:** 2026-07-30 · **Branch analyzed:** `claude/rise8-operations-platform-rv9B6` @ `fd705a4` (clean tree)
**Purpose:** file-level inventory of the three subsystems so Kyle can decide what to maintain and what to remove. Current intent: **keep Checklist + Network, decide later on Contractor/Dispatch.**

This is an inventory, not a refactor. Nothing has been moved or deleted.

---

## 0. Verdict first

| Subsystem | Owned LOC | Routes | DB models | Coupling to the rest | Removable cleanly? |
|---|---|---|---|---|---|
| **A. Checklist** (StayCheck) | ~7,700 app + ~3,000 lib | 19 pages / 5 API | 12 | It *is* the core — owns `Photo`, `Issue`, `AuditLog` consumers | No. This is the trunk. |
| **B. Network** (monitoring + IT ticketing) | ~7,900 | 7 pages / 6 API | 6 | **Almost none.** 2 touchpoints total. | Yes — cleanest of the three. |
| **C. Contractor** (directory + dispatch + consent) | ~4,800 | 8 pages / 0 API | 5 | 4 real touchpoints, one of them load-bearing for staff | Mostly — but see §5. **Do not blanket-delete.** |
| **S. Shared core** | ~2,000 | 6 pages / 1 API | 5 | — | Never. |

**Headline:** Network is genuinely modular — nothing outside `app/network/**`, `app/api/{webhooks,network,cron/network-*}` and `lib/network/**` imports a single network symbol. Deleting it touches exactly two shared files. Contractor is *nearly* modular, but the **invite + consent rail is shared with staff account activation** and cannot be deleted with the rest of the contractor code.

---

## 1. Bucket A — CHECKLIST (keep)

### Routes
`/` · `/checklists/[id]` · `/checklists/new` · `/review` · `/review/[id]` · `/issues` · `/issues/[id]` · `/rules` · `/templates` · `/templates/new` · `/templates/[id]` · `/completed` · `/reports/completeness` · `/reports/issues` · `/dashboard` · `/admin/users` · `/admin/sla` · `/admin/properties` · `/admin/templates`

### API
`/api/checklists/[id]/pdf` · `/api/reports/completeness/pdf` · `/api/reports/issues/pdf` · `/api/cron/generate-checklists` (cron `0 9 * * *`) · `/api/photos/presign`

### Owned files
```
app/checklists/**  app/review/**  app/issues/**  app/rules/**  app/templates/**
app/completed/**   app/reports/** app/dashboard/**  app/admin/**
app/api/checklists/**  app/api/reports/**  app/api/cron/generate-checklists/
components/checklist/SignaturePad.tsx   components/review/PhotoFigure.tsx

lib/checklist-logic.ts   lib/checkout-flags.ts   lib/completion-check.ts
lib/geofence.ts          lib/issues.server.ts    lib/manual-create.ts
lib/mark-opened.ts       lib/recurrence.ts       lib/recurrence.server.ts
lib/reports.ts           lib/review.ts           lib/review-lock.ts
lib/room-label.ts        lib/template-access.ts  lib/template-code.ts
lib/draft-store.ts       lib/image.ts            lib/pdf/**
prisma/templates.ts
```

### DB models
`Room` · `ChecklistTemplate` · `Question` · `TemplateProperty` · `RecurringRule` · `ChecklistInstance` · `Response` · `Photo` · `Issue` · `SlaDefault` (+ `RoomStatus`/`TemplateScope`/`ReviewLevel`/`QuestionType`/`InstanceStatus`/`CompletionCheck`/`GeofenceStatus`/`IssueStatus`/`IssuePriority` enums)

### Message namespaces
`Home` · `Checklist` · `Checkout` · `Photo` (bilingual EN/ES)

### Env
`CRON_SECRET` (shared with network crons) · `R2_*` (photo pipeline) · `RESEND_*`

---

## 2. Bucket B — NETWORK (keep)

### Routes
`/network` · `/network/tickets` · `/network/tickets/[id]` · `/network/devices/[id]` · `/network/properties/[id]` · `/network/wifi` · `/network/wifi/[propertyId]`

### API
`/api/webhooks/unifi` · `/api/webhooks/aruba` · `/api/cron/network-timers` (cron `* * * * *`) · `/api/cron/unifi-poll` (cron `*/2 * * * *`) · `/api/network/wifi/summary` · `/api/network/wifi/online`

### Owned files
```
app/network/**            (incl. its own layout.tsx guard)
app/api/webhooks/**       app/api/network/**
app/api/cron/network-timers/  app/api/cron/unifi-poll/
components/network/{AgeBadge,EscalationBadges,WifiStatCard}.tsx
lib/network/**            (39 files — event mapping, HMAC, parse, ingest,
                           ticketing, mass-outage, escalation, ticket-age,
                           ticket-filters, ticket-number, unifi-{api,hosts,poll},
                           teams-{config,message,webhook,graph,deliver},
                           spotipo*, wifi-{live,range,revenue})
```

### DB models
`Device` · `NetworkEvent` · `RawWebhookPayload` · `Ticket` · `TicketNote` · `NetworkJob` (+ `DeviceType`/`DeviceSource`/`DeviceStatus`/`NetworkEventType`/`TicketStatus`/`TicketType`/`TicketNoteSource` enums)
Plus **4 columns on `Property`**: `teamsChannelId`, `teamsChannelName`, `spotipoSiteId`, `spotipoApiKey`.

### Message namespaces
**None.** The network section is English-only — no i18n entanglement.

### Env
`UNIFI_API_KEY` · `UNIFI_WEBHOOK_SECRET` · `ARUBA_WEBHOOK_SECRET` (unset → route fails closed) · `TEAMS_WEBHOOK_URL` · `MS_GRAPH_CLIENT_ID/_SECRET/_TENANT_ID` · `CRON_SECRET`

### Coupling to everything else — exactly 2 files
1. `lib/rbac.ts` → `canAccessNetwork()` + `requireNetworkAccess()` + `Role.NETWORK_TECH`
2. `lib/nav.ts` → `NETWORK_GROUP` (3 items) and the `"network"` value in `NavItem.group`

That's it. No checklist or contractor file imports anything under `lib/network/`.

---

## 3. Bucket C — CONTRACTOR / DISPATCH / CONSENT (the decision)

This bucket is really **three sub-layers** with different removal cost. Treat them separately.

### C1 — Contractor directory + dispatch (cleanly removable)
**Routes:** `/contractors` · `/dispatch` · `/dispatch/new` · `/dispatch/[id]` · `/j/[token]` (public no-account job view)
**Files:**
```
app/contractors/**  app/dispatch/**  app/j/**
lib/contractors.ts  lib/contractor-jobs.ts  lib/dispatch-message.ts  lib/job-link.ts
```
**Models:** `Contractor` · `ContractorProperty` · `ContractorJob` (+ `Trade`, `JobStatus` enums)
**Message namespaces:** none — English-only surfaces.
**Tests:** ~4 suites (`contractors`, `contractor-jobs` (37 cases), `dispatch-message`, `job-link`).

### C2 — Consent / A2P 10DLC evidence (removable, but it exists for a compliance filing)
**Routes:** `/legal/messaging` · `/legal/opt-in`
**Files:** `lib/consent.ts` · `lib/consent-copy.ts` · `components/consent/ConsentBlock.tsx`
**Models:** `ConsentRecord` (+ `ConsentChannel` enum)
**Note:** this is the artifact submitted to Twilio for A2P 10DLC review. Its reason to exist is WhatsApp/SMS messaging to contractors. **If contractor dispatch is cut, the Twilio 10DLC campaign is also moot** — but check whether a filing is already in flight before deleting the evidence pages, because a live submission that points at a dead URL is a rejection.

### C3 — Invite rail (⚠ **DO NOT DELETE** — serves staff)
**Route:** `/invite/[token]`
**Files:** `lib/invite.ts` · `lib/phone.ts` · `lib/email.ts::sendInviteEmail` · `messages/*.json` → `Invite` namespace (bilingual)
**Models:** `InviteToken` (+ `InviteKind` enum) · `User.phoneE164` / `User.phoneVerifiedAt`
**Why it stays:** `InviteKind.ACCOUNT` is the **staff account-activation** path, wired into `app/admin/users/actions.ts` (`sendAccountInvite`, `revokeInvite`). Only `InviteKind.CONSENT_ONLY` is contractor-specific. Killing `lib/invite.ts` breaks admin user provisioning in the checklist app.

---

## 4. Bucket S — SHARED CORE (never remove)

**Routes:** `/login` · `/profile` · `/install` · `/ios-spike` (throwaway POC) · `/photo-test` (POC) · `/api/auth/[...nextauth]`

```
app/layout.tsx  app/page.tsx  app/login/**  app/profile/**  app/locale-actions.ts
components/shell/{AppShell,ShellChrome,PageHeader}.tsx
components/{PropertyPicker,LocalePrompt,OnlineStatus,InstallPrompt,ServiceWorkerRegister,SignOutButton}.tsx
components/ui/button.tsx
lib/{auth,auth-throttle,otp,trusted-device,password,rbac,nav,db,datetime,cookies,
     current-property,property-scope,role-display,email,notify.server,notify-copy,
     r2,pwa,utils}.ts
i18n/**  middleware.ts  messages/{en,es}.json  types/next-auth.d.ts
prisma/seed.ts  scripts/**  public/**
```
**Models:** `User` · `Property` · `UserProperty` · `LoginOtp` · `AuditLog` · `NotificationLog` (+ `Role`, `Locale`, `NotificationChannel`, `NotificationStatus`)
**Message namespaces:** `App` · `Common` · `Auth` · `Locale` · `Install` · `Profile`

---

## 5. The actual cut points (if Contractor C1 is removed)

Ordered, with what breaks:

| # | File | What to change | Risk |
|---|---|---|---|
| 1 | `lib/nav.ts:14-15` | Drop `/contractors` + `/dispatch` from `MAIN_MANAGER`; drop `/j` from `SHELL_HIDE_PREFIXES` (keep `/invite`, `/legal`) | trivial · `lib/nav.test.ts` asserts nav contents — **will fail until updated** |
| 2 | `app/api/photos/presign/route.ts:7` | Imports `JOB_PHOTO_MAX` from `lib/contractor-jobs`; the route has a `job` presign scope | low · remove the scope + the import, keep `response`/`issue` scopes |
| 3 | `prisma/schema.prisma` — `Photo.contractorJobId` | Third nullable photo owner (ADR-016 exactly-one-owner) | low · drop the FK + index; the exactly-one rule is app-enforced, not a DB CHECK |
| 4 | `prisma/schema.prisma` — `User` back-relations | `contractor Contractor?`, `createdContractorJobs ContractorJob[]` | low |
| 5 | `prisma/schema.prisma` — `Property` back-relations | `contractors`, `contractorJobs` | low |
| 6 | `prisma/schema.prisma` — `Contractor` back-relations | `invites InviteToken[]`, `consentRecords ConsentRecord[]` — and the matching `contractorId` columns on `InviteToken` / `ConsentRecord` | **medium** · this is where C1 and C3 tangle. If you keep the invite rail (you must), you must either keep `Contractor` or strip `contractorId` from both models |
| 7 | `prisma/seed.ts:305-330` | 4-contractor placeholder roster (already `SEED_DEMO`-gated) | trivial |
| 8 | Migration history | 3 migrations create this: `20260713164200_add_contractor_directory` + `20260728120000_add_contractor_jobs` (**both already on `origin/main`** → need a drop-migration) and `20260730120000_add_invites_and_consent` (**branch-only** → can be dropped by not merging) | **do not edit history** — write a new drop migration for the first two |
| 9 | `docs/component-ii/**`, TODO §Track C/D | Documentation still describes the whole rail | doc-only |

**Key structural finding on #6:** `InviteToken` and `ConsentRecord` each carry *two* nullable owner FKs — `userId` (staff) and `contractorId`. Removing `Contractor` forces a decision on those columns. Cheapest path: **keep the `Contractor` table and `/contractors` directory, delete only `ContractorJob` + `/dispatch` + `/j`**. That severs the dispatch machinery while leaving the invite/consent rail structurally intact.

---

## 6. Branch / migration reality check (verified against git, not prose)

`git rev-list`: this branch is **20 ahead / 1 behind `origin/main`**. (CLAUDE.md's "19 ahead" is stale, and it omits that main has moved.)

**Already merged to `origin/main` — so C1 is *not* branch-local:**
- `app/contractors`, `app/dispatch`, `app/j` all exist on `origin/main`.
- Migrations `20260713164200_add_contractor_directory` and `20260728120000_add_contractor_jobs` are both on `origin/main`.
- ⇒ Cutting C1 means writing a **drop-migration**, not just abandoning a branch.

**Branch-only (never merged):**
- The entire invite + consent rail — 12 commits, `7ab342d`…`509be11`, incl. migration `20260730120000_add_invites_and_consent`.
- ⇒ **C2 + C3 can still be dropped by simply not merging them.** That window is open right now and closes the moment this branch lands.

**Behind by 1:** `9c222a7 feat(network): add ticket filters and sortable columns` on `origin/main` is the same work as this branch's `7b10de0` under a different SHA — it landed on main separately. Expect a conflict or a redundant diff when merging.

**Not verified:** whether the prod DB has `add_contractor_jobs` applied. CLAUDE.md says it was pending Kyle as of 2026-07-28; I have no prod DB access from here. **Check before planning any drop.**

Author any schema change offline via `prisma migrate diff` — do not run `migrate dev` (it wants a reset and the dev DB `ep-falling-moon` is shared with Preview).

---

## 7. What I could not determine

- **Whether a Twilio A2P 10DLC submission is already live** pointing at `/legal/opt-in` and `/legal/messaging`. If it is, deleting C2 breaks an in-flight filing. I have no visibility into the Twilio console.
- **Whether `/j/[token]` magic-link code is wanted for A10 contractor checklists.** `lib/job-link.ts` was built to be shared with the Phase-9 contractor-checklist magic link (per CLAUDE.md ADR-012 note). If contractor *checklists* stay in scope while contractor *dispatch* goes, `lib/job-link.ts` is worth keeping.
- **Test suite pass state after any cut** — not run as part of this inventory. `lib/nav.test.ts` is the known tripwire (it caught a comparable break during the 2026-07-28 merge).
