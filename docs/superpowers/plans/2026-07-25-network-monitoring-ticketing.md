# NETWORK — Network Monitoring & IT Ticketing — Implementation Plan

**Epic:** NETWORK (new top-level section, sibling of ADMIN) · **Spec:** `docs/network/DevSpec_NetworkMonitoringTicketing_RISE8_072426.md` (v3.0, from Kate 2026-07-25) · **Supersedes (for network tickets):** `docs/network/ITTicketingPlan_RISE8_072426.md` (was ON HOLD)
**Status:** 📋 DRAFT — scoped 2026-07-25, **NOT approved**. Blocking decisions in §Decisions must be settled before Task 1.

> **Framing (load-bearing):** the DevSpec is written as a *standalone* app (React+Express+own Postgres+BullMQ/Redis+JWT). Kyle wants it as a **section of the StayCheck platform** instead. This plan **ports the spec onto our stack** (Next.js App Router route handlers + server actions, Prisma/Neon, Auth.js v5, Vercel Cron). Every divergence from the spec's tooling is flagged as a decision, not silently adopted. The spec's §4.1 `properties` table is a **duplicate of our `Property` model — do NOT create it** (spec `rise8_id` = our `Property.propertyId`).

---

## What it must do (spec summary)

**Device monitoring (§1, §3):** receive HMAC-verified webhooks `POST /api/webhooks/{unifi,aruba}` (UniFi Protect cameras + UniFi Network APs + Aruba Instant On APs); map firmware event types → `PROBLEM`/`RECOVERY`; store raw payloads for debugging; maintain per-device `currentStatus` + `lastSeenAt`. Field names vary by firmware — confirm from live capture before trusting parsers (§3.3, §9).

**Ticket lifecycle (§5):**
- **Standard:** problem event → 5-min timer → if not recovered and no open ticket → auto-create `TKT-YYYYMMDD-NNN` (`OPEN`). Recovery within 5 min → self-resolved, no ticket. Duplicate suppression per device.
- **Recovery on open ticket** → `RESOLVED` + `downDurationMin` + Teams thread reply.
- **Mass outage (§5.5):** ≥5 devices at one property offline within 120s → immediate `MASS_OUTAGE` ticket, suppress individual tickets, 10-min check splits recovered vs still-offline and spawns child (`parentTicketId`) standard tickets.

**Teams — Microsoft Graph API (REQUIRED, §2, §5.3–5.4):** spec is explicit that **Incoming Webhooks won't work** (threading + reply ingestion need Graph). Post initial ticket → save `teamsMessageId`; resolution → thread reply; ingest replies → `TicketNote` (change-notification sub or 60s poll). ⚠ **Conflicts with ADR-010** (digest built on Incoming Webhooks) — see Decisions.

**Dashboard (§6):** portfolio (summary cards + sortable open-ticket table w/ age color), per-property (devices + status + tickets + 30d history), ticket detail (timeline, editable status/assignee/notes, Teams notes log), device history w/ "recurring" flag (3+ tickets/30d).

**Guest WiFi / Spotipo (§11):** second, **read-only** subsection. Per-site Spotipo API, 8 sites called in parallel + aggregated server-side (no multi-site endpoint). Cards: Total Guests / Online Now / Dwell / Revenue (revenue availability UNCONFIRMED). Keys server-side only.

**Users (§2):** "IT staff only." Excludes Zapier, Smartsheet, `#it-alerts`.

---

## Decisions needed before building (do not invent)

**Platform-port decisions (new):**
- **D1 — RBAC / who is "IT staff"? ✅ DECIDED 2026-07-25 (Kyle): new `NETWORK_TECH` role (7th).** Add `NETWORK_TECH` to the `Role` enum; seed at least one; extend `lib/role-display.ts` (ADR-023 6→3 display grouping — add a display bucket or fold into an existing one, label-only never authz) + its test; `canAccessNetwork` = `{NETWORK_TECH, ADMIN, CORPORATE}` (ADMIN/CORPORATE retain portfolio access). MANAGER read-only per-property NETWORK view: not granted in v1 (revisit). This is a schema change → folds into Task 1's migration. **New ADR required** (role addition; supersedes/extends ADR-023).
- **D2 — Timer mechanism (no Redis). ✅ DECIDED 2026-07-25 (Kyle): DB-backed `NetworkJob` polled by a 1-min Vercel Cron** (`/api/cron/network-timers`, reuses `CRON_SECRET` auth). `NetworkJob` table IS created in Task 1. ~1-min granularity on a 5-min SLA is acceptable. Inngest NOT used.
- **D3 — Graph API vs ADR-010.** Confirm digest stays on Incoming Webhooks while tickets use Graph (coexist), or migrate digest too. Needs a bot/service identity. New ADR either way.
- **D4 — Zoho Desk dropped?** Spec builds ticketing natively; confirm Zoho Desk is dropped for network tickets → supersede `ITTicketingPlan` via ADR.
- **D5 — `assignedTo`:** FK to `User` (in-house IT) or free-text (external MSP)?
- **D6 — Spotipo key encryption:** app-layer encryption of `spotipoApiKey` column vs a global env-var key (avoids column). No field-encryption util exists today.

**External creds (block dependent phases, not the core):**
- Microsoft Graph: Azure AD app reg, tenant/team IDs, 8 channel IDs, `ChannelMessage.Send` + `.Read.All` — **blocks Tasks 7–8.**
- UniFi + Aruba HMAC secrets + confirmed payload schemas — **needed to trust Task 3 parsers** (mitigated by `RawWebhookPayload` capture).
- Spotipo siteid ×8 + key(s) + revenue-field confirmation — **blocks Task 9.**
- Overnight-notification behavior (§9), AP wired→OTA SLA (§9), reply-ingestion sub-vs-poll (§5.4).

