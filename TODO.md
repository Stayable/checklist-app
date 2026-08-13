# RISE8 Operations Platform — Master Plan & Tracker

**Narrowed to two tracks 2026-08-03** (ADR-028). Tracks C (Maintenance/Ticketing), D (Contractor Dispatch/WhatsApp) and E (Construction) are **out of scope for this codebase** — Kyle is replacing them with a separate system. Their tracker sections, docs and open questions are archived at **`docs/archive/tracks-cde/`**; the contractor/dispatch code was deleted, not hidden.

**Reorganized 2026-07-28.** Pre-reorg tracker preserved verbatim at `docs/archive/TODO_preReorg_RISE8_072826.md` (706 lines, organized by original build-week phases — kept for history and per-task commit detail).

**How to read this file**
- Work is grouped into **2 tracks (A, B)**. Each track has a priority, a state, and numbered phases.
- Phases are ordered. **A phase marked ▶ is the recommended entry point for that track.**
- `§Q` items are **open questions** — they live in one place (§Q) so nothing is answered twice or lost.
- `§SPEC` lists work that is **too vague to build** and needs a design pass first. Don't start these from the tracker line alone.

**Legend** — Priority: `P0` blocks go-live · `P1` must-have · `P2` should-have · `P3` nice-to-have
Status: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked (blocker named) · `▶` start here

---

## 🎯 START HERE (updated 2026-08-13, later)

**🔧 THREE TEAMS-NOTIFICATION DEFECTS FIXED AND LIVE** (`083779a`, deploy `checklist-otrrusfk9` Ready;
736 tests, clean typecheck + lint + build). All three were reported by Kyle and all three were confirmed
against the live `notification_log` before any code changed — nothing here is inferred from reading code.

- **"View ticket" bounced back into Teams.** Yesterday's markdown fix (`db1b9b0`) was right, but the URL
  was **relative**: `NEXT_PUBLIC_APP_URL` is **not set in Vercel Production** and all three link builders
  used `?? ""`, so posts carried `[View ticket](/network/tickets/<id>)`, which Teams resolves against
  `teams.microsoft.com`. New `lib/app-url.ts` with an **absolute** fallback, plus scheme-adding and
  trailing-slash stripping (a bare host reproduces the bug invisibly). **The code no longer needs the env
  var** — see action 15 for setting it anyway.
- **Down-duration measured the cron, not the outage.** `partitionRecovery` stamped every recovery `now`
  (the moment the 10-min check ran), so the reported figure was the sweep's own latency and always came
  out 10–11 min. Now uses the device's **earliest RECOVERY event** after the outage opened. The copy also
  claimed "came back online within 10 minutes" directly above "Down Duration: 11 min" — it no longer
  asserts a bound it never measured.
- **"Down Duration: 0 min" for outages that ran hours.** **No ticket has ever stored 0** — it was
  `downDurationMin ?? 0` printing a NULL as a confident zero. All **92 terminal MASS_OUTAGE tickets** have
  a null duration (a parent has no single trigger event); 8 posts went out that way, worst being
  **TKT-20260812-011 announcing 0 min for a 282-minute outage**. The template now says **"not recorded"**,
  and all three parent-resolve paths record a real duration.

**⚠ Correction to carry forward:** I repeated the retracted "46 of 92 Orlando cameras offline" figure in
conversation this session. It was already retracted on 2026-07-31 (action 7 below) — the real figure is
**2 of 92**, and the genuinely-down set is Lakeland and St. Augustine. Do not act on the 46.

**⚠ Unverified:** no Teams post has been generated since the deploy, so the absolute link is proven by
tests and the payload builder, not by clicking one. Messages **already queued** before the deploy keep
their stored body, so one stale relative link can still appear.

---

## (previous) START HERE — 2026-08-13

**🟢 THE REAL ROSTER IS IN.** 8 property managers (one property each), 2 area managers, 3 remote PMs
promoted from AGENT and narrowed to their own properties, plus Rob and Crystal as CORPORATE. Everyone
holds a per-person starting password (`Ops` + mailbox name) and must change it on first sign-in.
**Nobody has signed in yet** — the first real check is one of them hitting the forced-change screen and
the OTP landing, because a mailbox typo produces an account nobody can ever enter. Re-run
`scripts/print-roster-credentials.ts` to see who still holds a starting password.

**🔐 Two access boundaries moved, and they are the thing to re-read before touching RBAC:**
- **MANAGER LOST Maintenance.** The contractor calendar is portfolio-wide — every contractor's name
  and phone number, and job mutations on any property — so `canAccessMaintenance` is now portfolio
  roles only. If a PM ever needs it, scope `/maintenance` the way Network was scoped; do not widen the
  predicate back.
- **MANAGER GAINED Network, property-scoped.** `canAccessNetwork` only ever answered "may they open
  the section"; nothing answered "which rows", so every network page showed the whole estate.
  `lib/network/scope.server.ts` is the row-level answer and it is applied at **every** query site.

**🟢 CONTRACTOR UPDATE FAN-OUT IS LIVE** (D-14). Receiver deployed, migration applied, secret set on
both sides, 13/13 contractor phone numbers loaded. **Nothing has ever arrived** — the pipeline half
does not exist yet and ships behind an unset `CHECKLIST_APP_URL`. The handoff for that repo is
`docs/ContractorUpdateFanout_PipelineHandoff_RISE8_081326.md`, already mirrored into
`construction_updates`.

**⚠ Owed:** ADR-031 · route-level integration tests for the receiver · the independent review of
11–13 Aug work (D-rev). And nothing built on 12–13 Aug has been opened in a browser by me.

---

## (previous) START HERE — 2026-08-12

**🟢 THE TEST ROUND IS RUNNING.** Nine RPM/GSA testers (`AGENT` role) are live in prod as of
2026-08-12. **First thing to check: has anyone actually signed in?** Nobody has ever authenticated as
AGENT, so the OTP email and the forced-password-change redirect are both unexercised end to end, and a
stuck account is indistinguishable from a lost email. Guide `docs/ChecklistTesterGuide_RISE8_081226.md`.

**What cleared on 2026-08-12** — geofences on all 8 properties (Kyle traced them; photo verification
was inert across the whole portfolio before), and **1,172 rooms** with zoning from a Cloudbeds export
(the 3 per-room templates could not be created at all before). Contractor scheduling went **live with
real data**: 13 contractors, 65 jobs.

**What is left in A6 is content, and only content:** real question text for 9 templates
(Karla/Christopher — both are now testers, staring at the placeholders) and the **recurring-rules
matrix** (property managers), which is now the biggest single gap — nothing generates on its own, so
testers create everything by hand.

**⚠ Owed:** an independent review pass over everything built in-session on 11–12 Aug (see Track D
`D-rev`). Self-review caught three real defects, which is the argument both for and against it.

**✅ SCOPE SETTLED — Kyle, 2026-08-03.** **This codebase is the Checklist app (A) and Network monitoring (B). Nothing else.** Tracks C, D and E are archived to `docs/archive/tracks-cde/` as reference; the contractor/dispatch rail was **deleted, not frozen** — Kyle is replacing it with a system he is building outside this repo, and a hidden-but-present feature is a maintenance cost with no owner. Recorded as **ADR-028**. **Do not restart C/D/E from the archive** — if any of it returns, it returns through a fresh decision.

**✅ Removal complete.** Code deployed (`checklist-h8nrmkmlh`), then migration `20260803120000_drop_contractor_dispatch` applied to `ep-summer-cloud` in that order. Verified after: the three tables and both enums absent from `information_schema`/`pg_type`, `photos.contractor_job_id` gone, `/contractors` `/dispatch` `/j` all 404, 8 properties · 596 devices · 124 tickets intact, `Database schema is up to date!`.

**🧭 Navigation restructured 2026-08-03 (ADR-029).** Flat 14-item list → six sections: **Home · Checklist · Network · Maintenance · Construction · Admin**. Collapsible rail (240px ↔ 56px icon rail with flyouts, state in a server-read cookie); mobile bottom bar carries the same sections and opens a sheet, fixing the 11-items-in-one-row bar. **Home is `/` for every role** — same page, renamed; "Today" retired as a label. Maintenance + Construction ship as stub pages with a `Soon` chip. Pure role predicates moved to **`lib/roles.ts`** so `lib/nav.ts` stays free of server-only imports.

**Branch state, 2026-08-03.** The old working branch `claude/rise8-operations-platform-rv9B6` is **23 ahead / 31 behind `origin/main`** and is now **abandoned by design**. Its only unique content is the parked Twilio consent/invite rail (`7ab342d`…`509be11` + migration `20260730120000`, never merged, never applied to any DB) — leaving it unmerged **is** the archive. Its network commits (`8b7f628`, `0419eb4`, `ceb3468`) are duplicates of work `main` already carries under different SHAs. ⚠ **If that branch is ever reconciled, `InviteKind.ACCOUNT` must survive** — it is staff account activation wired into `app/admin/users/actions.ts`, i.e. Track A functionality that happens to live in the consent rail. It also holds the only copy of `docs/SubsystemIsolationMap_RISE8_073026.md`.

