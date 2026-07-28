# RISE8 Operations Platform — Task Tracker

Living checklist for the **10-week build + 4-week parallel run** (extended per ADR-012). Source of truth for "what's next." Tied to `docs/SPRINT_PLAN.md`.

**Legend**
- Priority: `P0` blocker · `P1` must-have · `P2` should-have · `P3` nice-to-have
- Status: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

Update `Current Status` in `CLAUDE.md` and check items off here as work lands.

---

## 🧭 Component Map (ADR-025, 2026-07-07)

The project is three components. All three run **in parallel** (Kyle, 2026-07-07); III's build is gated on Rob's greenlight.

| # | Component | What | Status |
|---|---|---|---|
| **I** | **Checklist App (StayCheck)** | The live Connecteam replacement. All existing phases + StayCheck v1.1 (S0–S9) **minus ticketing** | 🟢 Live in prod, active build |
| **II** | **Maintenance / Ticketing System** | Intake (form + `blake@` email AI-ingestion; urgent/contractor WhatsApp) → human review → ticket vs. concern → work-order lifecycle → dispatch → close. Outlook sync | 🟡 New — planning |
| **III** | **Construction Progress / Scheduling** | Buildout/renovation PM (`docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`). Shares the ingestion engine | ⛔ Concept — gated on Rob's decisions file |

Components share one codebase/deploy and reuse each other's infra (auth, RBAC, Issue/SLA, audit, Teams digest, geofence). See ADR-025.

---

# COMPONENT I — CHECKLIST APP (StayCheck)

*The live platform. Everything below through the "Open Questions" section belongs to Component I unless marked otherwise. S7 (ticketing) has moved to Component II.*

## 🆕 EPIC: StayCheck v1.1 (scoped 2026-07-02)

Spec: `docs/superpowers/specs/2026-07-02-staycheck-v1.1-adaptation.md` · adapts `StayCheckPRD_RISE8_070126.md` onto the live platform. **Forks settled (Kate):** Cloudbeds in-scope (manual-first + per-property adapter, ADR-022); 3-role *display* mapping keeps 6-role DB (ADR-023); rename to **StayCheck** (ADR-024, supersedes ADR-010). ✅ **ADRs 022–024 now recorded in DECISIONS.md** (S0, 2026-07-02).

**Blocked-on-Kate:** (a) Cloudbeds per-property read-only API keys → unblocks S3; (b) **maintenance ticketing `.md` incoming** → unblocks S7 detail. *(structured-flags call + prod/dev DB split both RESOLVED 2026-07-25.)*

**✅ BOTH PRIOR PENDING DECISIONS RESOLVED (2026-07-25):**
1. **Prod/dev DB split — DONE.** New prod Neon project `ep-summer-cloud-axmco63q` (us-east-2); **Preview + local stay on dev `ep-falling-moon`**. migrate deploy + core seed + Vercel Production repoint + redeploy (`checklist-elgpiqjdp`) → cutover live on ops.rentstayable.com. `CRON_SECRET` added by user + redeployed (5 AM cron ENABLED, no-op until rules). Prod strings in gitignored `.env.production.local`. Rollback: `vercel promote https://checklist-4gwsbzke8-stayable-admins-projects.vercel.app`. See RUNBOOK §Splitting the Production DB.
2. **S1 design — Kate answered** (`docs/StayCheckS1DesignQueries_RISE8_072426_reviewed.md`): Q1 completion-check = manager-manual; Q2 flags = **staff-at-fill + manager-confirm** (→ bilingual + template `collectsCheckoutFlags`); Q3 = dedicated columns; Q4 = admin-only unlock; + internal-note toggle. S1 plan LOCKED.