---

## Data model (additive Prisma, reuse existing patterns)

**Extend `Property`** (NOT a new table): `teamsChannelId`, `teamsChannelName`, `spotipoSiteId`, `spotipoApiKey?` (pending D6) + back-relations.

**Enums:** `DeviceType{CAMERA,AP}`, `DeviceSource{UNIFI_PROTECT,UNIFI_NETWORK,ARUBA}`, `DeviceStatus{ONLINE,OFFLINE,UNKNOWN}`, `NetworkEventType{PROBLEM,RECOVERY}`, `TicketStatus{OPEN,IN_PROGRESS,RESOLVED,CLOSED}`, `TicketType{STANDARD,MASS_OUTAGE}`, `TicketNoteSource{TEAMS_REPLY,MANUAL}`.

**Models:** `Device`, `NetworkEvent` (renamed from spec `events` to avoid audit/notify collision; self-ref `resolvedByEventId`), `RawWebhookPayload` (§3.3 capture-before-trust), `Ticket` (`ticketNumber` via ADR-009-style ET daily seq; `parentTicketId` self-ref; `affectedDevices Json`), `TicketNote` (`teamsReplyId` dedupe), and `NetworkJob` **only if D2=(a)**.

**Reuse:** `NotificationLog.TEAMS`+`target` for Teams attempts (ADR-010 discipline); `AuditLog` (`entityType="ticket"`) for manual edits; `lib/datetime.ts` for ET display.

---

## Route / UI structure under `/network` (mirrors `/admin`)

```
app/network/layout.tsx                 → requireNetworkAccess() guard (once for group)
app/network/page.tsx                   → Portfolio dashboard (§6.1)
app/network/properties/[id]/page.tsx   → Per-property (§6.2)
app/network/tickets/page.tsx           → Ticket list
app/network/tickets/[id]/page.tsx      → Ticket detail (§6.3)
app/network/tickets/[id]/TicketActions.tsx (client, mirrors ReviewActions.tsx)
app/network/tickets/actions.ts         → updateTicket/addNote (Zod + audit_log)
app/network/devices/[id]/page.tsx      → Device history + recurring flag (§6.4)
app/network/wifi/page.tsx + [propertyId]/page.tsx  → Guest WiFi (§11.5)
app/api/webhooks/{unifi,aruba,teams-reply}/route.ts   → HMAC/Graph-guarded, no session
app/api/network/wifi/{summary,online}/route.ts        → Spotipo proxy (§11.7)
app/api/cron/network-timers/route.ts   → durable timer runner (if D2=a); + vercel.json
```
**Server logic (pure + `.server` split, à la `lib/recurrence*`):** `lib/network/event-mapping.ts` (pure), `ticket-number.ts` (pure), `ticketing.server.ts`, `mass-outage.server.ts`, `teams-graph.server.ts`, `spotipo.server.ts`. Webhooks bypass locale middleware (already excluded); auth = HMAC / `CRON_SECRET` in-handler.

**RBAC:** `canAccessNetwork(role)` + `requireNetworkAccess()` in `lib/rbac.ts`; `"network"` group in `lib/nav.ts` + `ShellChrome`; update `lib/nav.test.ts`. English-only (IT/mgmt surface, ADR-013).

---

## Tasks (schema-first, each independently reviewable; cred-blocked work late)

1. **Schema + migration + client regen** — enums + `Property` cols + `Device`/`NetworkEvent`/`RawWebhookPayload`/`Ticket`/`TicketNote`(+`NetworkJob`); `add_network_monitoring`; seed `teamsChannelName` placeholders. *No creds.*
2. **Pure event-mapping + ticket-number + mass-outage-window predicate + tests.** *No creds.*
3. **Webhook receivers + event logging** (spec Phase 1) — HMAC→401, store raw, upsert Device, insert NetworkEvent. *Needs HMAC secrets to trust parsers; buildable w/ fixtures.*
4. **Timer + standard ticket creation** (Phase 2) — durable timer (D2), dup-suppression, recovery-closes, `downDurationMin`. *No creds.*
5. **Mass outage** (§5.5) — 120s cluster, immediate ticket, 10-min split, parent/child. *No creds.*
6. **NETWORK shell + RBAC + nav + dashboard/ticket pages + edit actions.** *No creds.* → **demoable core ends here.**
7. **Teams Graph: post + resolution reply** (Phases 3–4). *BLOCKED on Azure AD (D3, creds).*
8. **Teams reply ingestion → notes** (Phase 5). *BLOCKED on Graph.*
9. **Guest WiFi / Spotipo** (§11). *BLOCKED on Spotipo creds.*
10. **Escalation + recurring-device flag + final review** — age thresholds, 3+/30d flag, overnight tag; full test/typecheck/lint/build; Opus whole-branch review; ADR recorded.

**Tasks 1–6 require ZERO external creds** and constitute a demoable core (tickets log Teams as SKIPPED until Graph creds land — same graceful-degradation as the Resend-unconfigured path in `lib/notify.server.ts`).

---

## Risks
- **Durable timers w/o Redis (D2)** — highest architectural risk; DB-cron substitute recommended.
- **Graph vs ADR-010 (D3)** — needs coexistence decision + service identity + ADR.
- **Firmware payload variance (§3.3)** — `RawWebhookPayload` capture-then-finalize mitigates.
- **Vercel function timeout** — set `maxDuration`; parallelize the 8-site Spotipo fan-out.