| # | Action | Why it matters |
|---|---|---|
| 1 | ✅ **DONE 2026-07-31 — full-estate monitoring is LIVE in prod.** 3 fabric keys set in Vercel, migration applied, deployed | 16 consoles · 8/8 properties · **596 devices** · 0 blind · console attribution 596/596. §Q1 closed |
| 1b | ⚠ **Close the ~16 flap-artefact tickets** — most were opened for cameras that were never down (see §Q28) | They stop regenerating but will not close themselves. A genuine-vs-artefact split is owed before anyone bulk-closes |
| 15 | 🧑 **Decide: backfill the 92 null down-durations?** Deliberately NOT done as part of the bug fix | Those mass-outage tickets show "—" in the resolved table and are **excluded from the average-downtime tile**, so that average currently reflects standard tickets only and understates outages. Backfilling moves a number Kate reads — a data decision, not a side effect. One short script either way |
| 16 | 🧑 **Optional: set `NEXT_PUBLIC_APP_URL=https://ops.rentstayable.com` in Vercel Production** | Not required — `lib/app-url.ts` defaults to it. Worth doing so future code that reads the env var directly cannot re-create the relative-link bug. ⚠ It is a `NEXT_PUBLIC_*` var, so it is inlined **at build time**: setting it only takes effect on the next deploy |
| 17 | 👀 **Click "View ticket" on the next real Teams post** | 30 seconds. Confirms the link lands on `ops.rentstayable.com` — currently proven by tests and the payload builder, never by a click |
| 4 | 🧑 **Add the 7 remaining `STRIPE_SECRET_KEY_<CODE>`** | Revenue currently covers Jacksonville West only |
| 5 | ✅ **Kate's dashboard asks — DONE 2026-08-01** (`038ff46`) | Ticket CSV export · dashboard date range · per-property status table · resolved-per-property. Remaining slice of her ask: the **console filter** on tickets (display shipped, filter did not) |
| 8 | ✅ **LAUNCHED TO PROD 2026-08-02** (`38c046d..9900fe0`, deploy `checklist-h9g0olu6e`, Ready 59s). Migration `20260801120000` applied to `ep-summer-cloud` **before** the code push · 9 `TEAMS_WEBHOOK_URL_*` set in Vercel **Production only** · verified `/login` 200, `/network` `/network/tickets` `/dashboard` 307, both new cron routes **401 without the secret** (fail-closed), 0 stranded PENDING rows | **Rollback:** `vercel promote https://checklist-dodll3bop-stayable-admins-projects.vercel.app` (the pre-launch prod HEAD `38c046d`) |
| 9 | ⚠️ **LAUNCH BACKFILL APPLIED — read this before wondering why nothing escalated.** The 13 open tickets (all opened Fri 31 Jul 10:58 ET, all already past 4 h) were stamped `escalated_at = 2026-08-01T16:53:52.080Z` so the first sweep announced **nothing**. Verified: `network_ticket_escalated` rows = **0**. Deploying without this would have emailed Gerardo 13 times on a Sunday, about Friday's tickets, before his tagging is even wired | **Nothing is hidden** — `escalationLevel()` is computed from `openedAt`, so the dashboard tile and badges still read 13. **To release the backlog after all:** `UPDATE tickets SET escalated_at = NULL WHERE escalated_at = '2026-08-01T16:53:52.080Z';` then wait one minute |
| 10 | ✅ **NO EMAIL FOR GERARDO — removed 2026-08-02** (`5fe8d5f`, deploy `checklist-5kde7zk4v`). Kyle's call. Escalation is **Teams-only**: posts to General, sends nothing else. `NETWORK_ESCALATION_EMAIL` deleted outright rather than left unused, so no later change can quietly start mailing him; only `NETWORK_ESCALATION_NAME` remains. The post renders **no address** either — a test asserts the body contains no `@` | **Verified in prod: 0 escalation notifications ever, 0 emails ever addressed to gerardo.** Nothing fired before the removal landed — the 13 pre-existing tickets were stamped at launch and a new ticket needs 4 h to escalate, so there was no window |
| 10c | 🧑 **Real Teams @-mention (Kyle: Monday)** | Still unbuilt, and **flow-side** — a genuine tag needs the Power Automate flow to construct an `msteams` mention entity, which this codebase cannot see or verify. Until then the post names the contact in plain text and no code claims to have tagged anyone |
| 10b | 👀 **First 9 AM ET digest lands tomorrow (Mon 3 Aug).** 0 digest rows so far, which is correct — the hourly cron only posts in the 9 AM ET hour | Watch it arrive in General; the card format is already proven by probe |
| 11 | ✅ **ALL 10 CHANNELS EXERCISED — every one accepted (202).** General (Kyle confirmed rendering; em dash + `Cámara` survived, so `charset=utf-8` works live) · TEST · **KW** via a real ticket created+resolved through the production builders · **JN JW KE LL OR SA DP** via a plain "TEST — please ignore" message on 2026-08-02, Kyle's call not to use a ticket-shaped one that could be mistaken for real. Each resolved through its **own** `TEAMS_WEBHOOK_URL_<CODE>` with `rerouted=false`; the probe refuses to send when rerouted, so a missing var cannot masquerade as a pass | 👀 **One human check left:** each message names the property it was *addressed to* (name + short code + property ID), so a mis-pasted URL shows up as the wrong property appearing in the wrong channel. 202 proves accepted, not correctly-wired — only reading the 7 channels closes that |
| 12 | 👀 **Probes now go to the dedicated TEST channel** (`TEAMS_WEBHOOK_URL_TEST`, Kyle 2026-08-01) — resolves through the generic routing as target `TEST`, no code change needed. Latest probe carries **real prod data + real guest counts**. Eyeball the table alignment | The 2nd probe proved a padded text table **collapses** in a card TextBlock → rebuilt as a ColumnSet (`753c2d9`), then sharpened (`876a1cf`) and given live guest figures (`4a5cbc7`). If it still doesn't align, the fallback is one line per property |
| 13 | ⚠ **All 13 open tickets are ALREADY escalated** (prod, read 2026-08-01) — every one is past the 4 h threshold | So the first escalation sweep after deploy fires **13 posts + 13 emails to Gerardo**, at 5/tick ≈ 3 minutes. They are genuine, but it is a backlog flush, not 13 new faults. Tell him first |
| 14 | 🔎 **Worth a look: OR and JN report 0 guests online at midday** | OR is the largest property (109 devices, 92 cameras) and showed **0 guests** while JW showed 58 and DP 29. Could be genuine, could be a portal/site-mapping problem. **Not asserted as a bug** — the figure is derived from Spotipo `last_seen_at` within 5 min, so verify before acting |
| 6 | ~~🧑 Chase the third UniFi account~~ ✅ **CLOSED 2026-07-31** | Three per-fabric keys reach the whole estate. JW and JN are monitored |
| 7 | ~~🧑 Orlando: 46 of 92 cameras offline~~ **RETRACTED 2026-07-31 — it was an artefact.** Real figure: **2 of 92** | The 46 came from reading a decommissioned recorder's stale device list. The genuinely-down set is **Lakeland (13) and St. Augustine (10)** — that is where to look |

**Who decides:** **Kyle develops, Kate reviews, both share every decision.** No sign-off chain, no approval gates. **Rob monitors the launched app only and gates nothing** — never add a "pending sign-off" state for anyone but Kyle or Kate. Crystal, Gerardo, Karla and Christopher supply ops ground truth or content: inputs, never approvals.

**⚠️ Schedule reality:** original cutover was Week 14 ≈ **21 Aug 2026**. A6 (content + geofences), A7, A8 and A11 are all outstanding and the 4-week parallel run has not started. **Week-14 cutover is not reachable.** A re-baselined date is owed (§Q7).

## 🗺️ Track map

| Track | Scope | Pri | State | Next phase |
|---|---|---|---|---|
| **A** | **Checklist App (StayCheck)** — the Connecteam replacement | **P0** | 🟢 Live in prod, ~60% of v1 | A6 (real content + geofences) |
| **B** | **Network Monitoring & IT Ticketing** | P1 | 🟢 Live · **8 of 8 properties, 16 consoles, 596 devices** · lifecycle proven in prod · **Teams notifications LAUNCHED 2026-08-02** (9 channels, escalation, 9 AM digest) | Watch the first 9 AM digest (Mon 3 Aug) · Gerardo @-mention (flow-side) · console filter · B3 hardening · §Q29 SA flap |
| **C** | **Maintenance / Ticketing** | — | 🗄 **Archived, returning later** (ADR-028 amendment). Nothing built, no work scheduled. Ships today as a **nav section + stub page** so the shape is visible | `docs/archive/tracks-cde/` |
| **D** | **Contractor Scheduling** (calendar + daily dashboard) | P1 | 🟢 **LIVE IN PROD 2026-08-11/12** (**ADR-030**). Migration applied, code deployed, **real data loaded**: 13 contractors + 65 jobs from Kyle's Smartsheet week, all assigned. Calendar has job/day popups, collapsed cells, weekend shading. **Scheduling only — dispatch/WhatsApp/consent stay archived and do NOT return** | Watch it in use · §Q35 Delayed status · §Q36 automate the sync |
| **E** | **Construction Progress / Scheduling** | — | 🗄 **Archived, returning later** (ADR-028 amendment). Never had a go/no-go. Ships today as a **nav section + stub page** | `docs/archive/tracks-cde/` |

A and B share one codebase and one deploy (ADR-025) and reuse the same core: auth, RBAC, audit log, notifications, R2 photo pipeline, SLA, geofence. Only two things ever coupled B to the rest — `canAccessNetwork` in `lib/rbac.ts` and `NETWORK_GROUP` in `lib/nav.ts` — and that is worth keeping true.

---

# TRACK A — Checklist App (StayCheck) · P0 · 🟢 LIVE

Live at **https://ops.rentstayable.com**. Prod DB is its own Neon project (`ep-summer-cloud`); Preview + local still share the old dev DB.

## A1–A5 — Shipped and live ✅

Condensed; per-task detail and commit hashes are in the archived tracker.

| Phase | What shipped |
|---|---|
| A1 Foundations | Next 15 + Vercel + Neon + Prisma + R2 + Resend + Sentry scaffold · PWA shell + install page · i18n EN/ES (`next-intl`) · ET datetime helper (ADR-013) · prod/dev DB split |
| A2 Auth & admin | Password + **email OTP w/ 30-day trusted device** (ADR-019, security-reviewed twice) · lockout 5/15/30 · RBAC (`lib/rbac.ts`, tested) · admin users CRUD + reset + set-password · `/profile` self-service · SLA editor · property picker |
| A3 Authoring & filling | Template builder w/ property scoping (ADR-020) · manual create · all 11 question types · conditional logic · **photos → R2 w/ GPS + server-computed geofence** (ADR-015) · signatures · IndexedDB drafts · mark-opened/resume · capture timestamps |
| A4 Review & issues | Review queue + three-column detail (ADR-011) · approve/flag/re-do · **auto-Issue from PASSFAIL fail** · issues list/detail + assignment + SLA · resolution photos (ADR-016) · **S1: verify+lock, admin unlock, completion check, checkout flags, notify toggle, free-text room** |
| A5 Recurrence & reporting | Recurrence engine (17 tests) + `/rules` + **5 AM ET cron (enabled)** · `/completed` w/ pagination · `/dashboard` (6 tiles) · `/reports/completeness` + `/reports/issues` · 3 PDF endpoints · Resend emails on 4 events |

## A6 — Real-world readiness ▶ **P0 — this is the true blocker set**

Everything here is *content and configuration*, not code. **The app cannot be used for real work until these are done**, and none of them are things I can do alone.

**Two of five cleared on 2026-08-12** — geofences and rooms. What remains is content only, and the
nine-person test round is now running against placeholder questions, which is the loudest possible
reminder of it.