| Phase | Pri | Status | What |
|---|---|---|---|
| S0 — Foundations & rename | P1 | [~] | **DONE + DEPLOYED TO PROD 2026-07-02** (`ee31c09`+`0130c3b`, FF `main` `9015c34→ddf1ac5`, prod deploy `dpl_HURDNW5Z…` READY on ops.rentstayable.com; `/login` 200, `/review`+`/issues` 307). ADRs 022–024 in DECISIONS.md; `lib/role-display.ts` (6→3-role display map, tested, label-only-not-authz); StayCheck rename across all user-facing surfaces (`/ios-spike` left as throwaway); `bonusEligible` **dropped** — migration `20260702221150_drop_bonus_eligible` **applied to shared prod DB 2026-07-02** (deployed new code first so live reads didn't break). 129/129 tests, clean types+lint, build 30 routes. **✅ prod/dev DB split DONE 2026-07-25** (prod on its own Neon `ep-summer-cloud`; see RUNBOOK §Splitting the Production DB). PDF wordmark rename deferred until PDF templates exist |
| S1 — Review workflow upgrade | P1 | [x] | **DONE + DEPLOYED TO PROD 2026-07-25** (`29abd81` + fix-wave `ab6e736`, `main`→prod deploy `checklist-cqkps9rrw` Ready/live; fix-wave `checklist-cevtb8h76`). All 7 tasks: migration `add_s1_review_upgrade` (authored **offline** via `migrate diff` — dev DB not reset, main/prod stay contractor-free; applied to prod via `migrate deploy`); `lib/review-lock.ts` immutability enforced in every mutation + submit; verify+admin-unlock; internal/staff **notify toggle** on approve(off)/flag(on, dialog checkbox)/verify(off), re-do always notifies; `review_verified` copy EN+ES; manual Pass/Fail completion check + `lib/completion-check.ts` hint; **checkout flags** staff-capture(bilingual `Checkout` ns)→draft→submit(server-gated `collectsCheckoutFlags`)→manager confirm/edit→lock-at-verify; `lib/room-label.ts` free-text room fallback everywhere. **Code review: no criticals**; 2 minor fixed (gate `saveCheckoutFlags`; verify note→`managerNote`). 161/161 tests, build 32 routes. Rollback: `checklist-oxril8x27`. 🧑 **Verify authed:** login → open a checkout/Departure submission → flag block + verify/lock + admin unlock |
| S2 — Room lifecycle (manual-first) | P1 | [ ] | 9-state derived room lifecycle · **Room Status Board** · **Checkout Queue** (manual entry) · OOO wiring from checklist flags |
| S3 — Cloudbeds sync adapter | P1 | [!] | `CloudbedsConnection` + `lib/cloudbeds/` · webhook/poll → checkout queue + arrivals trigger · room-reassignment rules · per-property isolation. **Blocked: API keys** (DB split DONE 2026-07-25) |
| S4 — Preventive Maintenance | P1 | [ ] | `Asset` registry · interval-from-last-completion scheduling · `CONDITION` question type · PM submission fields · corrective-action → Issue bridge · PM compliance dashboard |
| S5 — Staff Performance & Quality Score | P1 | [ ] | Quality Score (pass÷verified) + Completion Rate (submitted÷assigned) · per-staff cards · leaderboard · benchmarks · consistency score · staff self-view · outlier flags |
| S6 — Insights engine | P2 | [ ] | Recurring issues · failure patterns · timing anomalies (auto-flag) · property health trend · shift coverage gaps · PM insights |
| ~~S7 — Maintenance Ticketing~~ | — | → | **MOVED to Component II** (ADR-025). Now tracked as II.1. The `Issue`-extension frame lives there |
| S8 — Reports + export + photo tooling | P2 | [ ] | Report suite · Smartsheet column-parity CSV export · before/after compare · per-room photo gallery · PDF parity |
| S9 — Offline + push + versioning + library | P2 | [ ] | Full offline sync + conflict notice · push notifications · template version-snapshot · starter template library · Lease-Flip type · AM/PM shift |

---

## 🆕 EPIC: NETWORK — Network Monitoring & IT Ticketing (started 2026-07-25)

New top-level `/network` section (sibling of ADMIN). Kate's `DevSpec_NetworkMonitoringTicketing_RISE8_072426.md` (standalone-app spec) **ported onto the StayCheck stack** — plan `docs/superpowers/plans/2026-07-25-network-monitoring-ticketing.md`. Supersedes the on-hold `ITTicketingPlan` for network tickets. **MERGED to `main` 2026-07-27.**

**Decisions locked (Kyle 2026-07-25):** new **`NETWORK_TECH`** role (7th); **DB-backed `NetworkJob` + 1-min Vercel Cron** for the 5/10-min timers (no Redis). **Schema defaults chosen (confirm):** `Ticket.assignedTo` = free-text (MSP-friendly, could become User FK); `NETWORK_TECH` folds into "Admin" **display** label only.
**Still-open decisions:** D3 Graph-API-vs-ADR-010 (new ADR needed) · D4 Zoho Desk dropped (record ADR) · D6 Spotipo key encryption · overnight-notif behavior · reply-ingest sub-vs-poll.
**Cred blockers:** Microsoft Graph (Azure AD app reg + tenant/team/8-channel IDs) → Tasks 7–8 · UniFi+Aruba HMAC secrets + payload schemas → trust Task 3 parsers · Spotipo siteid×8 + key(s) → Task 9.

**✅ BUILD COMPLETE 2026-07-25 (Tasks 1–10 minus deferred T8) — subagent-driven, every task spec+quality reviewed, final Opus whole-branch review = READY (no Critical). Branch `feat/network-monitoring` HEAD `0f13dfc`, 12 commits, PUSHED to origin. NOT merged to main, NOT deployed. 267/267 tests, build 30 routes.** Demoable core (T1–6) needs zero creds; T7/T9 scaffold+degrade ("not configured" until creds); T8 deferred (creds-blocked). Per-task detail in `.superpowers/sdd/progress.md` (gitignored local ledger).

| Task | Status | What |
|---|---|---|
| 1 — Schema + migration | [x] | `a22407c`. `Role.NETWORK_TECH`; 7 enums; `Property` +Teams/Spotipo; Device/NetworkEvent/RawWebhookPayload/Ticket/TicketNote/NetworkJob. Migration `add_network_monitoring` (offline, dev-applied). **NOT on prod DB** |
| 2 — Pure event-mapping + ticket-number + mass-outage window + tests | [x] | `b535334`. `lib/network/{event-mapping,ticket-number,mass-outage}.ts` pure+tested (Aruba recovery-before-problem; ET ticket key) |
| 3 — Webhook receivers + event logging | [x] | `9e22765`. `/api/webhooks/{unifi,aruba}` HMAC constant-time→401, capture-before-trust RawWebhookPayload every path, prod fail-closed, device upsert + status in txn. hmac/parse pure-tested |
| 4 — Timer + standard ticket creation | [x] | `adad844` + fix `2b8a2ab`. DB-cron `/api/cron/network-timers` (1-min), decideTimerAction, recovery-closes + downDurationMin, Teams SKIPPED stub. Fix: P2002 retry across fresh tx |
| 5 — Mass outage (§5.5) | [x] | `41f6564` + fix `55e6ce5`. 120s cluster → 1 ticket, cancel superseded timers, 10-min split → child tickets, cascade parent-close. Fix: atomicity + `pg_advisory_xact_lock` per-property + idempotent child loop |
| 6 — NETWORK shell + RBAC + nav + dashboard/ticket pages | [x] | `cd2c9bb`. `canAccessNetwork`/`requireNetworkAccess`, nav network group, `/network` portfolio dashboard + tickets list/detail (edit actions, audit) + per-property + device history (recurring flag). **Demoable core ends here** |
| 7 — Teams Graph: post + resolution reply | [x] | `e4cb921` — **SCAFFOLD+DEGRADE** (no Azure creds). Exact §5.3/§5.5 message templates (pure+tested), config gate, honest SKIPPED logging + marked FUTURE Graph seam, "Teams: not configured" badge |
| 8 — Teams reply ingestion → notes | [!] | **DEFERRED** — pure-Graph, nothing to review without creds |
| 9 — Guest WiFi / Spotipo (§11) | [x] | `5ccf62b` — **SCAFFOLD+DEGRADE** (no Spotipo creds). Pure aggregation (tested) + degraded fetch seam + `/network/wifi` pages + guarded proxy routes + "not configured" state |
| 10 — Escalation + recurring flag + final review + ADR | [x] | `5e96cc8` + final-review fix `0f13dfc`. Overnight `[OVERNIGHT]` tag + placeholder escalation (display-only); carried fix wave; **ADR-026** recorded. Fix: cascade-close parent on manual child resolution |

**🧑 PRE-PROD hardening (from final Opus review — none block the demo): (a) demo needs a NETWORK seed — dashboards render EMPTY until sample devices/tickets exist; (b) webhook write-amplification guard (body-size cap + rate-limit); (c) cron job-claim `FOR UPDATE SKIP LOCKED`; (d) brand-new-cluster crash-window reconciliation sweep; (e) real UniFi/Aruba HMAC scheme + payloads; (f) Azure Graph + Spotipo creds; (g) ~~reconcile ADR numbering~~ — **DONE 2026-07-27**: ADR-025 ported to `main` from the contractor branch, numbering now contiguous 024→025→026. Confirm `add_network_monitoring` migration applied to whatever DB the demo runs against.**

### 🚦 UniFi go-live findings (2026-07-27) — LIVE PILOT = KISSIMMEE WEST ONLY

**Architecture decision (Kyle 2026-07-27): UniFi integration is PULL (poll the Site Manager cloud API), not PUSH (webhooks).** Kyle's `UNIFI_API_KEY` is a **Site Manager cloud key** — verified `GET https://api.ui.com/v1/hosts` → **200** from this machine, so Vercel can reach it. Key is in `.env.local` + Vercel Production. This dissolves three unknowns the webhook design carried: no unconfirmed payload shape, no unconfirmed HMAC scheme, and property routing becomes ours to define instead of something the vendor must send. **Aruba deferred** (Kyle): leave `ARUBA_WEBHOOK_SECRET` unset → `/api/webhooks/aruba` stays deployed but fail-closed (401) in prod. Trade-off accepted: detection latency = poll interval (~1–2 min) stacked on the 5-min auto-ticket timer, so worst case ≈7 min to ticket.

**Live scope (Kyle 2026-07-27): go live on Kissimmee West (5399 / KW) only** — the one production console the current key can actually read (`state=connected`, 12 devices, all online). Kyle is chasing account access for the rest internally.

**Live fleet ground truth** (from `unifi.ui.com` screenshot + API): **19 consoles — 11 Network, 8 Protect NVRs, 15 online / 4 offline.** All 8 properties have UniFi coverage. **Cameras ARE on UniFi Protect** → closes the open sub-question in `ITTicketingPlan_RISE8_072426.md` §7 Q3; camera monitoring comes free from the same API. Per-property ISP is visible too (Spectrum / Comcast / Frontier / Summit Broadband) — free ISP attribution on outages later.

| Property | Network console | Protect NVR | Legacy console (offline, decommissioned) |
|---|---|---|---|
| JW 6802 | UDM Pro Jax West | — | SS-JAXWEST (UCK G2 Plus) |
| KE 2295 | SS-KISSEAST | KE-NVR | — |
| **KW 5399** | **SS-KISSWEST** *(Invited; the pilot)* | — | — |
| LL 4645 | Lakeland | Lakeland NVR | — |
| OR 8700 | SS-ORLANDO | Orlando NVR, Orlando NVR2 | SS-ORLANDO (duplicate) |
| SA 2535 | SS- ST AUGUSTINE | St Augustine NVR | SS-StAugustine (UCG Ultra) |
| DP 44199 | UDM Pro Devenport | Davenport NVR | — |
| JN 812 | **none** | JN-NVR1, JN-NVR2 | — |

**⚠ FLAGGED PROBLEMS**

| # | Pri | Status | Problem | Action / owner |
|---|---|---|---|---|
| N1 | P0 | [!] | **API key sees only 5 of 19 consoles** — the 4 "Invited" legacy consoles + the 1 hosted controller it owns (`owner:true` on `Unifi Hosting - admin` alone). No pagination (`nextToken` empty on hosts/sites/devices), so this is account scope, not truncation. **Confirmed 2026-07-27: the account is not invited to the other sites.** Blocks portfolio-wide monitoring | 🧑 **Kyle — chasing internally.** Needs a key from the owning account, or that owner granting access then reissuing. Success = the same call returns ~19 hosts. Meanwhile: KW-only pilot |
| N2 | P1 | [ ] | **4 dead consoles still cloud-registered** — SS-JAXWEST (disconnected 2025-11-14), SS-ORLANDO dupe (2025-05-25), SS-StAugustine (2025-12-12), Unifi Hosting admin (2026-06-24). Replaced hardware. Ingest them naively → permanent false outages on every dashboard, forever | Build a **decommissioned-console exclusion list** (explicit opt-in per host, not "everything the API returns") |
| N3 | P1 | [ ] | **Properties have multiple consoles** (Network UDM + 1–2 Protect NVRs; OR has 3 total). The build assumed one source per property | Mapping must be **one property → many UniFi hosts**, not a single `unifiHostId` column |
| N4 | P0 | [ ] | **Stale-data trap:** a disconnected console makes the cloud API report every device under it as `offline`. Naive status→PROBLEM mapping would have opened **~63 bogus tickets** on first poll against the current key | **Console-reachability gate**: `host.state != "connected"` → devices go **`UNKNOWN`** (enum already has it), never `OFFLINE`, plus **one** "console unreachable / monitoring blind" condition per property (reuse `MASS_OUTAGE` type). A blank or stale panel must never read as healthy |
| N5 | P2 | [ ] | **Jacksonville North (812) has no Network console** — 2 NVRs, no UDM. Its APs/switches are unmanaged, on non-UniFi gear, or under an account not yet seen. This is the real coverage gap | 🧑 Kyle to confirm where JN network gear is managed |
| N6 | P2 | [ ] | **Is there any Aruba in the estate at all?** All 8 properties appear UniFi-covered, which may make the Aruba lane moot | 🧑 Kyle to confirm. If moot, delete `/api/webhooks/aruba` + the `ARUBA` enum path rather than ship a dead route |

**✅ T11 UniFi poller — BUILT + DEPLOYED 2026-07-27** (commit `5717397`). `lib/network/unifi-hosts.ts` (registry, explicit opt-in — **N2/N3 enforced by construction**) · `lib/network/unifi-poll.ts` (pure: device classification, transition detection, **N4 reachability gate**) · `lib/network/unifi-api.ts` (Site Manager client, config-gated, never throws) · `lib/network/unifi-poll.server.ts` (inventory upsert + ingest through the **existing** pipeline + blind-console tickets) · `/api/cron/unifi-poll` every 2 min · migration `20260727150000_add_device_types_for_unifi_poll` (**applied to prod 2026-07-27**). **317/317 tests (50 new), typecheck+lint clean, build 31 routes.**

- **N4 in practice:** a console that is disconnected **or absent from the API** is untrusted → its devices go `UNKNOWN` (never `OFFLINE`), emit no events, and raise **one** property-level monitoring-blind ticket (`MASS_OUTAGE` type, `deviceId: null`) that auto-resolves on reconnect. Dashboard gained an "Unverifiable (console unreachable)" tile + an explicit empty-state banner ("this is an empty state, not an all-clear").
- **Live dry run before any writes** (decision layer only): KW `connected`/12 devices → **9 SWITCH + 2 AP + 1 GATEWAY recorded, 0 events, 0 tickets**; the 63 stale-offline devices on the 3 dead consoles produced **nothing**.
- **Two judgement calls:** (1) `DeviceType` widened by `SWITCH`/`GATEWAY`/`NVR` — the live fleet is mostly switches and `CAMERA|AP` alone would have mislabelled every one as "AP"; (2) **device identity = MAC** via new optional `ParsedWebhook.deviceIdent` (webhook paths keep the name-based key) — UniFi names are edited freely and a rename under name-keying would strand the old row `OFFLINE` and open a phantom ticket.
- **Still open on the poller:** no admin UI for the registry (code constant; promote to a `UnifiHost` table when a non-developer must edit it) · Protect NVR device-level camera status unverified (no NVR host visible to this key yet) · poll cadence vs. the 5-min timer means ~7 min worst case to ticket.

*(original scoping, for reference)* **T11 UniFi poller**: `lib/network/unifi-api.ts` (Site Manager fetch: hosts / sites / devices) + `lib/network/unifi-poll.server.ts` (diff device state vs `Device.currentStatus` → synthesize PROBLEM/RECOVERY → feed the existing `ingestWebhook` pipeline unchanged, so tickets/timers/mass-outage/UI all work as built). Carries N2 (exclusion list), N3 (one-to-many host mapping), N4 (reachability gate) as **build requirements, not follow-ups**. Cadence: fold into the existing 1-min `/api/cron/network-timers` or a separate 2-min cron. Note polling makes mass-outage clustering *more* reliable — all devices at a property are discovered in the same tick, well inside the 120s window.

---

## 🆕 EPIC: Shell + Auth/OTP + Checklist Authoring (started 2026-06-23)

Spec: `docs/superpowers/specs/2026-06-22-ops-shell-and-checklist-authoring-design.md` · 7 sequential plans (build order = spec §8). New ADRs 018–021 (not yet in DECISIONS.md).

| Plan | Status | What |
|---|---|---|
| 1 — AppShell + property scope | [x] | **DONE + MERGED TO PROD 2026-06-23** — `lib/nav.ts` + `lib/property-scope.ts` (tested); `components/shell/{AppShell,ShellChrome,PageHeader}`; root-layout mount; Home/admin/review/issues/rules migrated; AppNav/BottomNav deleted. Desktop navy left sidebar + wide content; mobile bottom-bar. 73/73 tests, build 19 routes. Plan: `docs/superpowers/plans/2026-06-23-plan1-appshell-and-property-scope.md` |
| 1 — merge gate | [x] | **CLEARED 2026-06-23** — Kate skipped Preview, chose merge-to-prod. FF merge `b55e073..9cf069d`, deploy `dpl_HKymj4…` READY. (This merge also brought Phase 5 recurrence engine/cron/`/rules` to prod.) |
| 2 — Auth/OTP + user delete + admin pw | [x] | **DONE + MERGED + LIVE IN PROD 2026-06-27** — subagent-driven, 7 tasks + opus security reviews (Task 4 crux + final whole-branch: **invariants HOLD**, no bypass/leak) + fix waves. Plan: `docs/superpowers/plans/2026-06-25-plan2-auth-otp-userdelete.md`. `resend` + `lib/email.ts`; `login_otps`; pure `lib/otp.ts` + `lib/trusted-device.ts` (tested); `authorize` enforces password + (trusted-device OR verified OTP), no session-bypass; `app/login/actions.ts` (requestLogin/submitOtp/resendOtp, lockout metered in pre-check); two-step bilingual login UI; `deleteUser` block-if-history + Delete button; admin pw rotated → `StayableAdmin`. **119/119 tests, build 30 routes.** ✅ **PROD ENABLING-GATE CLEARED 2026-06-27:** `RESEND_API_KEY` + `RESEND_FROM_EMAIL` set in Vercel Production by user; live OTP send validated (admin login → `notification_log` `otp_login`=SENT + code received). Untrusted-device path round-trips. Deferred-minor: AUTH_SECRET triple-purpose (Phase 8); resend OTP-cap reset |
| 3 — Template builder + manual create | [x] | **DONE + MERGED + LIVE IN PROD 2026-06-27** — subagent-driven, 7 tasks + final opus review + fix wave. Plan: `docs/superpowers/plans/2026-06-24-plan3-template-builder-and-manual-create.md`. Schema (`TemplateProperty` join + `allProperties` + `ChecklistInstance.title`, additive migration); `/templates` editable builder (ADMIN all-props / MANAGER+CORP own-props, ADR-020); `/checklists/new` immediate create mirroring ADR-009 seq; nav: Templates in manager nav. **95/95 tests, build 23 routes.** ⚠ Kate decisions: (a) manager edit-scope = conservative (no editing All-props/cross-prop templates); (b) CORPORATE authoring breadth — record in ADR-020 |
| 4 — Completed view + home revamp + resume + photo meta | [x] | **DONE + MERGED + LIVE IN PROD 2026-06-27** — subagent-driven, 7 tasks + final opus review (READY, no Critical/Important) + 2 fixes. Plan: `docs/superpowers/plans/2026-06-24-plan4-completed-home-resume-photometa.md`. `Photo.capturedAt` (additive); mark-opened action stamps `openedAt`+IN_PROGRESS on first open; client photo capture-timestamp threaded capture→draft→submit→DB; shared `PhotoFigure` shows time+geo on review detail; `/completed` (property/date/assignee filters); Home split To-do/Done/Recently-completed + Resume CTA (i18n EN+ES); nav Completed. **102/102 tests, build 24 routes.** Deferred-minor: PhotoFigure coord-guard/alt, CompletedFilters `key`, `/completed` pagination |
| 5 — Manager dashboard + reports + PDF | [x] | **DONE + MERGED + LIVE IN PROD 2026-06-27** — subagent-driven, 7 tasks + final opus review + fix wave (back half built in a burst, reviewed at end). Plan: `docs/superpowers/plans/2026-06-25-plan5-dashboard-reports-pdf.md`. `@react-pdf/renderer@4.5.1` (de-risk-gated, server-external); `/dashboard` (5 scoped alert tiles); `/reports/completeness` + `/reports/issues` (property/date/status/priority filters, `summarizeCompleteness` tested); single-checklist PDF (`/api/checklists/[id]/pdf`, photos w/ time+geo, signatures) + both report PDFs (`/api/reports/*/pdf`, Node runtime, parity w/ screens); nav Dashboard + Reports. **109/109 tests, build 30 routes.** Deferred-minor: PDF table cell truncation; ET-exact issues date bound |
| 6 — Recurrence polish | [ ] | After Kate reviews `/rules` (auto-create already ~built Phase 5) |
| 7 — Template hard-delete | [ ] | 🧑 You confirm: hard-delete 9 placeholders + dependents, **row-count-confirmed first**, run LAST (after real templates exist) |

---

## Near-Term Execution Plan (as of 2026-06-16)

Tactical sequence layered on top of the numbered phases below. `🧑 You` = needs the user. Update each session.

### Phase A — Verify & merge this branch (`claude/rise8-operations-platform-rv9B6`)
| Status | Item |
|---|---|
| [x] | Issue resolution photos (ADR-016) — dual-owner `Photo`, presign `issue` scope, capture + display |
| [x] | Connecteam-familiar UI structural pass (ADR-017) + re-skin to brand `navy` token |
| [x] | Merge `origin/main` → branch (branding/fonts/login fix); CLAUDE.md conflict resolved |
| [x] | Build fix: `prisma generate` in build script (commit `8e64cfa`) — stale-cache type errors |
| [x] | Preview build READY + `/login` serves 200 with brand navy + Nunito (verified 2026-06-16) |
| [x] | ~~Click-through Preview of authed routes~~ — skipped Preview; went straight to prod per Kate's default-to-Prod rule |
| [x] | 🧑 You: add 4 `R2_*` vars to Vercel **Production** — **done 2026-06-19** via `vercel env add` (piped from `.env.local`; Production only, all 4 Encrypted). **Re-verified present 2026-06-20** via `vercel env ls production` |
| [x] | Merge branch → `main` → production deploy — **done 2026-06-19**. FF merge `d274e1e..26cdc36`; local prod build passed (16 routes); prod deploy Ready; `/login` 200, `/review`+`/issues` 307 (auth redirect, no 500s). Phase 4 + photos + UI shell now LIVE |

### Phase B — Close Phase 4 (ALPHA exit)
| Status | Item |
|---|---|
| [~] | **Review + issue-assignment emails wired 2026-07-02** (`0130c3b`): the 4 events that had SKIPPED rows now send via Resend — `review_approved/flagged/redo` → submitter + `issue_assigned` → assignee. `lib/email.ts sendEmail()` + `lib/notify-copy.ts` (bilingual, ADR-013) + `lib/notify.server.ts` (post-commit deliver, settles EMAIL row SENT/FAILED/SKIPPED, never fails the action). **Scope correction:** submit→manager notification, activation email, unassigned-queue digest are **net-new** (not logged today / temp-pw model / cron-side) — NOT flips. Decide if submit→manager is worth building next |
| [ ] | 🧑 You: record alpha demo for Rob |
| [ ] | Extend structural redesign: checklist runtime → review → issues → admin |

### Phase C — Field-team interview (Kyle) — unblocks content/decisions
| Status | Item |
|---|---|
| [ ] | Template question content · recurring-rules matrix · SLA confirm · ES reviewer — **hold Phase 5 build until done** (guide: `ChecklistTeamInterviewGuide_RISE8_060526.md`) |

### Phases D–F → the numbered phases below
- **D** = Phase 5 (recurrence / bulk / assignment / ADR-014 invalidation)
- **E** = Phases 6–7 (feature-complete + **deep Claude Design polish pass** + PDF/offline/hardening/Teams digest)
- **F** = Phases 8–11 (training → contractor checklists → quick tasks → parallel run → **cutover Week 14**)

---

## Phase 0 — Pre-Build Sign-off (NOW)

| Pri | Status | Task | Owner | Notes |
|---|---|---|---|---|
| P0 | [x] | PRD finalized | Kate | `docs/PRD.md` |
| P0 | [x] | Architecture finalized | Kate | `docs/ARCHITECTURE.md` |
| P0 | [x] | 8-week sprint plan finalized | Kate | `docs/SPRINT_PLAN.md` |
| P0 | [x] | ADRs 001–006 recorded | Kate | `docs/DECISIONS.md` |
| P0 | [ ] | Rob sign-off on scope + budget | Rob | **Deferred 2026-05-21** — Phase 1 build proceeds without blocking |
| P0 | [x] | Resolve: is Jacksonville North (812) in scope? | Kate | **YES — 8th property confirmed 2026-05-21**; align seed accordingly |
| P1 | [x] | Confirm subdomain — **ops.rentstayable.com** (added to Vercel; DNS records added 2026-05-20, propagation pending) | Kate | Resolved 2026-05-20 |
| P1 | [x] | Confirm MFA default for managers/corporate (on by default vs opt-in) | Kate | **On-by-default for managers/corp; optional for field staff** — resolved 2026-05-21 |
| P2 | [ ] | Confirm actual Connecteam monthly invoice for savings figure | Kate | Validates ROI in sprint plan |

---

## Phase 1 — Week 1: Foundation & iOS PWA De-risking

**Goal:** Skeleton stands up. iOS PWA + photo capture + GPS validated on real devices.

### Mon — Repo / Vercel / Neon / Next.js
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | `pnpm create next-app` — Next.js 15.5.18, TS, App Router, Tailwind v4, ESLint 9 (commit `233c483`) |
| P0 | [x] | Add shadcn/ui (init defaults, slate base, `@base-ui/react`) (commit `e22e981`) |
| P0 | [x] | Folder structure: `/app /components /lib /prisma /emails /scripts` |
| P0 | [x] | `.env.example` with all vars from ARCHITECTURE §8.3 (+ `DIRECT_URL` for Prisma) |
| P0 | [x] | `.gitignore` baseline (keeps `.env.example` tracked) |
| P0 | [x] | Initial commit: `chore: initial project scaffold` |
| P0 | [x] | Connect GitHub → Vercel project, auto-deploy on push (preview deploy succeeded) |
| P0 | [x] | Create Neon project, set `DATABASE_URL` + `DIRECT_URL` in Vercel envs — **confirmed 2026-05-30 via `vercel env ls`: both present, scoped Production + Preview** (Development not set — fine, local uses `.env.local`) |
| P0 | [x] | Merge scaffold branch → `main` so production deploys are real (PR #1, merge commit `aa90bfe`, 2026-05-22) |
| P0 | [x] | **i18n scaffold (ADR-013):** install `next-intl`, configure middleware-based locale routing, scaffold `messages/en.json` + `messages/es.json`, add locale provider to root layout |
| P0 | [x] | **Datetime helper (ADR-013):** `lib/datetime.ts` exposing `formatInET(dt, pattern)` + `etToday()`; ESLint rule blocking direct `toLocaleString` / `Intl.DateTimeFormat` outside this file; install `date-fns-tz` |

### Tue — Auth.js v5 (Credentials)  *(shipped 2026-05-30, commit `7d81b96`)*
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Auth.js v5 Credentials provider wired up (next-auth 5.0.0-beta.31) |
| P0 | [x] | bcrypt (cost 12), JWT session, 30-day rolling expiry — verified live (session role+locale+30d expiry) |
| P0 | [x] | `/app/login` (bilingual EN/ES) + `/api/auth/[...nextauth]`. **`/app/signup` intentionally deferred to Phase 2** (admin-provisioning model) |
| P0 | [x] | `/lib/auth.ts`, `/lib/db.ts` (Prisma singleton) |
| P1 | [x] | Account lockout 5/15/30 — pure `lib/auth-throttle.ts` + wired; **now covered by Vitest (9 cases) as of `180b12d`** |
| P2 | [~] | TOTP MFA scaffolding — schema fields (`mfaEnabled`/`mfaSecret`) exist; enable/verify flow deferred |

### Wed — Prisma schema + seed
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Prisma schema: `users` (incl. `locale` enum per ADR-013), `properties`, `user_properties` (per ARCH §4.1) |
| P0 | [x] | Migration `0001_init_users_and_properties` (applied to Neon as `20260527190517_init_users_and_properties`) |
| P0 | [x] | `geofence` as `Json` (GeoJSON) — PostGIS deferred |
| P0 | [x] | Seed script: 8 properties (all 2-letter short codes per ADR-011) + admin + 1 MANAGER + 1 HK at LL (4645) |
| P0 | [x] | Register seed in `package.json` |

### Thu — PWA shell  *(code shipped 2026-05-30, commit `180b12d`)*
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | `app.webmanifest` (scope `/`) + placeholder SVG icons (192/512/maskable). Left `/ios-spike`-scoped `manifest.webmanifest` untouched |
| P0 | [x] | Service worker registered via `/lib/pwa.ts` (prod-only). **Hand-rolled stand-in** (precache shell + network-first nav + `offline.html`) — swap to Workbox `generateSW` once it plays nice with Turbopack |
| P0 | [x] | `InstallPrompt.tsx` — Chrome `beforeinstallprompt` + iOS Add-to-Home-Screen guide (bilingual) |
| P0 | [x] | `/app/install` page (screenshots are placeholder text steps; real screens w/ Phase-7 branding) |
| P0 | [x] | Online/Offline status indicator in header (`OnlineStatus.tsx`, bilingual) |
| P0 | [ ] | Install + verify on real iPhone (iOS 17+) — **needs device** |
| P0 | [ ] | Install + verify on real Android (Chrome) — **needs device** |

### Fri — Photo capture POC (CRITICAL DE-RISK)
| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Cloudflare R2 bucket `rise8-ops-staging` + scoped API tokens — **live 2026-06-05** (object-scoped token; R2 has NO versioning — ADR-015; Bucket Lock for prod = Phase 8) |
| P0 | [x] | R2 CORS allow PUTs from dev + Vercel preview URLs — set 2026-06-05 (localhost:3000 + ops.rentstayable.com + *.vercel.app) |
| P0 | [x] | `/app/photo-test` page with `input[type=file] capture="environment"` (commit `180b12d`) |
| P0 | [x] | Independent `navigator.geolocation.getCurrentPosition()` capture (`lib/image.ts`) |
| P0 | [x] | Client-side compress: 1920px long edge, JPEG 85, ~500KB (`lib/image.ts`, shared w/ spike) |
| P0 | [x] | `/api/photos/presign` shipped (test + response scopes, auth/RBAC-gated). No separate `/save` route — photos persist inside the submit action (ADR-015). `/photo-test` round trip verified in browser 2026-06-05 |
| P0 | [x] | EXIF read via `exifr` (chosen; confirms iOS strips GPS → separate capture justified) |
| P0 | [ ] | Test matrix: iPhone PWA, iPhone Safari, Android PWA, Android Chrome, Desktop Chrome — **needs devices + R2** |
| P0 | [ ] | Record results in `docs/PWA_TEST_RESULTS.md` |
| P0 | [~] | Throwaway de-risk spike shipped: `/ios-spike` (standalone manifest + GPS / camera / canvas-compress, no R2). Pushed → on a **Preview** URL. **Awaiting Kate's on-device iPhone test (launch from home screen, confirm Standalone:YES).** |
| P0 | [!] | **GO/NO-GO decision: iOS PWA viability** — pending the on-device spike result; escalate to Kate if GPS fails in standalone |

### Week-1 DoD
- [x] Log-in → "Hello, name" works end-to-end (verified 2026-05-30; sign-up path deferred to Phase 2 admin provisioning)
- [~] PWA installs to iPhone + Android home screens — **shell code shipped + builds; on-device install still to verify**
- [x] Test photo round-trips through R2 with GPS captured separately — **desktop Chrome verified 2026-06-05**; phone matrix still open (needs devices)
- [ ] iOS GPS verified (or Capacitor fallback decision escalated) — pending Kate's `/ios-spike` on-device run

---

## Phase 2 — Week 2: Data Model & Admin Scaffolding

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Full schema: `rooms`, `checklist_templates`, `questions`, `recurring_rules`, `checklist_instances`, `responses`, `photos`, `issues`, `audit_log`, `notification_log` — migration `20260529204724_add_phase2_core_schema`, commit `b366895` |
| P0 | [x] | All indexes per ARCH §4.2 (photos.geofence_status is plain not partial — Prisma limitation, deferred to raw-SQL migration; table empty in v1) |
| P0 | [~] | Seed: all 9 templates. **Metadata authoritative; question CONTENT is PLACEHOLDER** (`prisma/templates.ts`, 40 q covering all 11 types). **Real Connecteam/Smartsheet question sets still needed — owner Karla/Christopher before go-live** |
| P0 | [x] | Admin UI: list/create/deactivate users, one-click password reset, multi-property assignment (`/admin/users`, audit-logged, Zod-validated). Resend deferred → temp password shown once instead of email. Commit `7777710` |
| P0 | [x] | Admin UI: list properties + geofence-status + map placeholder (`/admin/properties`, read-only) |
| P0 | [x] | Admin UI: list templates + questions read-only (`/admin/templates`) |
| P0 | [x] | RBAC (ADR-013): `lib/rbac.ts` guards (`requireAdmin`/`requireManager`/`canAccessProperty`/`accessiblePropertyIds`) — server-component/action level, **not edge middleware** (keeps Prisma off edge, consistent w/ auth decision) |
| P0 | [x] | Header property picker (`PropertyPicker`, cookie-backed): shown for scoped users w/ >1 property; auto/hidden for single-property; hidden for CORPORATE/ADMIN |
| P1 | [~] | Admin-only provisioning **done via temp-password** (no public signup ever existed). **Activation-LINK flow specifically deferred** — needs Resend |
| P1 | [!] | Activation email via Resend (7-day TTL, bilingual EN+ES) — **blocked: no Resend creds / wiring deferred** |
| P0 | [x] | Resolve open: field user self-invalidation vs manager-only — **RESOLVED 2026-06-02 (ADR-014): field can request w/ required note → manager/admin approval** |

---

## Phase 3 — Week 3: Checklist Filling (Mobile-First)

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Field user home: today's assignments list (ET-anchored via `etDateOnly`, status chips) — commit `a6ea416` |
| P0 | [x] | Checklist filling page with ordered questions (`/checklists/[id]`, assignee/manager-gated) |
| P0 | [x] | All 11 question types render + validate |
| P0 | [x] | Conditional logic engine (show_if) — `lib/checklist-logic.ts`, **14 unit tests** (incl. MULTI membership) |
| P0 | [x] | Multi-photo capture per question, compressed client-side, **uploaded to R2 at submit via presigned PUTs** (ADR-015); GPS captured per batch, travels with the draft; answer = `{count, photos:[{key,lat,lng,accuracy,sizeBytes}]}` |
| P0 | [x] | Signature capture (`SignaturePad`, pointer canvas → PNG data URL; R2 offload later) |
| P0 | [x] | Draft auto-save to IndexedDB on every change (`lib/draft-store.ts` via `idb`, restored on mount) |
| P0 | [x] | Submit pipeline: validate (client + server) → upload photos → persist responses + `photos` rows w/ server-computed geofence status → SUBMITTED + audit (ADR-015) |
| P1 | [x] | Confirmation screen + return-to-home |
| P0 | [x] | First-login locale picker (`LocalePrompt`, HK/PA/MT → `users.locale` + cookie) |
| P0 | [x] | Spanish translations: field-staff strings (Today, filler, statuses, errors) added to `es.json` — machine-drafted ES ships as-is; **human review moved to Phase 8 per ADR-014** |

---

## Phase 4 — Week 4: Review + Issues  **[ALPHA MILESTONE]**

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Manager review queue — **table view** (ADR-011): row per submission · Status · User · Date · Unit# · Time-to-complete · photo slots (R2-pending placeholders) · row-level Approve/Flag/Re-do — commit `6cfd803` |
| P0 | [x] | Single-submission review — **three-column layout** (ADR-011): left rail (status + manager note + actions) · center (all 11 response types incl. signature) · right rail (audit timeline w/ actor + ET timestamp) |
| P0 | [x] | Approve / Flag / Request Re-do actions with audit entries (`audit_log` + `notification_log`; EMAIL rows SKIPPED until Resend, IN_APP rows PENDING for Phase-6 center) |
| P0 | [x] | Auto-Issue from PASSFAIL=Fail when `fail_flags_issue=true` — at submit, visibility-aware, deduped per (instance, question) vs open issues |
| P0 | [x] | Issues list + detail page (status/priority filters, SLA-breach highlight, assign/status/priority controls) |
| P0 | [x] | Resolution flow: note required ✓; **resolution photos shipped** (ADR-016) — `Photo` dual-owner (nullable `issueId`), presign `issue` scope (cap 5), capture UI on close + geofence-badged display on closed issues. Migration `20260615135350` |
| P0 | [!] | Resend: email on submission to manager — **blocked: Resend creds** (notification_log rows already written as SKIPPED) |
| P0 | [!] | Resend: email on flag to submitter — **blocked: Resend creds** (same) |
| P0 | [ ] | Alpha demo recorded + shared with Rob |
| P0 | [x] | SLA defaults: admin-editable `/admin/sla` + `sla_defaults` table, seeded placeholders (URGENT 4h / HIGH 24h / MED 72h / LOW 168h) — Christopher confirms/corrects values |
| P0 | [x] | Resolve open: bonus rule logic — **SCRAPPED from v1 scope 2026-06-02 (ADR-014)** |

---

## Phase 5 — Week 5: Recurrence, Bulk, Assignment

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | Recurring rules UI (admin/manager) per template per property — **`/rules`** (manager-or-above, property-scoped): list + create form + Pause/Activate/Force-create/Delete, all audit-logged. Commit `8ee7b07` |
| P0 | [x] | Rule patterns: daily / weekly / monthly / quarterly / on-demand — pure engine `lib/recurrence.ts` (`shouldGenerateOn` w/ effective-window + skip-days + month-length clamp; `expandRooms`; ADR-009 ID/label builders). **17 tests**. Commit `db6a03c` |
| P0 | [x] | Vercel Cron 5:00 AM ET: `/api/cron/generate-checklists` + `vercel.json` (`0 9 * * *` = 5 AM EDT/4 AM EST; CRON_SECRET bearer auth). `lib/recurrence.server.ts generateForDate()` idempotent per (template,property,room,date); smoke-tested live. Commit `d3bec23`. **Route is now fail-closed in prod** (commit `9cf069d`): rejects everything until `CRON_SECRET` is set, so it's inert+safe on prod. 🧑 To actually enable 5 AM generation: set `CRON_SECRET` in Vercel Production (and ideally split prod/dev DB first — prod still on dev DB w/ placeholder content) |
| P0 | [ ] | Bulk-create UI: template + property + date(s) + room range/list — **not started** |
| P0 | [x] | Assignment: specific user OR role pool OR unassigned — in rule create form + `generateForDate` (user pins assignee; role/unassigned → unassigned queue, no `assignedRole` column in v1) |
| P0 | [!] | Unassigned-queue digest email (7am ET) — **blocked: Resend creds** |
| P0 | [ ] | Invalidation flow (ADR-014): field-initiated request w/ required note → pending state → manager/admin approve/reject; reason + reassignment audit chain — **not started** (instance schema fields `invalidationReason`/`reassignedToInstanceId` already exist) |
| P0 | [ ] | Resolve open: final recurring rules list per property (PMs) — blocked on field-team interview |

---

## Phase 6 — Week 6: Dashboards, Geofence, Notifications  **[FEATURE COMPLETE]**

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Field Staff Home dashboard |
| P0 | [ ] | Property Manager dashboard (queue, %, issues, heatmap, unassigned) |
| P0 | [ ] | Corporate dashboard (portfolio %, comparison, top issues, scorecards) |
| P0 | [ ] | Issues dashboard (open, SLA breach, repeats) |
| P0 | [ ] | Custom report builder + CSV export |
| P0 | [ ] | In-app notification center + unread badge |
| P0 | [ ] | Geofence polygon editor (Leaflet draw + save) |
| P0 | [ ] | All 7 (or 8) property polygons configured (final coords from Kate) |
| P0 | [x] | Geofence verification on photo upload — **shipped early w/ ADR-015** (`lib/geofence.ts` in-app PIP + 50m buffer, computed at submit) |
| P0 | [ ] | Backfill UNVERIFIED photo geofence statuses once polygons are configured (ADR-015 — reuse `lib/geofence.ts`) |
| P0 | [ ] | 7:00 AM daily PM digest email |

---

## Phase 7 — Week 7: UI Redesign + PDF + Offline + Hardening

### UI Redesign Pass — Claude Design (runs first, before polish-adjacent work)
**Direction (ADR-017):** mirror Connecteam's layout / IA (field-staff familiarity) in **Stayable branding** — not a Connecteam visual clone. Structural/IA work can start before Kate's branding kit; full polish waits on the kit.
**Structural pass started 2026-06-15:** Today/home rebuilt as a Connecteam-style feed (navy header band, progress summary, big touch-target task cards) + role-aware bottom tab bar for managers (`components/BottomNav.tsx` + `AppNav.tsx`: Today/Review/Issues). Deep visual polish deferred to the Claude Design pass (per Kyle). Still to restructure: checklist runtime, review queue/detail, issues, admin.
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Stayable branding kit sourced from Kate — logo, palette, wordmark ("Stayable Operations") |
| P0 | [ ] | Run full app through Claude Design (`document-skills:frontend-design`) — capture screens of every route in current state as baseline |
| P0 | [ ] | Define visual system: typography scale, color tokens, spacing/density, button hierarchy, form treatment |
| P0 | [ ] | Redesign field-staff screens: Today view, checklist runtime (11 question types), photo + signature capture, draft + submit confirmation |
| P0 | [ ] | Redesign manager screens: review queue, review detail, issues list, issue detail, dashboards |
| P0 | [ ] | Redesign admin screens: user list, user provisioning, properties, templates, recurring rules |
| P0 | [ ] | Empty / error / loading / offline states for every screen |
| P0 | [ ] | Side-by-side review with Kate vs functional baseline — approve before merging redesign |
| P1 | [ ] | Lock visual system into a Tailwind config + shadcn theme so future screens stay consistent |

### PDF, offline, hardening
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `@react-pdf/renderer` template matching Connecteam style |
| P0 | [ ] | Single-instance PDF (immediate) |
| P0 | [ ] | Bulk PDF export via Inngest with email link (7-day URL) |
| P0 | [ ] | Offline test: 3 checklists offline → reconnect → sync |
| P1 | [ ] | Load test: 30 concurrent submitters |
| P1 | [ ] | Accessibility audit (keyboard, screen reader basics, contrast) |
| P1 | [ ] | API error-handling pass |
| P0 | [ ] | All P0/P1 bugs from alpha cleared |

### Daily Teams Digest (ADR-010)
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Teams channel inventory: collect 1 corporate + 8 property webhook URLs (Kate) |
| P1 | [ ] | `property_channels` table + admin UI to manage webhooks |
| P1 | [ ] | Digest builder: prior-day misses, flagged issues, photo verification anomalies per property |
| P1 | [ ] | Inngest cron 7:00 AM ET — post master + per-property digests via Incoming Webhooks |
| P1 | [ ] | `notification_log` entries per channel (success / failed / skipped) |
| P1 | [ ] | Admin failure surface (which channels failed in the last 7 days) |

---

## Phase 8 — Week 8: Training & Provisioning

Production-ready milestone shifts to Phase 10 (after Contractor Checklists + Quick Tasks ship) per ADR-012.

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Production domain + secrets + Sentry + Vercel Analytics live (Property Checklist scope) |
| P0 | [ ] | Prod DB seeded: real users, properties, templates, recurring rules |
| P0 | [ ] | All field staff provisioned; activation emails sent |
| P0 | [ ] | **Spanish translation review + sign-off** — full `es.json` pass by bilingual reviewer (TBD: Karla/Christopher/external) **before field-staff training** (moved here per ADR-014) |
| P0 | [ ] | Training session per property (1 hr, recorded) — Property Checklist walkthrough |
| P0 | [ ] | Quick reference card v1 (PDF + printed) — Property Checklist focus; updated in Phase 10 to cover Contractor + Quick Tasks |
| P0 | [ ] | Manager training (1.5 hr) — Property Checklist walkthrough |
| P0 | [ ] | Runbook reviewed + extended with real ops gotchas |
| P0 | [ ] | Support channel established (Teams) |
| P0 | [ ] | Daily 7 AM ET PM email digest live (PRD §8) |

---

## Phase 9 — Week 9: Contractor Checklists (ADR-012)

**Goal:** Magic-link contractor sign-off flow live. CONTRACTOR-audience templates seeded.

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `contractors` table + admin UI to create/edit/deactivate contractor records per property |
| P0 | [ ] | `checklist_templates.audience` enum (`EMPLOYEE` \| `CONTRACTOR`) + admin UI to tag templates |
| P0 | [ ] | `checklist_instances.contractor_id` (nullable FK) + creation flow targeting contractor records |
| P0 | [ ] | Magic-link token: signed (JWT or HMAC), single-use, 72h TTL, tied to (instance_id, contractor_id) |
| P0 | [ ] | Replay protection: token consumed on submit, blocked on reuse with clear error |
| P0 | [ ] | Token regeneration as one-click manager action |
| P0 | [ ] | Contractor filling UI: opens directly from link, no login screen, same camera/GPS/signature flow as employee. **Inherits ADR-013 bilingual filling UI**; magic-link URL accepts optional `?lang=es` (manager sets per contractor); default EN when omitted |
| P0 | [ ] | Manager review queue: submitter column shows contractor name + company for CONTRACTOR instances |
| P0 | [ ] | Flag → Issue tagged to contractor record (not user) |
| P0 | [ ] | Seed initial CONTRACTOR-audience templates: Roof PM (contractor variant), Pest Control, HVAC Service, Pressure Washing (contractor variant), Lawn / Landscaping — final list confirmed with Kate during build |
| P0 | [ ] | Code review pass on magic-link token signing + replay protection |
| P1 | [ ] | Contractor PDF export uses contractor name/company in header instead of employee name |

---

## Phase 10 — Week 10: Quick Tasks (ADR-012)  **[PRODUCTION READY]**

**Goal:** Quick Tasks live across all surfaces. Parallel run begins.

### Quick Tasks build
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | `quick_tasks` table + `quick_task_photos` join (max 5 photos per task) |
| P0 | [ ] | Manager / Corporate / Admin creation surface: title, description, property, assignee or role pool, due date, priority |
| P0 | [ ] | Field staff "My Tasks" surface in home; sorted by due date asc → priority desc |
| P0 | [ ] | Field staff task detail: mark IN_PROGRESS → add completion note + optional photos → mark COMPLETED |
| P0 | [ ] | Manager "Open Tasks" view at their property with filters: assignee, priority, status |
| P0 | [ ] | Corporate dashboard: portfolio rollup of open / overdue Quick Tasks per property |
| P0 | [ ] | Manager CANCEL action requires a reason in `completion_note` |
| P0 | [ ] | RBAC: field staff see only their own assigned tasks; managers see their property's tasks |
| P1 | [ ] | Resist scope creep — no recurrence, no review queue, no PDF export on Quick Tasks |

### Production readiness
| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Production environment fully configured (domain, secrets, monitoring, Sentry, Vercel Analytics) |
| P0 | [ ] | Prod DB seeded: real users, properties, templates, recurring rules |
| P0 | [ ] | First production submission completed successfully |
| P0 | [ ] | Manager training extended: Contractor Checklists + Quick Tasks walkthrough |
| P0 | [ ] | Quick reference card updated to cover Contractor + Quick Tasks |
| P0 | [ ] | Parallel run officially active |
| P0 | [ ] | Daily monitoring report → Kate every morning |

---

## Phase 11 — Weeks 11–14: Parallel Run & Cutover

| Pri | Status | Task |
|---|---|---|
| P0 | [ ] | Week 11: daily parity monitoring + P0/P1 fixes within 24h |
| P0 | [ ] | Week 12: perf tuning + UX refinements |
| P0 | [ ] | Week 13: parity check — if ≥ Connecteam baseline for 2 weeks, schedule cutover for Week 14 |
| P0 | [ ] | Week 13: communicate cutover date (1 week notice) |
| P0 | [ ] | Week 14: Connecteam → read-only |
| P0 | [ ] | Week 14: Karla stops manual PDF uploads |
| P0 | [ ] | Week 14: Smartsheet sheets archived |
| P0 | [ ] | Cutover retro scheduled for Week 15 |

---

## Deployment & Ops (2026-05-30 — app is LIVE in prod)

| Pri | Status | Task |
|---|---|---|
| P0 | [x] | **Deployed Weeks 1–3 to production** — live at https://ops.rentstayable.com (merged to `main`, commit `1555776`; custom domain + DNS attached) |
| P0 | [x] | **Fixed prod login outage** — Vercel Prod `DATABASE_URL`/`DIRECT_URL` were empty strings → Prisma threw → NextAuth `Configuration`. Set to Neon conn via `vercel env add --force`, redeployed; login verified |
| P0 | [x] | **Applied Stayable brand foundation** (rentstayable.com) — navy/blue/sky/gold tokens; primary surfaces recolored. Live + verified |
| P0 | [x] | **Fixed fonts never rendering** (2026-06-02, commits `e12ce23`+`605105b`) — root cause: next/font CSS var was on `<body>` but `font-family` is applied on `<html>` (`html{@apply font-sans}`), so the var was undefined at `<html>` → whole app fell back to browser **serif**. Fix: moved font var classes to `<html>`, `font-sans` to `<body>`. Also swapped Roboto+Quicksand → **Nunito** (free rounded-geometric Urbane Rounded match, body+headings). Verified via local prod server + live HTML/CSS |
| P1 | [x] | **Vercel git auto-deploy** — worked cleanly this session (both `git push origin main` → auto prod deploy, no CLI needed). Earlier flakiness not reproduced; watch but likely OK |
| P1 | [ ] | **Rotate temp admin password** (`StayableCheck`) — live on the public domain. **Consciously deferred 2026-06-19** (acceptable for alpha demo); MUST rotate before onboarding real staff. Easiest path: log into admin UI → one-click reset |
| P1 | [ ] | **Authorize Adobe Urbane Rounded** for ops.rentstayable.com (kit `dsq0zcq`) → swap Nunito → real brand font (1-line change). Optional — Nunito is a close free stand-in |
| P0 | [x] | **Prod/dev DB split — DONE 2026-07-25.** Prod on its own Neon `ep-summer-cloud-axmco63q` (us-east-2); Preview+local stay on dev `ep-falling-moon`. migrate+seed+env repoint+redeploy done; `.env.production.local` (gitignored) holds prod strings; rollback = promote `checklist-4gwsbzke8`. RUNBOOK §Splitting the Production DB |
| P1 | [ ] | **Post-cutover follow-ups (new prod DB):** re-rotate admin pw (seeded `StayableCheck`); kate@/bke@ rotate `ChangeMe!2026` via `/profile`; 🧑 user to verify login (admin@ / StayableCheck + OTP → 8 props + kate/bke); note OTP emails land in `@rentstayable.com` inboxes; old prod sessions invalid (re-login) |
| P2 | [ ] | **IT Ticketing** — ON HOLD (plan `docs/ITTicketingPlan_RISE8_072426.md`): Zoho Desk backend deferred; UniFi API confirmed; Kate to send a spec `.md`. Separate from S7 maintenance ticketing |
| P1 | [ ] | **Decide branch workflow** — de-facto this session: commit straight to `main`, auto-deploys to prod. Feature branch `claude/rise8-operations-platform-rv9B6` is now **behind `main`** (missing branding/font commits) — branch fresh off `main` next session or fast-forward it |

## Cross-Cutting Backlog

| Pri | Status | Task |
|---|---|---|
| P1 | [x] | **Vitest setup + unit test for `lib/auth-throttle.ts`** — 9 cases: 5-strike lock, 15-min window reset + boundary, 30-min unlock, success clear. Shipped 2026-05-30 commit `180b12d` |
| P1 | [x] | **Vitest for `lib/checklist-logic.ts`** — 14 cases: conditional `show_if` (incl. MULTI), per-type validation, validateAll. Commit `a6ea416` |
| P2 | [ ] | Add `AUTH_SECRET` to Vercel **Preview** if branch-preview login testing is wanted (Production-only per Kate's default-to-Prod rule) |
| P3 | [x] | ~~Decide fate of stray untracked files~~ — **RESOLVED 2026-07-20**: repo reorg moved superseded status docs → `docs/archive/`, screenshots + Connecteam snapshots → `docs/assets/`, component docs → `docs/component-i|ii|iii/` |
| P1 | [ ] | CI: GitHub Actions — lint + typecheck + unit tests on PR |
| P1 | [ ] | Playwright e2e on login + submit + review |
| P2 | [ ] | Nightly `pg_dump` → R2 backup bucket |
| P2 | [ ] | Sentry alerts wired per RUNBOOK §Monitoring |
| P2 | [ ] | Weekly orphaned-photo cleanup cron (redo-flow resubmits orphan prior R2 objects — ADR-015; must be prefix-restricted, R2 has no undelete) |
| P1 | [x] | Issue resolution photos: dual-owner `Photo` linkage (ADR-016) + capture UI on `/issues/[id]` close flow — shipped 2026-06-15 |
| P0 | [x] | Add R2 env vars (4) to Vercel **Production** — **done 2026-06-19**, then merged branch → main. Prod `/review`/`/issues` no longer at risk of presign throw. **Re-verified present 2026-06-20** via `vercel env ls production` |
| P3 | [ ] | M365 SSO provider (future, additive — does not break field login) |
| P3 | [ ] | Web Push notifications (iOS 16.4+) |
| P3 | [ ] | Capacitor wrapper (only if iOS PWA fails Week 1) |

### Review findings — deferred-minor (audited 2026-07-24)

Deferred-minor items flagged in the Plan 2–5 code reviews, re-verified against current code, then **fixed 2026-07-24** (branch only, NOT deployed; typecheck+lint clean, 134/134 tests, build 31 routes). `[x]` = done/resolved; `[ ]` = still open.

| Pri | Status | Finding | Where |
|---|---|---|---|
| P1 | [x] | **`set-admin-password.ts` no longer hardcodes a password** — reads from `ADMIN_NEW_PASSWORD` env or CLI arg, refuses to run without one. ⚠ *The old literal is still in git history — the actual live password must be rotated separately* | `scripts/set-admin-password.ts` |
| P1 | [x] | **Template builder rows now keyed by stable client `_uid`** (stripped before the action payload) — reorder/delete render correctly | `app/templates/TemplateBuilder.tsx` |
| P2 | [x] | **`/completed` paginated** — 100/page, total count, page N of M, Prev/Next preserving filters (was silent 200-row cap) | `app/completed/page.tsx` |
| P2 | [x] | **PER_ROOM client guard added** — inline "choose a room" before submit. *(Server already rejected this — `checklists/new/actions.ts:66` — so it was a UX gap, not a data bug)* | `app/checklists/new/ManualCreateClient.tsx` |
| P2 | [x] | **Issues report now bounds `createdAt` by ET day starts** via `etDayStartUtc`/`nextYMD` (honors EDT/EST) — no more adjacent-day spill | `app/reports/issues/page.tsx`, `lib/datetime.ts` |
| P2 | [x] | **Dashboard "Checklists with issues" tile added** — distinct instances with ≥1 open sourced issue (6th tile) | `app/dashboard/page.tsx` |
| P3 | [x] | **`/review` queue rows use `title ?? template.name`** — parity with Today/completed/detail | `app/review/page.tsx` |
| P3 | [x] | **PhotoFigure uses `!= null` coord guard + descriptive alt** (geofence label + capture time) | `components/review/PhotoFigure.tsx` |
| P3 | [x] | **Report-PDF free-text cells truncated** (`trunc()` on issue title/checklist) so long text can't blow out the column | `lib/pdf/IssuesPdf.tsx` |
| P2 | [x] | ~~`CompletedFilters` `key={params}` remount~~ — **resolved/moot**: inputs drive the URL; anti-pattern not present | `app/completed/CompletedFilters.tsx` |
| P3 | [ ] | OTP attempt-cap resets on resend — **reclassified low/negligible risk 2026-07-24**: each resend emails a fresh unseen code, so resetting the 5-attempt counter yields no brute-force advantage. Proper hardening = account-level lockout on OTP failures (touches security-reviewed `authorize`); deferred, not worth the regression risk as a drive-by | `lib/otp.ts` + `app/login/actions.ts` + `lib/auth.ts` |
| P2 | [ ] | `AUTH_SECRET` reused as OTP pepper + trusted-device HMAC + NextAuth secret — **deferred to Phase 8**: splitting rotates live secrets (invalidates every trusted-device token + in-flight OTP) and needs coordinated Vercel env changes | `lib/otp.ts`, `lib/trusted-device.ts` |

### Auth / user management (requested Kyle 2026-07-24)

| Pri | Status | Item |
|---|---|---|
| P2 | [x] | **Admin: set a specific password** — **DONE 2026-07-24**: "Set PW" inline input beside Reset in `/admin/users`; `setUserPassword` action (Zod uuid + `validatePasswordStrength` min 8, bcrypt cost 12, clears lockout, audit `set_password`) |
| P2 | [x] | **Self-service Profile page** (`/profile`) — **DONE 2026-07-24**: view name/email + change own password (`changeOwnPassword` verifies current → validates → sets, audit `change_password`); bilingual EN+ES (`Profile` namespace, error codes mapped client-side per ADR-013); User-icon link in shell sidebar + mobile bar |
| P3 | [x] | Provisioning baseline (ops) — **DONE 2026-07-24** (live on shared DB): users = `admin@` (ADMIN) + `kate@`/`bke@` (CORPORATE); deleted Lakeland manager, wiped+deleted Lakeland HK (8 demo instances). **⚠ `db:seed` still re-creates the Lakeland users** — update `prisma/seed.ts` or split the DB so deletions stick |

---

## Open Questions (mirror of PRD §12 — tick when resolved)

| Pri | Status | Question | Owner | Needed by |
|---|---|---|---|---|
| P0 | [x] | Jacksonville North (812) in scope as 8th property? | Kate | **YES — resolved 2026-05-21** |
| P0 | [x] | Subdomain final choice | Kate | **ops.rentstayable.com — resolved 2026-05-20** |
| P0 | [x] | MFA default for managers/corp | Kate | **On-by-default — resolved 2026-05-21** |
| P0 | [x] | Field user self-invalidate, or manager only? | Rob/Kate | **Resolved 2026-06-02 (ADR-014): request w/ note → manager/admin approval** |
| P0 | [x] | Bonus calc logic (Bonus=1 vs 0) | Rob | **Scrapped 2026-06-02 (ADR-014)** |
| P0 | [ ] | SLA defaults per priority — placeholders shipping (4h/24h/72h/7d, admin-editable); Christopher to confirm/correct | Christopher | Week 4, non-blocking |
| P0 | [ ] | Recurring rules per template per property | PMs | Week 4 |
| P0 | [ ] | Final geofence polygons per property | Kate | Week 5 |

---

# COMPONENT II — MAINTENANCE / TICKETING SYSTEM

*New component (ADR-025). Intake → AI triage → human review queue → ticket vs. concern → work-order lifecycle → dispatch → close. Reuses Component I infra (Issue/SLA, audit, Teams digest, geofence, roles). **No AI decides alone** — human review precedes every ticket.*

**Intake model (confirmed 2026-07-07):**
- **Primary (corrected Kyle 2026-07-08):** tenant maintenance requests come via **TurboTenant + Jotform**, today consolidated in **Smartsheet** (current maintenance status/progress tracker — Component II replaces it). **Property managers** own triage/assignment/daily scheduling (in Connecteam today); **Gerardo & Jesus** schedule **contractors** downstream + emergency-contractor coordination (Teams chat: Shayla Shane, Shay Harper, Kyle, Gerardo, Jesus).
- **Additional email channel:** **two-mailbox ingestion — `admin@` + `blake@`** (maintenance emails hard to track / often missed today; Graph consent needed on both; `admin@` is also the app admin login). This is the Zoho Desk replacement lane — ONE channel, not the whole intake. `MAINTENANCE_DESK_SPEC.md` covers only this lane; TT + Jotform ingestion + unified ticket model are separate, larger pieces to spec.
- AI parses each source, extracts ticket details, classifies **ticket vs. concern**.
- **Concerns lane:** payments / refunds / extensions → held, human decides later whether it becomes a ticket.
- **Urgent + contractor-needed:** the **WhatsApp "one front door"** (photos/voice/Spanish) — busted pipe, no power, no hot water, or "we need a contractor." A channel into the same queue.
- **Outlook sync:** track which emails became tickets / became concerns / were responded to.

**📄 Design docs drafted 2026-07-07 (the spec pass — now in staged review, NOT yet built):**
- `MAINTENANCE_DESK_SPEC.md` — technical spec for the email/form desk: MS Graph ingestion → filter → Claude triage → `maintenance_tickets`/`maintenance_messages` tables → multi-agent reply-as-`blake@`. **Replaces Zoho Desk** (runs alongside during build, then retires it). ⚠ References `lib/maintenance/{filter,triage,graph,db}.js` + `SENDER_CATALOG.md`/`SenderFilter_Blake_070226.xlsx` marked `[BUILT]` — **these live in a separate prototype, NOT in this repo; must be ported in.** Model `claude-sonnet-4-6` in the spec is not a real ID → use **Sonnet 5** (`claude-sonnet-5`).
- `MaintenanceTicketingDesignReview_RISE8_070726.md` — **staged sign-off (Kate → Crystal → Rob)** reconciling the StayCheck PRD (issues/work-orders placed *inside* the checklist app, §7/§18/§20) against the new separate-Ticketing direction. **Gates the build.**
- `MaintenanceTicketingScopingQuestions_RISE8_070726.md` — §A–§M build-level questions w/ recommended defaults + a **Top-8 blockers** list.
- `IngestionEngineSketch_RISE8_070726.png` — the "one front door → ingestion engine → 3 lanes (Construction / Maintenance / existing Issues)" whiteboard.

**⚖ Key open architecture decision (recommended, pending sign-off — scoping §A2/A3):** the checklist app *emits* issues; **Ticketing owns the lifecycle** → **migrate the existing `/issues` into Ticketing and retire the standalone page** (SLA/assignment/resolution-photo logic absorbed, not rebuilt). This reframes II.1 from "extend/relate to `Issue`" to "absorb + retire `/issues`."

**Top-8 blockers to answer first (scoping doc):** A2+A3 (issues→Ticketing) · B1+B2 (v1 sources + concerns/leads as tagged tickets) · B3 (lifecycle states) · D1 (Kate: Graph/Entra app-reg + admin consent) · D2 (supply sender-filter catalog files, or rebuild from spec §5) · F1 (`ANTHROPIC_API_KEY` + Sonnet 5) · G3+G4 (auto-create tickets from checklist fails; normal room checklists don't touch Ticketing) · L1 (prod/dev DB split — real tickets/live email must NOT hit the shared dev DB).

**🆕 RE-SEQUENCED BUILD ORDER (Kyle 2026-07-08) — Contractor Dispatch MVP FIRST.** Kyle's call: ship the contractor side first as the fastest, most-independent win (emergencies + contractor scheduling are the sharpest pain and don't depend on tenant-intake/PM plumbing). Build it as a **module inside the existing platform** (NOT a separate app — ADR-025 one-codebase). New order:
1. **Phase II.A — Contractor Dispatch MVP** (see below) — directory → one-tap WhatsApp/call dispatch → emergency flag → contractor calendar.
2. Phase II.1 — unified ticket model + migrate `/issues`.
3. Phase II.2 — tenant form intake (TurboTenant + Jotform).
4. Phase II.3 — email desk (Graph) → II.4 AI triage.
5. Phase II.5 dispatch-a-checklist + auto-close loop; II.6 WhatsApp two-way; II.7 cost.

**⚠ Assumption to confirm before committing II.A:** contractor scheduling is **separable** from the internal daily maintenance schedule (which lives in Connecteam today and is what Component I / the checklist app already replaces). If separable → II.A builds clean with no Connecteam conflict. If entangled (one shared calendar) → II.A must either coexist w/ Connecteam during parallel run or pull internal-task scheduling in too. Connecteam retires ~Week 14, so any dependency is temporary; build II.A as the *permanent* home for contractor scheduling.

*(Prior order, scoping §M2, now superseded: unified ticket model → tenant form → email desk → AI triage → dispatch loop.)*

**Design ownership (review §1.2):** Kate owns Component I; **Crystal Johnson (Head of Operations)** owns Component II design (Ticketing/Dispatch — hers via `ProjectBrief_MaintenanceDispatch_062226.docx`); the checklist↔ticket loop is jointly owned; Rob signs off scope/budget.

**Blocked-on-Kyle/Kate/Crystal/Blake:** (a) complete the staged sign-off chain (Kate → Crystal → Rob); (b) Kate: M365/Entra app-reg + admin consent for Graph `Mail.Read`/`Mail.Send`/`Mail.ReadWrite` on `blake@`; (c) supply the sender-filter catalog files; (d) `ANTHROPIC_API_KEY` set in Vercel; (e) prod/dev DB split (L1).

### Phase II.0 — Design reconciliation & sign-off (GATE — build blocked until done)
| Pri | Status | Task |
|---|---|---|
| P0 | [~] | Spec pass drafted (3 docs, 2026-07-07): desk spec + design review + scoping questions. **+ dispatch brief `TicketingBriefDispatch_RISE8_070826.md`** — **RE-SCOPED 2026-07-08** to contractor scheduling + construction + emergency-contractor flow ONLY (Gerardo & Jesus schedule contractors; they do NOT own maintenance triage). §0 self-serve claude.ai flow → `TicketingAnswersDispatch_…md`. **NOT sent yet** (was about to send the wrong-scope version; caught). |
| P0 | [~] | Staged sign-off: **Kate ✅ reconciled Part 1** → **Crystal (Stage 2 owner/sign-off)**. Ops input SPLIT: (a) contractor+construction → **Gerardo & Jesus** (brief ready to send); (b) maintenance intake/triage/daily scheduling → **property managers** (they run it today via Connecteam + TurboTenant/Jotform/Smartsheet) — **recipient TBD (Q2 open)**, PM brief to be drafted recipient-agnostic + held. → **Rob** (scope/budget). **Kate open micro-decisions:** 1.2 ownership (→Crystal), 1.3 role label (interp: CORPORATE→"Manager" display, confirm w/ Kate). **Construction greenlight moved to ops input** — Rob now budget-only. ⚠ record as ADR when chain closes |
| P0 | [ ] | **Draft PM-facing maintenance-intake brief** (recipient TBD, Q2): TurboTenant + Jotform + email → triage → assign → daily schedule (urgency order) → emergency-to-checklist. This is the flow PMs run today in Connecteam/Smartsheet |
| P0 | [!] | Answer Top-8 blockers (scoping doc) — esp. A2/A3 (issues→Ticketing), D1 (Graph consent), L1 (DB split) |
| P0 | [ ] | Turn signed-off answers → Component II design spec → implementation plan → build |

### Phase II.A — Contractor Dispatch MVP (BUILD FIRST, Kyle 2026-07-08)

*Fastest, most-independent slice: get emergencies to the right contractor fast, and give Gerardo & Jesus a real contractor directory + dispatch surface. Module inside the platform (shared auth/roles/audit/notify). Layers map to my design rec (0→3).*

**Decisions (Kyle 2026-07-13):** (1) **Build ahead of sign-off** — start T1 now, don't wait for the Kate→Crystal→Rob chain (build on branch, deploy is a separate call). (2) **Dispatchers reuse the `MANAGER` role** (no schema change; Gerardo & Jesus get MANAGER accounts scoped to their properties — portfolio dispatch → CORPORATE at provisioning time). (3) **T4 dispatch message includes a magic-link** (pull Phase-9 signed single-use link forward). **Still open (non-blocking for T1–T3):** separable-scheduling assumption (affects T6 calendar) + Gerardo's emergency-classification rule (affects T5 auto-notify trigger; MVP uses a manual URGENT toggle).

| Pri | Status | Task |
|---|---|---|
| P1 | [x] | **T1 — L0 Contractor directory** — **DONE 2026-07-13** (commit `0f86b2b`, branch only, NOT deployed). `Contractor` + `ContractorProperty` join + `Trade` enum; `Contractor.userId` nullable-unique link to `User` so a person is BOTH staff and contractor (Jesús). `/contractors` route (manager-or-above, property-scoped, mirrors `/templates`): list + create/edit + archive; nav between Issues & Rules. Zod+audit+scope-enforced actions (scoped mgrs limited to own props; req ≥1 trade, ≥1 property, WhatsApp-or-phone). `lib/contractors.ts` labels/order + tests. Seed = 4-contractor roster w/ **PLACEHOLDER** numbers (real PII held until DB split; enter via UI). Migration `20260713164200` additive. **134/134 tests, clean types+lint, build 31 routes.** 4 rows seeded to shared DB via scoped one-off (full `db:seed` skipped to avoid dup demo instances) |
| P1 | [~] | **T2 — Minimal contractor job/ticket (NEXT):** subset of the unified `Ticket` (or a lean precursor that migrates into II.1) — property, room, trade, problem, photos, `URGENT` flag, status. Emergency = top priority. Reuse existing R2 photo pipeline; dispatcher (MANAGER) creates manually in MVP |
| P1 | [ ] | **T3 — Match & rank (pure):** given a job, filter directory by property+trade, order **contracted-first**. Testable pure fn in `lib/contractors.ts`. Depends on T1+T2 |
| P1 | [ ] | **T4 — L1 one-tap dispatch:** from a job, surface the right contractor(s), **contracted-first**, one-tap button opening a **pre-filled bilingual WhatsApp (`wa.me`) deep link** (language from contractor's `language`) + `tel:` one-tap for the emergency phone-first-touch to the contracted contractor. WhatsApp is THE contractor channel (no SMS). Human sends (no auto-action). **Decision (Kyle 2026-07-13): message INCLUDES a magic-link** so the contractor can view the job/photos with no account → pull the Phase-9 signed single-use link forward (this is the one place T4 grows beyond "no new infra") |
| P1 | [ ] | **Emergency flag + fast alert:** URGENT job notifies the coordination group (today's Teams chat: Shayla Shane, Shay Harper, Kyle, Gerardo, Jesus) — decide in-app notify vs. Teams webhook. Rule/threshold pending Gerardo's classification answer |
| P2 | [ ] | **Contractor calendar (basic):** assign + schedule contractor jobs; when a contractor is pulled for an emergency, **auto-flag the bumped job to reschedule** (§4.3 C-0b) |
| P2 | [ ] | **L2 — Two-way automation (follow-on, needs vendor):** **WhatsApp Business API** (settled rail — contractors use WhatsApp only) → auto-send on confirm, structured Accept/Decline/ETA (reuse Phase 9 no-account magic-link), **auto-escalation ladder** (no accept in N min → next contractor → group), broadcast-to-pool for true emergencies. **Decision for Rob/Crystal:** cost + Meta Business verification/approval timeline (not "which channel" — WhatsApp is confirmed) |

### Phase II.1 — Ticket / Work-Order model + lifecycle (absorbs S7)
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Data model: unified `Ticket` — **migrate + retire existing `/issues`** (recommended §A2/A3, pending sign-off) — ticket `kind` (maintenance/concern/lead), `source` channel, target date, lifecycle states, required closing photo, recurrence auto-flag |
| P1 | [ ] | Lifecycle: OPEN → TRIAGED → ASSIGNED → IN_PROGRESS → (BLOCKED) → RESOLVED → CLOSED, all audit-logged |
| P1 | [ ] | Ticket vs. "concern" as a first-class field (concern = payments/refunds/extensions, no work order) |
| P1 | [ ] | SLA reuse: map ticket priority → existing `sla_defaults`; urgent (pipe/power/hot water) = top priority |

### Phase II.2 — Web-form intake + manual create
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Public/authed maintenance request form (property, room, category, description, photos) |
| P1 | [ ] | Manager/staff manual ticket create (mirrors Issue create) |

### Phase II.3 — Email ingestion (`blake@`) + AI triage
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Inbound email capture from `blake@rentstayable.com` (M365 / Outlook pull or forward-to-webhook) |
| P1 | [ ] | AI extraction: sender → property/room · problem · location · photos · confidence · ES→EN translate |
| P1 | [ ] | AI classifier: ticket vs. concern; low-confidence → flag for human |
| P1 | [ ] | **Human review queue** — approve → ticket/concern; nothing auto-created without approval |

### Phase II.4 — Outlook sync + concern tracking
| Pri | Status | Task |
|---|---|---|
| P2 | [ ] | Mark/track in Outlook which emails became tickets / concerns / were responded to |
| P2 | [ ] | Concerns view (payments/refunds/extensions) with promote-to-ticket action |

### Phase II.5 — Dispatch queue + scheduling + assignment

> **Current emergency-contractor process (ground truth — Kyle/Gerardo 2026-07-08):**
> - **Flow today:** Crystal + Shayla flag the emergency on Teams → Gerardo/Jesus contact contractors; work details sent over WhatsApp.
> - **Channel split (confirmed Kyle 2026-07-08):** **contractors use WhatsApp ONLY** (→ WhatsApp is THE contractor rail; SMS not needed). **Internal MTs get their maintenance info on Smartsheet** (relevant to the PM/maintenance-intake side + eventual Smartsheet retirement, not to the contractor MVP).
> - **Emergencies: call contracted contractors first** (phone first-touch). Currently the only one under contract is **Orlando Torres (direct hire)**; WhatsApp for the rest.
> - **Most common emergencies = plumbing + electrical.**
> - **Initial contractor roster (seed for the Layer-0 contractor directory):**
>   - *Plumbing:* Orlando Torres (contracted / direct hire), Arlis Velázquez
>   - *Electrical:* Jesús Pérez, Cristina de León
> - **Note (confirmed Kyle 2026-07-08):** "Jesús Pérez" the electrical contractor **is the same person as "Jesus" the contractor-scheduler** — he wears both hats. **Data-model implication:** one person can be *both* an internal scheduler/agent *and* a contractor; the contractor directory and the user/role model must allow that overlap (don't model contractor and staff as mutually exclusive).
> - **⏳ PENDING (Gerardo to answer, Kyle relaying):** *who judges* an issue is an emergency, and *how* it's classified — drives the URGENT-flag rule + auto-notify trigger.
> - **Emergency-dispatch design (my rec, Layer 0→3):** (0) contractor directory w/ trade+coverage+channel; (1) one-tap pre-filled WhatsApp/SMS deep-link dispatch (no new infra); (2) WhatsApp Business API / Twilio two-way accept-decline-ETA + auto-escalation ladder + broadcast-to-pool; (3) contractor calendar w/ auto-reschedule of bumped jobs. WhatsApp primary (they already use it), SMS fallback.

| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Contractor directory (Layer 0): name/company, trades, property coverage, preferred channel + WhatsApp/phone, language, contracted-vs-ad-hoc, active/on-call — seed roster above |
| P1 | [ ] | Dispatch queue: assign to internal MT or contractor; scheduling |
| P1 | [ ] | **Emergency → fast contractor notification** (Kyle 2026-07-08): when an emergency ticket is flagged urgent, alert the right contractor **immediately** — decide channel (call prompt / SMS / WhatsApp / push) + who triggers it (auto vs. human-in-loop). Today it runs through the Teams chat (Shayla Shane, Shay Harper, Kyle, Gerardo, Jesus); goal is to cut time-to-contractor. **Gerardo & Jesus brief §4.3 C-0c gathers the current process + desired speed** — design once answered |
| P2 | [ ] | Contractor assignment via magic-link (reuse Phase 9 contractor flow) |

### Phase II.6 — Urgent / contractor WhatsApp front door (the sketch)
| Pri | Status | Task |
|---|---|---|
| P2 | [ ] | WhatsApp Business inbound channel → same ingestion engine → review queue (photos/voice/Spanish) |
| P2 | [ ] | Urgent routing: pipe/power/hot-water → top-priority ticket + immediate notify |

### Phase II.7 — Cost-per-repair + reporting
| Pri | Status | Task |
|---|---|---|
| P2 | [ ] | Cost capture per ticket; cost-per-repair rollups; maintenance reporting |

---

# COMPONENT III — CONSTRUCTION PROGRESS / SCHEDULING

*New component (ADR-025). Buildout/renovation coordination. **Concept — gated on Rob's decisions file.** Brief: `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md`. Shares the ingestion engine (the sketch's CONSTRUCTION lane) with Component II. Track runs in parallel for planning; no build until greenlight.*

### Phase III.0 — Greenlight (gate)
| Pri | Status | Task |
|---|---|---|
| P0 | [!] | Rob answers brief §5 questionnaire → generates `ConstructionAgentDecisions_RISE8_<MMDDYY>.md` — **blocks all III build** |
| P1 | [ ] | Confirm scope (renovation contractors vs. in-house crew vs. both), #1 pain, launch channel, sequencing (brief §5) |

### Phase III.1 — Progress capture
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Progress % / milestones per project/property |
| P1 | [ ] | Punch-list tracking |

### Phase III.2 — Scheduling
| Pri | Status | Task |
|---|---|---|
| P1 | [ ] | Project/task scheduling; blocker & delay alerts |

### Phase III.3 — Draw / billing documentation
| Pri | Status | Task |
|---|---|---|
| P2 | [ ] | Documentation for draws / billing (photo-verified progress) |

---

*Edit this file as scope shifts. Mirror major changes into `docs/DECISIONS.md` as new ADRs.*