| Pri | Status | Item | Owner | Note |
|---|---|---|---|---|
| P0 | [!] | **Real checklist question content** for all 9 templates | Karla / Christopher | All 40 seeded questions are **PLACEHOLDER**. Hard blocker for training and cutover. Both owners are now testers, so they are looking at the placeholders directly. Guide: `docs/component-i/ChecklistTeamInterviewGuide_RISE8_060526.md` |
| P0 | [x] | **Geofence polygons for 8 properties** | Kyle | ✅ **2026-08-12.** Kyle traced all 8 on satellite imagery with deliberate allowance; loaded via `scripts/set-geofences.ts`. Verified VERIFIED at centre, OFF_PROPERTY ~1 km out, spans 109–243 m, no overlaps. Gerardo to re-check on site; his version wins if he redraws |
| P0 | [x] | Geofence editor | — | ✅ `/admin/properties/[id]/geofence` — paste GeoJSON or centre+radius, SVG outline preview, live point tester running the real evaluator. Parser rejects [lat,lng] swaps rather than "fixing" them |
| P0 | [x] | ~~Backfill `UNVERIFIED` photos~~ | — | ✅ **Moot — prod has 0 photos.** Boundaries landed before real capture, so there is nothing to re-evaluate. Do not re-add this |
| P0 | [x] | **Room inventory** | Kyle | ✅ **2026-08-12.** 1,172 rooms from a Cloudbeds export, with zone + room type: DP 153 · JN 127 · JW 133 · KE 167 · KW 160 · LL 157 · OR 135 · SA 140. Unblocked the 3 per-room templates, which could not be created at all before |
| P0 | [!] | **Recurring-rules matrix** — which template recurs how often at which property | Property Managers | `/rules` is built and empty. The 5 AM cron runs and generates nothing until rules exist. **Now the single biggest gap** — testers must create everything by hand |
| P1 | [!] | **Room occupancy is a placeholder** | — | All 1,172 rooms are `VACANT` because the export deliberately excludes occupancy. A recurring rule filtered on occupied/vacant filters a default, not a fact. Needs either PMS sync (S3, blocked §Q12) or manual upkeep — **and there is no room-management UI**, so today it is script-only |
| P1 | [ ] | Confirm SLA hours per priority (placeholders 4/24/72/168h live) | Christopher | Admin-editable, so non-blocking |

## A6c — Real roster provisioned · ▶ **2026-08-13**

| Pri | Status | Item |
|---|---|---|
| P0 | [x] | **15 account changes.** 8 PMs (MANAGER, one property each) · 2 area managers (Shayla JW/SA/JN, Shay KW/KE/OR/DP/LL) · **Ruby, Jeffrey, Erika promoted AGENT → MANAGER and narrowed** from all 8 to DP/KE/OR, JW/SA, LL/KW/JN · **Rob + Crystal as CORPORATE**. Gerardo was already CORPORATE and left alone. The other 6 agents untouched — agents keep Checklist |
| P0 | [x] | **Per-person starting passwords** — `Ops` + mailbox name (`OpsBea`, `OpsShay`). 21 accounts. Only touches accounts nobody has personalized: `mustChangePassword` going false means a real person chose it, which is why **gerardo@ was skipped, not reset**. Kyle/Kate/admin excluded by policy. ⚠ Seven fall under the app's own 8-char minimum (`OpsRb` is 5) — outside the check, not bypassing it, but they could not re-set the same password on `/profile`. Guessable by design; the forced change + the OTP are what make that safe |
| P0 | [ ] | ⚠ **Nobody has signed in yet.** The forced-change redirect and the OTP path are unexercised for every one of these accounts, and a mailbox typo produces an account that can never be entered. `scripts/print-roster-credentials.ts` lists who still holds a starting password |
| P1 | [ ] | Rob's is `OpsRb`, from the mailbox — "Ops + your first name" does not describe it. Tell him directly or rename to `OpsRob` |
| P1 | [ ] | ⚠ **Nothing from 12–13 Aug has been opened in a browser by me** — including whether a scoped manager's `/network` actually renders their properties only |

## A6b — Test round · ▶ **RUNNING since 2026-08-12**

Nine RPM/GSA testers live in prod. Guide `docs/ChecklistTesterGuide_RISE8_081226.md`, launch message
`docs/TestLaunchMessage_RISE8_081226.md`.

| Pri | Status | Item |
|---|---|---|
| P0 | [~] | **9 AGENT accounts created** (abby · bea · carl · christopher · erika · jeffrey · karla · randy · ruby), all 8 properties each, shared start password, forced change on first login |
| P0 | [ ] | ⚠ **Watch the first sign-in.** Nobody has ever logged in as AGENT: the OTP email path and the forced-password-change redirect are both unexercised end to end. A stuck account looks identical to a lost email |
| P0 | [ ] | Collect feedback; triage into A7/A8 |
| P1 | [ ] | Decide whether AGENT survives the test round or is retired — it exists for this, and it is a permanent role in the enum either way |

## A7 — Feature-complete gaps · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | Field-staff home dashboard (beyond today's list) |
| P1 | [ ] | Corporate portfolio dashboard (comparison, top issues, scorecards) |
| P1 | [ ] | Issues dashboard (open / SLA breach / repeats) |
| P1 | [ ] | In-app notification centre + unread badge (`IN_APP` rows are already being written, PENDING) |
| P1 | [ ] | Bulk create UI (template + property + date range + room list) |
| P1 | [ ] | **Invalidation flow (ADR-014)** — field requests w/ note → manager/admin approves; schema fields already exist |
| P1 | [ ] | 7:00 AM ET daily PM email digest (PRD §8) |
| P2 | [ ] | Custom report builder + CSV export |
| P2 | [ ] | Submit → manager email (net-new, not a `SKIPPED` flip) · activation-email flow · unassigned-queue digest |

## A8 — UX, brand, accessibility · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [!] | **Stayable/StayCheck branding kit** — logo, palette, wordmark | Kate (§Q10) |
| P1 | [ ] | Phase-7 design pass: visual system, then field → manager → admin screens |
| P1 | [ ] | Empty / error / loading / offline states for every screen |
| P1 | [ ] | Accessibility pass (keyboard, contrast, screen-reader basics) |
| P1 | [ ] | **Daily Teams digest (ADR-010)** — 7 AM ET, 1 corporate + 8 property channels. §Q11 is now **closed** (all 9 webhooks supplied), and Track B's 9 AM network digest is a working reference implementation: reuse `lib/network/teams-routing.ts` + the hourly-cron-with-ET-hour-gate pattern (ADR-027 §6) rather than a fixed UTC schedule. Note the Graph-vs-webhook question in §Q5 |
| P2 | [ ] | Lock the visual system into Tailwind + shadcn theme |
| P2 | [ ] | Adobe Urbane Rounded authorization (Nunito is the stand-in) |

## A9 — StayCheck v1.1 remaining (S2–S9) · P2 · **needs specs, see §SPEC**

| Phase | Status | What | Note |
|---|---|---|---|
| S2 | [ ] | Room lifecycle (9 states) + **Room Status Board** + **Checkout Queue** + OOO wiring | §SPEC-1 |
| S3 | [!] | Cloudbeds sync adapter (ADR-022) | Blocked: per-property API keys (§Q12) |
| S4 | [ ] | Preventive maintenance: `Asset` registry, interval-from-last-completion, `CONDITION` type, PM compliance | §SPEC-2 |
| S5 | [ ] | Staff performance: Quality Score, completion rate, leaderboard, outliers | §SPEC-3 |
| S6 | [ ] | Insights engine: recurring issues, failure patterns, timing anomalies | §SPEC-3 |
| S8 | [ ] | Report suite, Smartsheet-parity CSV export, before/after compare, per-room photo gallery |
| S9 | [ ] | Full offline sync + conflict notice · push notifications · template version snapshots · starter library |

## A10 — Deferred v1 modules (ADR-012) · P2

| Pri | Status | Item |
|---|---|---|
| P2 | [!] | **Contractor checklists** — magic-link (signed, single-use, 72h), CONTRACTOR-audience templates, contractor review lane. ⚠ **Needs a decision before it can be built (§Q31).** ADR-012 assumed a `contractors` record to issue the link against, and Track D's `lib/job-link.ts` was the reusable HMAC helper — both went out with ADR-028. Either this module carries its own lightweight contractor identity, or it drops out of v1 too |
| P2 | [ ] | **Quick Tasks** — lightweight ad-hoc tasks, no recurrence/review/PDF |
| P2 | [!] | Final CONTRACTOR template list | Kate (§Q13) — moot if §Q31 lands as "drop it" |

## A11 — Launch · P0 (last)

| Pri | Status | Item |
|---|---|---|
| P0 | [!] | **Spanish translation review + sign-off** before field training (ADR-014) | Reviewer unnamed — §Q14 |
| P0 | [ ] | Provision real staff accounts; activation emails |
| P0 | [ ] | Training per property (1 hr, recorded) + manager training (1.5 hr) |
| P0 | [ ] | Quick-reference card (PDF + printed) |
| P0 | [ ] | Prod DB seeded with real users, templates, rules |
| P0 | [ ] | 4-week parallel run vs Connecteam + daily parity monitoring |
| P0 | [ ] | Cutover: Connecteam → read-only, Karla stops manual uploads, Smartsheet archived |
| P0 | [ ] | Rotate temp admin password before real staff onboard |

---

# TRACK B — Network Monitoring & IT Ticketing · P1 · 🟢 LIVE PILOT

Live for **Kissimmee West only** (12 devices: 9 switches, 2 APs, 1 gateway). ADR-026. Docs in `docs/network/`.

## B1 — Built and deployed ✅

Schema (6 tables, 7 enums, `NETWORK_TECH` role) · pure helpers (event mapping, ticket numbering, mass-outage window) · HMAC webhook receivers · 1-min timer cron (5-min auto-ticket, recovery-close) · mass-outage clustering (120s → 1 ticket, advisory lock, 10-min split, cascade close) · `/network` (7 pages) · **T11 UniFi poller** (2-min cron, pull-based, N2/N3/N4 enforced) · Teams webhook delivery (queued in-transaction, delivered post-commit).

## B2 — Prove it and widen it ▶ P1

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | **Lifecycle PROVEN IN PRODUCTION 2026-07-28** — no unplug test needed, it fired on real events: 6 tickets, all auto-resolved. 4 standard (switch offline → 5-min timer → ticket → recovery → close, `downDurationMin` 6) + **2 monitoring-blind** (SS-KISSWEST console dropped its cloud link twice and self-cleared). Teams delivery confirmed: TKT-006 create + resolve both `SENT` |
| P1 | [x] | **ALL 8 PROPERTIES REGISTERED 2026-07-31.** Three per-fabric keys close N1: CENTRAL (9 consoles — LL/KE/OR/DP) · INDEPENDENT (5 — KW + the 4 stale views) · NORTH (6 — **JN, JW, SA**, all previously invisible). **16 monitored consoles, 640 devices** (455 CAMERA, 99 AP, 70 SWITCH, 8 GATEWAY, 8 NVR), **0 blind hosts** — verified by a no-write dry run through the real `decidePoll`. **N5 disproven: Jacksonville North HAS a Network console** (`SS-Jax-North`, 8 devices) — it was invisible, not absent |
| P1 | [x] | **9 consoles registered** across LL/KE/OR/DP (`d720313`). Two corrections the evidence forced: **host ids are ACCOUNT-SCOPED** (same Orlando console yields two ids sharing a MAC prefix), and the four excluded entries are **stale account views, not decommissioned hardware** — Orlando reports disconnected via one account and connected via the other |
| P1 | [ ] | 🧑 **Vercel: add the 3 fabric keys, remove the 2 retired ones.** `.env.local` is done and verified. Prod is still on `UNIFI_API_KEY` / `UNIFI_API_KEY_2`, which the code no longer reads — **deploying before setting them turns polling off entirely** and every property goes monitoring-blind |
| P1 | [ ] | ⚠ **Decide the first-tick behaviour before deploying (§Q28)** — 72 devices are offline right now and prod has no prior state for 628 of the 640, so they all read as first-seen-offline. Mass-outage clustering collapses each property's burst into one ticket + 10-min children, but Orlando alone contributes 46 offline cameras |
| P2 | [ ] | The 4 stale views stay excluded and are now fully explained: `SS-ORLANDO` is a stale *view* (same console is connected in CENTRAL); `SS-JAXWEST` + `SS-St-Augustine` are dead *hardware* whose live replacements are in NORTH. Ingesting them would manufacture 63 phantom offline devices |
| P1 | [ ] | **Orphaned device rows — no reconciliation when hardware leaves UniFi** (§Q32). `AC Pro` (AP, KE) is `OFFLINE` in prod, absent from the payload entirely, `lastSeenAt` never. It stays offline forever and can hold an open ticket forever. One today; it grows with every hardware swap. This is the KE 7-vs-6 |
| P1 | [ ] | **Lakeland: the vendor's two surfaces disagree** (§Q33). Console UI says 112 online / 4 interrupted / 2 offline; the Site Manager API says 105 online / **13 offline** for the same 118 devices. We mirror the API faithfully. 8 of the 13 are Protect cameras the UI calls online. **Do not tune the app to match a screenshot** — someone has to check whether those cameras are recording |
| P2 | [ ] | Registry admin UI (promote the code constant to a `UnifiHost` table) — only needed when a non-developer must edit it |
| P2 | [ ] | Verify Protect **camera-level** status (8 NVRs exist; none visible to this key yet) |

## B2b — Kate's review requests (2026-07-28/29) — ✅ **all shipped** · P1

All pure DB work — no vendor dependency, no credentials needed.

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | "Resolved (30d)" tile + "Recently resolved & closed" table on `/network` (`de420bb`, `1adce30`) |
| P1 | [x] | Revenue per property on the WiFi page (`5d5c866`) |
| P1 | [x] | Date range for revenue (`5d5c866`). ⚠ Guest counts **cannot** be date-filtered — Spotipo ignores date params entirely |
| P1 | [x] | **Device type: column + filter on `/network/tickets`** (2026-07-31, `4862c1e`). Labels centralised in `lib/network/device-type.ts` and reused on the device + property pages, which had been rendering the raw enum. ⚠ The filter uses a relation filter, so it **excludes device-less mass-outage parents** — deliberate, but it means filtered and unfiltered counts can disagree |
| P1 | [x] | **Console attribution** (2026-07-31, `103d715`). `Device.consoleHostId` + `consoleLabel()`; shown under the device name on the ticket list ("on Orlando-NVR2"), on the device page, and as a Console column per property |
| P1 | [x] | **Per-property scoping for the whole section** (2026-08-13, `9701707`). `networkScopeFor` returns `null` for portfolio roles and NETWORK_TECH (its job is the fleet, and it holds no property memberships, so scoping it would show it nothing) and the user's own properties otherwise. `null` and `[]` are deliberately different — `[]` matches nothing, and collapsing them is how an empty membership list becomes full access. Applied at **every** query site: the dashboard's ten aggregates, the ticket list, the CSV export, four detail pages, both ticket mutations, the WiFi summary API. Detail pages **404, not 403** — confirming a ticket exists at a property you cannot see is itself a disclosure. ⚠ **The bug worth remembering:** the scope clause and the user's `?property=` filter both write `propertyId`, so composing them as two object spreads let a URL parameter overwrite the scope. `ticketPropertyWhere` resolves them together and an out-of-scope request yields "match nothing", never "no filter" |
| P1 | [ ] | **Console FILTER on tickets** — display shipped, the filter did not. `consoleOptions()` already exists for the `<select>` |
| P1 | [ ] | Property filter exists; a combined property+console+type filter bar is still Kate's full ask |
| P1 | [x] | **"All" status tab on `/network/tickets`** (2026-08-01, `7487542`, Kyle). The tabs were Open / In progress / Resolved / Closed with no way to select every status — and since the CSV export inherits the screen's filter, **there was no way to export the full history**. Adds an `ALL` sentinel distinct from both a status and `null` (`null` already means "defaulted to open"), and folds the status clause into `ticketWhereFilters` so the page and the export can't drift apart. **Both row caps now announce themselves** — the table's 200-row limit was invisible and the CSV's 10k cap truncated silently, which is worse because a truncated spreadsheet gets totalled |
| P1 | [x] | **Date range on the network dashboard** (2026-08-01, `038ff46`). Reuses the WiFi range helper so "30d" means the same on both screens. Scoped to RESOLVED work and labelled so — open tickets and device status are present-tense, and a historical window over "what is broken now" would be a confidently wrong number |
| P1 | [x] | **Per-property status table** on the dashboard (2026-08-01, `038ff46`): devices / online / offline / unverifiable / open / resolved-in-range, from grouped aggregates not N+1. A property with zero devices reads **"not monitored"**, never a bare 0 |
| P1 | [x] | **Resolved count per property** — the last column of that table |
| P1 | [x] | **Export tickets list (CSV)** (2026-08-01, `038ff46`). `/api/network/tickets/export` reads the same params through the same helpers as the list, so the file IS the screen. 14 columns, RBAC-guarded, 10k cap. `lib/csv.ts` hand-rolled + tested (quoting failures are silent; a device named `AC Pro, Rm 2` would shift every later column) |
| P2 | [ ] | Kate: AP counts look too low — investigated, see §Q2. Likely non-UniFi APs, not a reporting defect |

## B3 — Hardening before webhooks are public · P1

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | **Webhook write-amplification guard** (body-size cap + rate limit). `RawWebhookPayload` is written *before* signature checking, so an unauthenticated POST already writes a row — demonstrated 2026-07-27. ⚠ **Now TWO routes, not one:** `/api/webhooks/contractor-update` inherits the same property by design (capture-before-trust is a contract requirement — a lost webhook there is a contractor's report of a day's work), and it was re-demonstrated 2026-08-13: three unsigned probes wrote three `contractor_update_captures` rows. A guard should cover both receivers, and it matters more now that one of them has a real external caller coming |
| P1 | [ ] | Cron job-claim `FOR UPDATE SKIP LOCKED` |
| P2 | [ ] | Brand-new-cluster crash-window reconciliation sweep |
| P2 | [ ] | Real UniFi/Aruba HMAC scheme + payloads **if** the push path is ever used (the poller made it optional) |

## B4 — Aruba · P2 · **decision, not code**

| Pri | Status | Item |
|---|---|---|
| P2 | [!] | **Does Aruba exist in the estate at all?** Parser, event mapping and route are built but unconfigured and fail-closed. All 8 properties appear UniFi-covered | §Q2 |
| P2 | [ ] | If not: delete `/api/webhooks/aruba` + the `ARUBA` enum path rather than ship a dead route |

## B5 — Teams & Guest WiFi · P2

| Pri | Status | Item |
|---|---|---|
| P1 | [x] | Teams delivery via Power Automate webhook — **built + configured in prod** (verified `teams.configured: true`). Delivery is post-commit off the 1-min cron. Send-only as configured: no message id back, so no threading | §Q5 |
| P1 | [x] | **NINE CHANNELS — routing built 2026-08-01** (`b8f1a0c`, ADR-027). Kyle supplied 1 General + 8 per-property Power Automate webhooks, closing **§Q11**. Property-scoped events (created / resolved / mass outage) go to that property's channel; the digest and escalations go to General. URLs live in **env** (`TEAMS_WEBHOOK_URL_GENERAL`, `TEAMS_WEBHOOK_URL_<CODE>`) because each `sig=` IS the auth — the DB stores only a routing key, so a signed URL never lands in a keep-forever `NotificationLog` row or a backup. A property with no channel **falls back to General, flagged `rerouted`**, never dropped. All 9 verified resolving from `.env.local`; **none has been posted to yet** |
| P1 | [x] | **9 AM ET daily digest → General** (`94020d1`). Overview cards + status-by-property table, per Kyle. Dashboard aggregates extracted to `lib/network/overview.server.ts` and **shared with the page**, so the two can never disagree about how many tickets are open. **Hourly cron gated on the ET hour**, not a daily UTC one: `0 13 * * *` is 9 AM in EDT but 8 AM in EST and `0 14` is the reverse, so no fixed UTC schedule is right year-round. One digest per ET day; `?dry=1` previews the text without sending |
| P1 | [x] | **Realtime escalation notification** (`a2cff1f`). Amends ADR-026 §8 — escalation was display-only, with no stored state to notify from. Adds `Ticket.escalatedAt` as the fire-once idempotency lock (migration `20260801120000`, **NOT on prod**). Posts to General **and emails** `NETWORK_ESCALATION_EMAIL` (default gerardo@rentstayable.com). ⚠ **The email is the real guarantee** — a genuine Teams @-mention needs the Power Automate flow to build a mention entity, which this codebase cannot see or verify, so the post names Gerardo in plain text rather than shipping a "tag" that may render as literal text |
| P1 | [ ] | ⚠ **First escalation sweep after deploy will announce the existing backlog.** `escalated_at` starts NULL, so every open ticket past 4 h escalates at once. Per the 2026-08-01 session there are **14 open tickets and all 14 are genuine** (devices offline now) — so this is real signal, not the artefact storm §Q28 originally feared, but it is still ~14 posts and 14 emails to Gerardo across the first ~3 sweeps at 5/tick. **Tell him it's a backlog flush, not 14 new faults** — or resolve the board first and let escalation start clean |
| P1 | [x] | **"View ticket" made an absolute link — FIXED 2026-08-13** (`083779a`). `db1b9b0` fixed the markdown; this fixed the **URL**. `NEXT_PUBLIC_APP_URL` is unset in Vercel Production and all three builders used `?? ""`, so every post carried a **relative** path, which Teams resolves against `teams.microsoft.com`. `lib/app-url.ts` now owns the base with an absolute fallback and is used by ticket posts, escalations and the digest. Confirmed from the live `notification_log`, not from reading code |
| P1 | [x] | **Down-duration misreporting — FIXED 2026-08-13** (`083779a`). (a) Mass-outage recoveries were stamped at **check-run time**, so the figure measured the cron's own latency and always read 10–11 min; now the device's earliest RECOVERY event. (b) The all-recovered copy asserted "within 10 minutes" above a measured 11 min. (c) `downDurationMin ?? 0` printed NULL as **"0 min"** — 8 live posts, worst was **TKT-20260812-011: 0 min for a 282-minute outage**; the template now says "not recorded" and the three parent-resolve paths record a real duration |
| P2 | [ ] | 🧑 **Backfill the 92 historical null durations?** New rows won't add to the class, but the existing mass-outage tickets still read "—" and stay out of the average-downtime tile. **Kyle's call** — it moves a number on Kate's dashboard. See START HERE action 15 |
| P1 | [ ] | **Ticket close should REPLY to the created-ticket message, not post separately** (Kyle 2026-07-28). Schema is already ready (`Ticket.teamsMessageId` / `teamsMessageUrl`, unused). Two paths — see §Q25. Wanted because an outage generates several posts and a loose "resolved" message makes the channel unreadable exactly when someone is reconstructing what happened |
| P1 | [x] | **Guest WiFi LIVE 2026-07-29** (`a3b2de6`, `1493983`, `5d5c866`). Credentials resolve **env-first** (`SPOTIPO_API_KEY` + `SPOTIPO_SITE_ID_<CODE>`); real guest counts for **8/8 sites (669 total)**. Date range (7d/30d/MTD/90d/12m) applies to revenue only |
| P1 | [x] | **WiFi page re-scoped to TWO sources — Spotipo + Stripe** (2026-08-01, `97dbd5c`, `a272315`). Kyle's call: it is a guest page, so it uses the guest systems. **UniFi removed entirely** (`wifi-live.server.ts` + `/api/network/wifi/online` deleted) — it counted network clients, so switches, cameras and staff laptops were being totalled into a figure labelled guests. **"Guests active now" rebuilt from Spotipo alone**: per-guest `last_seen_at` + a ~1-min portal heartbeat + newest-first ordering ⇒ page-walk with early exit. Live: 8/8 sites, **136 active of 699 registered**. ⚠ Counts guest RECORDS, not devices — Spotipo has no per-device id at all |
| P1 | [x] | **Spotipo rate-limit fix** (2026-07-31, `5a3f4a4`). The "unreachable properties that change every refresh" bug was 8 parallel requests tripping a rate limit — 4×200, 4×429. Now serial at 350ms, single-flighted, 10-min cache, and a failure serves the last good value as **stale with a timestamp** rather than a blank. Also: **403 is a throttle on this API, not only bad credentials** — it was blanking rows permanently |
| P2 | [x] | ~~At-rest encryption for `Property.spotipoApiKey`~~ — **moot**: keys now live in env, never in the DB, so they are absent from backups, query logs and every `Property` read. Closes open decision D6 |
| P2 | [ ] | 7 of 8 properties still need `STRIPE_SECRET_KEY_<CODE>` — revenue shows JW only |
| P3 | [ ] | T8 — Teams reply → `TicketNote` (**requires Graph**, impossible on the webhook) |

---

# TRACK D — Contractor Scheduling · P1 · 🟡 IN BUILD (branch-local, nothing deployed)

Reopened **2026-08-11** by Kyle as a companion to the contractor-update system he is building outside
this repo. **Scheduling only.** Dispatch, WhatsApp, Twilio/A2P consent, signed contractor links and
contractor logins stay archived and are explicitly **not** returning — building a send path would
contradict ADR-028. `Photo` is untouched (ADR-016); jobs have no photos.

- **Spec:** `docs/superpowers/specs/2026-08-11-contractor-scheduling-design.md`
- **Plan:** `docs/superpowers/plans/2026-08-11-contractor-scheduling.md` (9 tasks)
- **Live ledger:** `.superpowers/sdd/2026-08-11-contractor-scheduling/progress.md` — **read this to resume**
- **Branch:** `feat/contractor-scheduling-v2` (from `main` @ `610119b`), HEAD `06a33bb`
- **Written from scratch.** The 2026-08-10 design at `docs/archive/tracks-cde/superpowers/` is
  superseded and **off-limits as a source** (Kyle's instruction) — it was built on `ContractorJob`,
  which ADR-028 had already dropped from `main` and from prod a week before it was written.
- **This repo OWNS contractor + job records** (Kyle, 2026-08-11). Accepted cost: two contractor lists
  that can drift from the external system. If they must agree later, import direction is *into* here.

| Task | Pri | Status | What |
|---|---|---|---|
| D-1 | P1 | [x] | **Schema + additive migration** (`f62cb8e`, review clean). 3 enums + `Contractor`, `ContractorProperty`, `ContractorJob`, `ContractorJobNote`, `ContractorDailyNote`. Verified additive-only; `photos` untouched. Deliberately omits the deleted rail's `contracted`/`onCall`/`userId`/photo relation. `scheduledFor` nullable (null = unscheduled backlog, a real state); `completedAt` a real column so "completed today" is never inferred from `updatedAt` |
| D-2 | P1 | [x] | **Pure ET calendar math** `lib/contractor-schedule.ts` (`b1776a8`, review clean). Day/week/work-week/month, 42-cell month grid, inclusive `@db.Date` range bounds, month-clamping anchor step. Dashed-ymd internally to contain the `etYYYYMMDD`-compact vs `etDayStartUtc`-dashed mismatch. Both 2026 DST transitions tested |
| D-3 | P1 | [x] | **Labels, Zod schemas, sort, note authors** `lib/contractors.ts` (`b3c5233` + fix `222c1f6`, clean after 1 fix round). Fix was a real bug: `resolveNoteAuthor` used plain truthiness so a whitespace-only name rendered a blank author |
| D-4 | P1 | [x] | **Contractor directory** `/maintenance/contractors` (`06a33bb`, review clean, no findings). Archive-never-delete; archived rows stay visible; per-property authorization validates **every** submitted id and additionally prevents a scoped manager's narrower form from stripping out-of-scope ties |
| D-5 | P1 | [x] | **Job lifecycle** `app/maintenance/jobs/**` (`9c50e8a`). The stopped-mid-work version was deleted unread and rebuilt from the brief. `createJob`/`updateJobStatus`/`assignContractor`/`rescheduleJob`/`appendJobNote`: SYSTEM notes land in the same transaction as the change they describe; contractor eligibility re-validated server-side; terminal jobs frozen but still note-able. Self-review closed a hole the brief missed — a shape-valid-but-impossible date (`2026-02-31`) would have reached Prisma as an Invalid Date and surfaced as a 500. **Review gate still owed** (built in-session, not by a reviewed subagent) |
| D-6 | P1 | [x] | **Nav: Maintenance is a real section** (`2ff412b`) with Schedule/Daily/Contractors children; Construction is now the only `unbuilt` one; `/maintenance` redirects to the schedule. Two nav tests failed as predicted and were updated. Added `NavSection.basePath` so `/maintenance/jobs/*` — real routes that are not nav destinations — still highlight their section; deliberately not `href`, which an existing test holds mutually exclusive with `children` |
| D-7 | P1 | [x] | **Calendar** `/maintenance/schedule` (`eeee0c3`) — day/week/work-week/month + persistent backlog rail. Backlog is its own query so the rail shows everything regardless of the range on screen. Jobs bucketed by day **once** rather than filtered per cell (month = 42 cells). All nav is `Link`s, so view state lives in the URL and is shareable |
| D-8 | P1 | [x] | **Daily dashboard** `/maintenance/daily` (`296ff2b`) — 5 tiles, activity table, day nav, append-only written log + composer. `@db.Date` columns compared to UTC-midnight; `completedAt` bounded with `etDayStartUtc`. The portfolio-write trap the plan flagged is real and handled: the portfolio option exists only for portfolio roles, so a multi-property manager with no picker selection can't aim at a write the server refuses |
| D-9 | P1 | [x] | **ADR-030 recorded** + a pointer added inside ADR-028 (a reader who stops there concludes nothing contractor-shaped exists) + tracker + status |
| D-fix | P1 | [x] | **`Contractor.company` now has a write path** (`565ee49`) — optional, trimmed, whitespace-only rejected. Added the field rather than removing the display, since the design lists it as real data |
| D-min | P2 | [x] | **Both minors closed** (`23854d6`). DST week tests now pin the concrete boundary ymds — the consecutive-days check alone would still pass with the whole week shifted by one, which is the failure a DST bug produces. `ContractorJob.contractorId`'s `SetNull` was Prisma's implicit default for an optional relation; now explicit and documented as intended (the app archives contractors, never deletes, so it only governs an out-of-band SQL delete). Generated SQL byte-identical ⇒ no migration drift |
| D-rev | P1 | [ ] | ⚠ **Review gate owed on D-5 through D-9** *and* on everything added 2026-08-12 (popups, weekend styling, the sync, geofence editor, AGENT role, room loader). All built in-session, so verification is tests + typecheck + lint + build + self-review — which did catch real holes (D-5's impossible-date crash, `canManageTemplate` missing AGENT, `/checklists/new` being unreachable) but is not an independent pass |
| D-10 | P1 | [x] | **Job popup + collapsed day cells** (`355203b`). Two-level dialog (day list → job), chips capped per view with `+N more`, backlog rail opens the same dialog. **Read-only by design**: status/assign/reschedule stay on the full page so terminal-immutability and contractor eligibility have one surface each |
| D-11 | P2 | [x] | **Weekend shading + calendar frame** (`106d1b5`). Tinted frame with cells as cards; one documented precedence — today → weekend → workday — and out-of-month days dim rather than replace. `isWeekendYMD` tested incl. both DST Sundays |
| D-12 | P1 | [x] | **Temporary Smartsheet → calendar sync** (`20ed155`, `scripts/sync-contractor-schedule-from-smartsheet.ts`). Sheet wins for status/date/task; **terminal jobs are never reopened**; property changes reported not applied; notes append-only. ⚠ **Manual — the app holds no Smartsheet credential**, so a capture is written to `scripts/data/` and the script runs against it |
| D-13 | P1 | [x] | **Job history is the WhatsApp update** (`04f4838`), not import provenance. 65 provenance notes deleted, 12 real updates attached, resolved via the `audit_log` row-id link. Provenance survives in `audit_log` |

## D-14 — Contractor update fan-out (incoming webhook) · P1 · **not started, either side**

Kyle's separate voice pipeline (`Stayable/contractors-update-whatsapp`) posts each crew update
straight to this calendar, replacing the manual snapshot sync's update path and closing **§Q36**.

- **Wire contract:** `docs/ContractorUpdateFanout_Contract_081226.md` — a **read-only mirror**; the
  other repo owns it and it governs both sides. Do not edit it here.
- **App-side review:** `docs/ContractorUpdateFanout_AppSideReadiness_RISE8_081326.md` — findings,
  build order, and two corrections owed back upstream.
- **Scope fixed by Kyle 2026-08-12:** updates into the calendar, nothing more. No reminders, no
  auto-replies, and **no send path in this repo** — the ADR-028/030 removals stand.
- **Blast radius fixed by Kyle 2026-08-13: "contractor scheduling and the calendar, no more no
  less."** It touches `Contractor*` models, `/maintenance/*` and the Smartsheet plan loader — nothing
  else. It **may affect checklists later; until Kyle says so it does not**, and nothing here should be
  shaped to make that easier. Concretely: `lib/network/hmac.ts` is reused **in place** (promoting it
  to `lib/hmac.ts` is tidier but edits two live network receivers — out of bounds, do not re-propose),
  and `RawWebhookPayload` is not modified.
- Needs **ADR-031** when built.

| Task | Pri | Status | What |
|---|---|---|---|
| D-14a | **P0** | [~] | ✅ **12 of 13 loaded to prod 2026-08-13** (`scripts/backfill-contractor-phones.ts --apply`) from the pipeline's own `proto/roster.csv`, which Kyle pointed at. Was 0 of 13 — the 08/11 import omitted them ("will add later"), so every update would have fallen to name matching. ⚠ **One held: `Alexander Torres`.** Gerardo wrote him as `Alexander Rafael Oropeza Torres` on the 08/03 sheet and `Alexander Torres` on 08/10; the roster's own row is **confidence `medium`, "NOT confirmed by Gerardo"**. Both sides independently flagged the same person, so the script refused the fuzzy match rather than guessing — attaching one man's number to another's record files his work under the wrong name. **Needs Gerardo to confirm they are the same person**, then re-run. §Q40 |
| D-14b | P1 | [x] | **Migration `20260813120000_add_contractor_update_fanout`** — `DELAYED` on `ContractorJobStatus` (closes **§Q35**), `ContractorUpdateResolution`, and **two** tables: `contractor_update_captures` (unconditional, no unique) + `contractor_updates` (`message_sid` unique). Split because capture happens *before* parsing, so a unique key on the capture row would 500 on Twilio's retry instead of returning `duplicate: true`. Not `RawWebhookPayload` — its `source` column is the **device** enum `DeviceSource`. `ADD VALUE … AFTER 'PLANNED'` so the physical enum order matches the declaration order. **Authored only — applied to no database** |
| D-14c | P1 | [x] | **`lib/contractor-update.ts` — pure**, 41 tests. Zod payload (unknown keys **stripped, not rejected**, per §12), version gate that runs *before* validation, real-calendar-date check (`2026-02-31` is shape-valid and `new Date` overflows it to 3 March), phone normalization, status map, and `decideContractorUpdate` returning `apply-status` / `note-only` / `daily-note` / `ambiguous`. `nameKey` has a test asserting it does **not** match the documented variants — the fallback's limit is pinned, not assumed |
| D-14d | P1 | [x] | **`STATUS_MAP` divergence made unrepresentable, not merely tested.** The sync script now *imports* `SOURCE_STATUS_MAP` instead of holding a second copy, so the two paths cannot disagree during the §10.6 overlap window. Status arrays updated in the same change, plus a test that every enum value is **open XOR terminal** — the class, not the instance. The one-shot `import-…-0810-0814.ts` keeps its historical `Delayed → PLANNED` map, annotated: it records what was actually written to prod on 08/11, and rewriting it would misdescribe existing rows |
| D-14e | P1 | [x] | **`POST /api/webhooks/contractor-update`** + `lib/contractor-update.server.ts`. Capture-before-trust, HMAC via `lib/network/hmac.ts` (reused in place), fail-closed in production. **Every non-crash outcome returns 200** — the pipeline puts this call before its non-idempotent Smartsheet comment and Twilio retries any non-2xx, so a 4xx for "could not map" would be retried forever for a payload that will never map. Idempotency is a pre-check *and* a caught `P2002`, so two overlapping queue workers resolve in the database |
| D-14h | P1 | [x] | **No `auditLog` row on this path, deliberately** — `AuditLog.actorUserId` is required and there is no human actor. Attributing to a placeholder (as the sync does, writing everything as `bke@`) puts automated changes under a real person's name in the one table whose job is saying who did what; making the column nullable edits a cross-cutting table for one feature. The `ContractorUpdate` row carries strictly more (messageSid, version, channel, resolution, status applied, matched-by, Smartsheet row id, both stamps) and is indexed for it |
| D-14f | P1 | [x] | ✅ **LIVE IN PROD 2026-08-13.** Migration applied to `ep-summer-cloud` **first**, then deploy `checklist-g1hx1vlk4` (Ready, 1m). Verified in the DB: enum reads `PLANNED → DELAYED → IN_PROGRESS → DONE → CANCELLED`, both tables present, `contractor_updates_message_sid_key` unique index present. Verified over HTTPS: unsigned POST **401**, wrong signature **401**, non-JSON **400**, and `/login` 200 · `/dashboard` `/maintenance/schedule` `/network/tickets` all 307 (no regression). The three probes wrote **3 capture rows and 0 applied rows** — capture-before-trust working, nothing unsigned reaching a job |
| D-14i | P1 | [x] | ✅ **Secret set on both sides 2026-08-13, fingerprint `ec1200b3859d`** — Vercel `CONTRACTOR_UPDATE_SECRET` (Production, Encrypted) and Key Vault `kv-stayable-wa6929/checklist-app-webhook-secret`. ⚠ **Rotated once during setup**: an earlier value was echoed into a session transcript by a PowerShell alias collision (`H` → `Get-History`), so it was replaced on both sides and its three superseded vault versions **disabled**. Nothing had consumed it — the app was not deployed and the pipeline code does not exist. ⚠ Vercel returns sensitive vars empty on read-back, so "both sides match" rests on both writes coming from one source, **not on a comparison** — the real proof is the first signed request |
| D-14m | P1 | [x] | ✅ **Handoff written and mirrored** — `docs/ContractorUpdateFanout_PipelineHandoff_RISE8_081326.md`, the mirror image of that repo's brief: exact endpoint, signing rules (**sign the bytes you send** — a re-serialize between signing and posting changes key order and 401s), a table of every response and what to do about it, and the three conditions that decide whether an update reaches a job. Owned here and mirrored there — the reverse of the contract's ownership, because only this side can verify what the receiver does |
| D-14n | **P0** | [x] | ✅ **13/13 contractor phone numbers live** (§Q40 closed). 12 loaded from the pipeline's `proto/roster.csv`, read at run time and **not committed here** (PII). The 13th needed a human: Gerardo writes the same man as `Alexander Torres` and `Alexander Rafael Oropeza Torres`, roster confidence `medium — NOT confirmed`; the script refused the fuzzy match until Kyle confirmed, then recorded it as a **named alias** rather than by loosening the confidence filter |
| D-14k | P1 | [ ] | 🧑 **ADR-031 owed** — the pipeline posts contractor updates directly to this app; the Smartsheet snapshot sync's *update* path is superseded (its `create` path is not). Closes §Q36 the way §Q36 recommended. The other repo's handoff brief asked for this **first** and it is still outstanding |
| D-14l | P2 | [ ] | **No route-level integration tests.** The 41 new tests cover the pure decision layer; the route wiring is covered only by a build and three live probes |
| D-14j | P1 | [ ] | ⚠ **The pipeline half does not exist.** Handoff written: `docs/ContractorUpdateFanout_PipelineHandoff_RISE8_081326.md` — the exact wire, signing rules, response semantics, and the two proof options. **Copy it into `construction_updates` before working from it** (each side edits only its own repo). ⚠ **Contract §10's "prove on preview first" is not currently available**: the app's Preview scope has no `CONTRACTOR_UPDATE_SECRET` and points at the dev DB that has been unreachable since early August. Either fix Preview or do one controlled production replay aimed at a named job | Nothing can arrive until `construction_updates` builds the §3 call, and it ships behind `CHECKLIST_APP_URL` (unset = off), so its deploy cannot start writing on its own. **Set that variable only after a preview replay passes** (§10 steps 1–3) |
| D-14g | P1 | [ ] | **§10.6 strip:** reduce the sync to its `create` path and rename it a plan loader; delete the update logic. **Only after a full week including a Monday rollover** — the rollover is what proves the design does not key on `smartsheetRowId`. Fix `TRADE_BY_TASK`'s throw at the same time (§9.3): it is a hard error on new task wording, and after the strip that path is the only thing loading a week |

**⚠ Migration `20260811120000_add_contractor_scheduling` is authored but applied to NO database, and no
code is deployed.** Additive, so prod order is **DB first, then code** (the 2026-08-03 drop inverted
that only because it was a drop). Directory ships empty — real contractors must be entered by hand; no
seed roster, deliberately (the last one shipped placeholder phone numbers into the baseline).

**⚠ Not one of these pages has been opened in a browser.** Every claim above rests on 627 passing
tests, clean typecheck + lint, and a build that registers all five routes. Server-rendered layout,
the date input's behaviour on iOS Safari, and whether the month grid is usable on a phone are all
unverified. Hand-off, in order: (1) apply the migration to prod `ep-summer-cloud` from
`.env.production.local`, (2) deploy, (3) open `/maintenance/schedule`, `/maintenance/daily` and
`/maintenance/contractors`, (4) enter real contractors — until then the calendar has nobody to assign.

---

# CROSS-CUTTING — Ops, security, quality

| Pri | Status | Item |
|---|---|---|
| P1 | [ ] | **CI: GitHub Actions** — lint + typecheck + tests on PR. Everything is verified locally today; nothing stops a bad push |
| P1 | [ ] | Playwright e2e on login → submit → review |
| P1 | [ ] | Rotate temp admin password before real staff onboard |
| P1 | [ ] | **`AUTH_SECRET` is triple-purpose** (NextAuth secret + OTP pepper + trusted-device HMAC). Splitting rotates live secrets → coordinated change, deferred to A11 |
| P2 | [ ] | Nightly `pg_dump` → R2 backup bucket |
| P2 | [ ] | Sentry alerts wired per RUNBOOK §Monitoring |
| P2 | [ ] | Weekly orphaned-photo cleanup cron (re-do resubmits orphan prior R2 objects; must be prefix-restricted — R2 has no undelete) |
| P2 | [ ] | Clean **prod R2 bucket** (still `rise8-ops-staging`) + evaluate Bucket Lock |
| P2 | [ ] | Preview environment still points at the **dev DB**; add `R2_*` + `AUTH_SECRET` to Preview if branch previews are wanted |
| P3 | [ ] | OTP attempt-cap resets on resend — reclassified negligible (each resend mails a fresh unseen code). Real fix is account-level lockout on OTP failures |
| P3 | [ ] | M365 SSO · Web Push · Capacitor wrapper (only if iOS PWA fails) |
| P0 | [!] | **On-device verification never done**: iPhone/Android PWA install + iOS GPS in standalone mode. `/ios-spike` is deployed and awaiting a real device | §Q19 |

---

# §Q — Open questions & decisions needed

Grouped by owner. Each says what it blocks and my recommendation, so it can be answered in one pass.

## Kyle

| # | Question | Blocks | My recommendation |
|---|---|---|---|
| **Q40** | ✅ **MOSTLY CLOSED 2026-08-13 — 12 of 13 loaded** from the pipeline's `proto/roster.csv` (Kyle pointed at it). Numbers are read from the sibling checkout at run time and **deliberately not committed here** — 13 real mobile numbers are PII and this repo has kept them out of git before. **One open: is `Alexander Torres` (08/10 sheet) the same person as `Alexander Rafael Oropeza Torres` (08/03 sheet, roster confidence `medium`, "NOT confirmed by Gerardo")?** One question to Gerardo, then re-run the script. Until then his updates land as daily notes, which is the safe failure. Original below | Alexander's updates only | Ask Gerardo |
| **Q40 (original)** | ⚠ **The 13 contractor phone numbers — where do I get them?** The fan-out contract resolves a crew update to a job on `(workDate, contractorPhone)`, matching phone first because the schedule carries name variants (`Ronal S.` vs `Ronal Stevent`). **Prod has 0 of 13 phones and 0 of 13 WhatsApp numbers** — the 2026-08-11 import omitted them on purpose ("will add later"). Your pipeline's Table Storage allowlist is keyed by exactly these numbers; this repo has no source for them | D-14, i.e. the entire fan-out. Without them every update silently lands in `ContractorDailyNote` and the calendar looks unchanged | Export the roster from the pipeline side as `name → E.164` and I will load it. **Do this before pointing the pipeline at production** — otherwise §10 step 4 "watch one real crew message end to end" watches the fallback path, not the feature. Also worth 10 minutes: diff the two rosters by hand, since name matching is the only fallback and the two lists are maintained separately |
| **Q41** | **What should the fan-out do when one contractor has two jobs on one day?** The contract asserts `(date, contractor)` is unique — true of sheet rows, **not an invariant here**: `/maintenance/jobs/new` lets a manager create a second one by hand and nothing prevents it. No collision exists today (65 jobs, all assigned) | D-14c only — a branch in the decision function | **Don't guess.** Write a `ContractorDailyNote` naming both job ids and report it, rather than picking one. Attaching a crew's report to the wrong job is worse than an unplaced note a human can file. Cheap to decide now |
| **Q35** | ✅ **CLOSED 2026-08-13 — `DELAYED` added** (migration `20260813120000`, authored not applied). Pending and Delayed are now distinct on the calendar, and the source vocabulary maps one-to-one onto the enum. `OPEN_JOB_STATUSES` gained it (a delayed job is still live work) and a test pins that every status is open XOR terminal. Original below | — | Closed |
| **Q35 (original)** | **"Delayed" cannot be expressed.** `ContractorJobStatus` is PLANNED/IN_PROGRESS/DONE/CANCELLED, so Smartsheet's Pending *and* Delayed both map to PLANNED — a Pending→Delayed change moves nothing in the status field. The sync records it as a note by tracking the last-seen source status in `audit_log`, or it would be invisible. Three jobs sat in Delayed on 2026-08-12 | Whether the calendar can show what the sheet shows | **Add `DELAYED` to the enum** if it is operationally real, which it looks to be — one additive migration, a label, a colour. Roughly 30 min. Otherwise it stays a note and the two systems disagree on screen |
| **Q36** | **Automate the Smartsheet sync, or wait for the middleware?** The sync is one-way and **manual: the app holds no Smartsheet credential** — the sheet is read through an MCP connection belonging to a Claude session, so only I can trigger it. Hands-off needs a `SMARTSHEET_ACCESS_TOKEN` in Vercel plus a cron route | Whether the calendar drifts from the sheet between asks | ✅ **Answered 2026-08-12 — wait, and the middleware now has a wire contract** (`docs/ContractorUpdateFanout_Contract_081226.md`, D-14). It replaces the sync's *update* path; the `create` path survives as the weekly plan loader, so do not delete the script wholesale. Do **not** automate the snapshot sync now — two paths writing the same status field is how the surfaces start disagreeing |
| **Q37** | **Who maintains room occupancy?** All 1,172 rooms read `VACANT` because the Cloudbeds export deliberately omits occupancy. A recurring rule filtered on occupied/vacant therefore filters a default. **There is also no room-management UI** — rooms are script-only today | Occupancy-filtered recurring rules; the room status board (S2) | Either wire the Cloudbeds sync (S3, blocked on per-property keys §Q12) or accept that occupancy is unused in v1 and **do not offer occupied/vacant filters in `/rules`** until it is real. Do not leave a filter that silently lies |
| **Q38** | **Does `AGENT` survive the test round?** It was added for the nine RPM/GSA testers: checklist-only, excluded from Maintenance/Network/Admin by its own predicate. It is a permanent enum value now either way | Nothing today | Keep it. "Checklist access without contractor scheduling or admin" is a real shape, and retiring an enum value costs more than leaving it |
| **Q39** | **Should session action items go to the Smartsheet Action Items Staging Sheet (1981210199805828)?** The org convention says yes automatically; I have not written any, since adding rows to a shared sheet unprompted seemed worth asking first. Six are outstanding from 2026-08-12 | Nothing technical — process only | Say the word and I will push them. Otherwise this tracker stays the single source and the staging sheet stays for human-entered work |
| **Q30** | ✅ **BUILT 2026-08-01 — "Guests active now", Spotipo-only.** Derived from per-guest `last_seen_at`: the portal heartbeats every connected guest about once a minute, the list is ordered newest-first, so the count is a page-walk with early exit (JW 3 pages of 10, LL 2). Live run: 8/8 sites, 136 active of 699 registered, 12.1s cold. Window **5 min**, labelled on screen; `per_page` caps at 20; a "+" suffix marks a count that hit the 6-page safety cap. **Caveat that stands: it counts GUEST RECORDS, not devices** — Spotipo has no per-device identifier at all (`/device/` `/client/` `/session/` `/online/` `/connection/` all 404, proven with a 200 control either side). Two open follow-ons below | — | Mostly closed |
| **Q30a** | **12s cold render on `/network/wifi`.** The paced sweep is ~30 requests; cached views are instant but the first hit after the 2-min active-TTL expires pays it | WiFi page responsiveness | Options: narrow the window (fewer pages), refresh in the background off a cron into a table, or accept it. Only worth doing if someone actually sits on this page |
| **Q30 (original)** | **Do you want a real Spotipo-sourced "online now", given what it costs?** UniFi was removed from the WiFi page 2026-08-01 (Kyle: guest page, guest sources only), and Spotipo has **no online aggregate** — no flag, and `?online=true` / `?status=online` / `?is_online=1` all return the unfiltered total. The one honest route is counting guests whose per-record `last_seen_at` is recent; that stamp IS live (a JW record read 8 seconds old). **The cost:** it means paginating every guest record on every read — ~700 records portfolio-wide — and those records are PII (name, email, phone). Also unresolved: the max `per_page`, because Spotipo started 403-throttling mid-probe | An "online now" figure on the WiFi page | Only build it if the number is actually used for something. If yes: page with the largest `per_page` the API allows, count in memory, **persist nothing**, define "online" as a stated window (15 min) and label it as such on screen. Same mechanism would answer §Q26's "active in the window" |
| **Q32** | **What should happen to a device that disappears from UniFi?** Prod keeps the row at its last status forever — currently one AP at KE stuck `OFFLINE` with `lastSeenAt` never, holding a ticket. Two sub-questions: the device row, and any open ticket hanging off it | Ticket hygiene; the count on the dashboard | Mark it `UNKNOWN` after N consecutive full successful polls without a sighting (not one — a partial fetch must never mass-orphan the estate), and auto-resolve its open tickets with an explicit "device no longer reported" note rather than a silent close. **Needs your call on N and on whether those tickets close or get flagged for review** |
| **Q33** | **Lakeland: which UniFi surface is telling the truth?** Console UI: 112 online / 4 Connection Interrupted / 2 offline. Site Manager API (what we poll): 105 online / 13 offline. Same 118 devices. The 8 extra are Protect cameras — `G5 Bullet` ×3, `RM-100`, `RM 112 breezeway`, `Rm-130 BW`, `Parking lot B-A`, `G5 Dome`. Also note **"Connection Interrupted" does not exist in the API** — it only emits `online`/`offline`/`adopting`, so we cannot represent that state at all. Evidence: `docs/assets/unifi-audit-080326/` | Whether the offline count anyone quotes is right | **Check whether those 8 cameras are actually recording** — 10 minutes at the property, and it settles which surface to trust. Until then change nothing: matching the app to whichever screen was looked at last is how you get a number nobody can defend |
| **Q34** | **ONLINE-WINS hides 44 Orlando cameras** that the retired recorder reports offline while the live one reports online. Deliberate (`103d715`) and it fixed a real 704-event storm — but it means a genuinely dead Orlando camera is invisible while the live recorder still claims it up. If you were reading the old recorder's view, these 44 are the "more offline devices" you saw | Orlando camera coverage | Keep ONLINE-WINS; the alternative reintroduces the storm. Consider surfacing "reported offline by a secondary console" as an advisory badge — visible, but not a ticket |
| **Q29** | **~3 St. Augustine cameras still flap PROBLEM/RECOVERY every tick** — 6 events per tick, steady across consecutive ticks, so it is not post-fix settling. **Not the two-console collision**: the duplicate probe found zero duplicated devices at SA (all 44 were Orlando). So the vendor's own data is oscillating for these cameras | Residual ticket noise at SA; small but non-zero | Two readings and they need different responses: **real instability at St. Augustine** (SA also has the second-largest genuinely-offline set, 10 devices — suggestive), or a **UniFi Protect reporting quirk** where a camera's status alternates between polls. Next step is cheap: log the raw per-tick status for those MACs over ~10 ticks and see whether the vendor is flipping them or they are genuinely bouncing. Do not add a debounce until that is known — a debounce would mask a real outage |
| **Q28** | ⚠ **PARTIALLY ANSWERED 2026-07-31.** The storm happened (72 events → 14 tickets → 14 Teams posts) and **most of it was a bug, not reality** — see the dedupe fix in `103d715`. Post-fix truth: **34 devices genuinely offline**, not 72, and **Orlando is 2 of 92 cameras, not 46**. What remains open is the **cleanup**: ~16 tickets are still sitting OPEN for cameras that were never down, and nobody has split genuine from artefact. Original question below | Ticket hygiene | Produce the genuine-vs-artefact list, then bulk-close the artefacts. Do not close blind — LL(13) and SA(10) are real |
| **Q28 (original)** | **First-tick ticket storm — how should the poller treat devices that are already offline when monitoring starts?** Prod knows 12 of the 640 devices; the other 628 arrive with no prior state, and 72 of them are offline right now (OR 46 cameras · LL 13 · KE 8 · SA 4 · DP 1). `decidePoll` deliberately emits PROBLEM on first-seen-offline — "a genuine it-is-down-right-now we should act on" — so all 72 fire on tick one | The first production deploy of the 3-fabric registry | Three options: **(a)** deploy as-is and let mass-outage clustering do its job — one parent ticket per property plus 10-min children, so ~5 parents not 72 tickets, and the noise is real signal nobody has looked at; **(b)** seed the inventory with one no-event priming run, so only *changes* from now on generate tickets; **(c)** deploy as-is but check Orlando first — 46 of 92 cameras down at one property is either a real outage or a recorder problem, and it should be understood before it becomes 46 rows. **I'd do (c) then (a).** Kyle's call |
| **Q1** | ✅ **CLOSED 2026-07-31 — full estate visible.** Three per-fabric keys (CENTRAL / INDEPENDENT / NORTH) return 20 host entries with no id overlap: 16 real consoles across all 8 properties, plus the 4 known-stale views. 640 devices, 0 blind hosts, verified by no-write dry run. Two corrections it forced: **N5 was wrong** (Jacksonville North has a Network console) and host ids proved **stable across key rotation within an account**, so the registry survived the swap. Historical detail below | — | Closed |
| **Q1 (history)** | **UniFi account access — mostly SOLVED 2026-07-29.** A third key reached a **second account** and added 9 consoles → 5 of 8 properties now monitored. Three keys tested in total; two saw the same 5, the third saw 9. **Still unreachable: Jacksonville West, Jacksonville North, and a live St. Augustine console** — so a THIRD account exists. Who owns it? | B2, and 7 of 8 properties | Either (a) the owner of those consoles invites this account (per console: Settings → Admins), or (b) a key is created **from** the owning account. ⚠ (a) may not suffice: the Site Manager shows an org/"Fabrics" structure (Stayable Central / North / Independent Sites) and API v1 may only return directly-associated hosts, not org-managed ones. Decisive test either way: re-run the host probe with a key from the owning account — success is **~19 hosts, not 5**. Multi-key support is already built, so a second *account's* key just slots into `UNIFI_API_KEY_2` |
| **Q2** | **Is there any Aruba hardware?** — **now likely YES, and it matters.** Kate flagged the AP counts as too low; investigation confirmed she is right about the physical count but the cause is not our monitoring. The consoles' OWN statistics match what we ingest, so nothing is truncated: KW reports **2 UniFi APs against 236 guest clients and 9 PoE switches**; DP reports **0 APs against 280 wired clients**. LL (39) and SA (40) show the real per-room pattern. A non-UniFi AP plugged into a UniFi PoE switch appears as an ordinary *wired client* — exactly the signature seen. **Decisive check: physically look at one AP at KW or DP and read the brand** (2 minutes). If Aruba, that lane is the missing half of AP monitoring, not dead code to delete | B4, and AP coverage at 4 properties | Check the hardware before writing any more code either way |
| **Q3** | ~~Is Spotipo in use?~~ **ANSWERED: yes.** 8/8 sites live, 669 registered guests. API surface is **only** `/api/v1/guest/` — no revenue, no online-now, no date filtering (21 other paths 404, and date params are silently ignored). Revenue comes from Stripe instead; online-now from UniFi | — | Closed |
| **Q31** | **Do contractor checklists (A10) stay in v1?** ADR-012 put them in v1, but they assumed a contractor record and a signed-link helper that both left with Track D (ADR-028). Rebuilding a minimal contractor identity *inside* the checklist app is maybe a day's work — or A10 drops and contractors keep signing paper | A10, and §Q13 (Kate's CONTRACTOR template list) | **Drop it from v1.** Nothing at cutover depends on it, no CONTRACTOR template has ever been written, and re-introducing contractor identity here is exactly the thing that just got removed. Revisit only if the replacement system can't cover it |
| **Q7** | **Re-baselined cutover date.** Week 14 ≈ 21 Aug 2026 is not reachable; A6 (content + geofences), A7, A8 and A11 are outstanding and the 4-week parallel run hasn't begun. With C/D/E gone, Track A is no longer competing for attention — which is the whole point of the narrowing | Everything downstream of cutover | Finish A6 then A7. A6 is **not code** — it is Karla/Christopher's question content, Kate's geofences, and the managers' recurring-rules matrix, and nothing else in Track A matters until those exist. Pick a date once the question content is in hand, not before |
| **Q19** | On-device PWA + iOS GPS check | A11 confidence, Capacitor fallback | 20 minutes with one iPhone closes a Week-1 risk that is still open in Week 11 |

## Kate

| # | Question | Blocks | My recommendation |
|---|---|---|---|
| **Q26** | **Date-ranged guest counts: "active in the window" or "acquired in the window"?** Spotipo ignores date params, so the only route is paginating every guest and filtering `last_seen_at` locally — which answers *active*, not *acquired*. Different questions | A date-ranged guest figure | Decide which she means before I build it; the two need different data and only one is cheap |
| **Q5** | **Teams: accept the send-only webhook, or hold for Graph?** Webhook = no threading, no message id, T8 impossible. Her DevSpec §5.3–5.4 requires Graph | B5, A8 Teams digest | Ship the webhook now, keep the Graph seam. But this is a documented deviation from her spec and hers to accept |
| **Q9** | **Geofence polygons** for 8 properties | A6 — every photo is `UNVERIFIED` until then | Draw them once the editor exists; then backfill |
| **Q10** | **Branding kit** — logo, palette, wordmark | A8 design pass | Structural work can proceed; polish can't |
| **Q11** | ✅ **CLOSED 2026-08-01 — Kyle supplied all nine webhooks** (1 General + 8 per-property). Routing built and verified resolving (`b8f1a0c`, ADR-027). ⚠ Note these are **Power Automate Workflows** URLs, not the Incoming Webhooks ADR-010 assumed — so A8's checklist digest inherits the same send-only limits (no threading, no message id) | — | Closed. Still owed: an actual post to each of the nine |
| **Q12** | **Cloudbeds per-property read-only API keys** | A9/S3 | — |
| **Q13** | Final CONTRACTOR-audience template list | A10 | — |
| **Q14** | **Who reviews the Spanish?** Karla / Christopher / external | A11 — gates field training | Machine-drafted ES keeps shipping meanwhile (ADR-014) |
| **Q20** | Confirm the CORPORATE→"Manager" display-label interpretation (role stays in DB) | Cosmetic, low | Working interpretation already applied |
| **Q25** | **Threaded ticket notifications** — reply-on-close needs a parent message id, which the current flow doesn't return. Two ways: **(a)** edit the Power Automate flow to respond with the created message id and to accept a `replyToId` (then we store it and send it on close — small change on our side, needs the flow edited and possibly a premium action); **(b)** switch to Microsoft Graph, which returns the message and supports replies natively, and also unlocks reply-ingestion (T8) | B5 threading, and A8's Teams digest formatting | Try (a) first — it's cheap and keeps today's working path. If the flow can't return the id, (b) is the honest answer and Graph was Kate's original spec anyway |

## Others

| # | Question | Owner | Blocks |
|---|---|---|---|
| **Q21** | **Real question content for 9 templates** | Karla / Christopher | A6 — hard cutover blocker |
| **Q22** | **Recurring-rules matrix** per template per property | Property Managers | A6 |
| **Q24** | SLA hours per priority — confirm or correct the placeholders | Christopher | A6, non-blocking |

---

# §SPEC — Plan before building

These are in the tracker as one-liners but are **not buildable from that line**. Each needs a design pass — data model, states, and UI decided — before code. Attempting them straight from the backlog is how you get a half-model that has to be migrated later.

| # | Item | Why it needs a spec first |
|---|---|---|
| **SPEC-1** | **S2 room lifecycle + checkout queue** | 9 derived states, and it interacts with Cloudbeds (S3), OOO flags from checklists, and the checkout flags S1 already ships. Get the state machine on paper first |
| **SPEC-2** | **S4 preventive maintenance** | Introduces an `Asset` registry and interval-from-last-completion scheduling — a second scheduling engine alongside recurrence. Decide whether they share code before writing either |
| **SPEC-3** | **S5 performance + S6 insights** | Both are metric-definition problems, not code problems. "Quality Score = pass ÷ verified" needs agreement on what counts before anything is computed, or the numbers get argued with instead of used |
| **SPEC-6** | **A7 invalidation flow (ADR-014)** | Request → pending → approve/reject with an audit chain, touching instance state that S1's lock now also governs. Two features both claiming instance immutability need reconciling |

---

# Done — reference

Closed decisions worth not re-litigating (full ADRs in `docs/DECISIONS.md`): PWA not native · no Smartsheet write-through · email+password + OTP for all users · 8 properties w/ 2-letter short codes · photos kept forever · all datetimes displayed in ET · bilingual field surfaces only · bonus logic scrapped · UniFi integration is **pull, not push**.

Decisions that belonged to the archived tracks (contractor magic-links instead of accounts, dispatchers reuse `MANAGER`, WhatsApp as the only contractor channel, no AI decides a ticket alone) are preserved in `docs/archive/tracks-cde/README.md` so archiving didn't lose the reasoning.

---

*Update this file as work lands. Mirror significant decisions into `docs/DECISIONS.md` as ADRs. Historical per-task detail lives in `docs/archive/TODO_preReorg_RISE8_072826.md`.*
