# Maintenance / Ticketing System — Scoping Questions

**For:** Kyle (with Rob, Crystal Johnson, Kate)
**By:** Claude Code
**Date:** 2026-07-07
**Purpose:** Lock the design of the **Ticketing System (Component II)** and its connection to the **Checklist App (Component I)** before any build. Answer inline (edit under each question) or in chat. Construction (Component III) is parked — see §K.

**How to read:** each question has a `→ Rec:` — my recommended default. If you agree, just write **"confirm"**. If not, edit it. Priority tags: 🔴 blocks starting the build · 🟡 shapes the build · 🟢 can decide later.

**Source docs reconciled:** `MAINTENANCE_DESK_SPEC.md` (Zoho Desk replacement — email/form), `ProjectBrief_MaintenanceDispatch_062226.docx` (Crystal's crew-dispatch vision — WhatsApp/scheduling/cost), `StayCheckPRD_RISE8_070126.md` (checklist app; §7/§18/§20 = issues + work-order lifecycle), `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md` (Component III), `docs/DECISIONS.md` (ADR-025 three-component split).

---

## A. The big one — where does "issues/work-orders" live?

Kate's PRD puts the issue + work-order lifecycle **inside** the checklist app (§7, §18 bridge, §20). The app already ships an `/issues` pipeline (status, priority, SLA, assignment, resolution photos, notifications). Your new direction: a **separate Ticketing system** that issues *and* maintenance flow into, and users open/work tickets there. These conflict — this section resolves it.

- **A1** 🔴 Confirm the three-component split: **I. Checklist App · II. Ticketing System · III. Construction** — one codebase, separate modules.
  → Rec: confirm (already ADR-025).

- **A2** 🔴 Does the **issue/work-order lifecycle move OUT of the checklist app and INTO Ticketing**? i.e., the checklist app *detects and emits* an issue (from a failed task / structured flag / PM corrective action), and the **Ticketing system owns the lifecycle** (triage, assign, work, close). No second issue tracker in the checklist app.
  → Rec: **Yes.** One place issues live = Ticketing. Checklist app just raises them. This is what makes it "cohesive."

- **A3** 🔴 The **already-built `/issues` feature** — do we **migrate it into Ticketing** (existing issues become tickets with `source = checklist_fail | manager_flag`) and retire the standalone `/issues` page?
  → Rec: **Yes, migrate + retire.** Existing SLA/assignment/resolution-photo logic is reused by Ticketing, so it's not thrown away — it's absorbed.

- **A4** 🟡 "Cohesive so a user isn't lost": the people who work tickets, create checklists, and finish both are the **same people**. Confirm the UX goal = **one work surface** — a single Tickets queue + one ticket detail page where they can also see/dispatch the related checklist — rather than three separate inboxes (Issues / Desk / Checklists).
  → Rec: confirm.

- **A5** 🟡 Nav: rename the existing "Issues" nav item to **"Tickets"** (the desk + all sources live under it). Checklists stay their own nav. Agree?
  → Rec: confirm.

---

## B. Ticketing system — core model

- **B1** 🔴 **Sources** that create tickets in v1 (check all): `email` (blake@) · `form` (tenant) · `checklist_fail` (failed task/flag) · `pm_corrective` (PM corrective action) · `manual` (agent-created). Later: `whatsapp` (crew), `guest_frontdesk`.
  → Rec: all five for v1; whatsapp + guest deferred.

- **B2** 🔴 **Concerns vs tickets.** Non-maintenance mail (payments, refunds, extensions, leasing leads) — same system, tagged/kept in a separate **Concerns** and **Leads** view (per desk spec), or routed out entirely?
  → Rec: **same system, separate views.** A ticket has a `kind`: `maintenance` | `concern` | `lead`. Keeps "nothing dropped," keeps the maintenance queue clean.

- **B3** 🔴 **Lifecycle states.** Reconcile PRD §20 (Open→In Progress→Resolved) + desk spec (open/on_hold/closed/archived).
  → Rec: **New → Triaged → Open → In Progress → On Hold → Resolved → Closed**, plus **Archived** (filtered noise, queryable). Confirm or trim.

- **B4** 🟡 **Priority + SLA.** Keep existing URGENT / HIGH / MED / LOW with `sla_defaults` (currently placeholder 4h / 24h / 72h / 168h). Urgent (no power / water leak / no hot water / unsafe) = top priority + phone call per Crystal's doc.
  → Rec: keep scheme; **Christopher/Crystal confirm the SLA hour values.**

- **B5** 🟡 **Required closing photo** to move a maintenance ticket to Resolved (PRD §20)?
  → Rec: required for `maintenance`/`pm_corrective`; not required for `concern`/`lead`.

- **B6** 🟢 **Recurrence auto-flag.** PRD says both "same room within 60 days" (§20) and "3× in 30 days" (§15). Pick one rule for tickets.
  → Rec: same room + similar issue **≥2× in 60 days** → flag recurring. Confirm threshold.

- **B7** 🟢 **Ticket ID / numbering** scheme (human-facing, e.g., `TKT-6802-000123`). OK, or a plain sequential number?
  → Rec: `TKT-{propertyID}-{seq}`; unassigned-property tickets use `TKT-000123`.

---

## C. Who works tickets (roles / agents)

- **C1** 🔴 **Who are "agents"** (can view/claim/reply/resolve tickets)? Map onto the 6 DB roles / 3 display roles (Admin/Manager/Staff). Candidates: Corporate ops (Karla, Christopher, Blake), Managers, Admin.
  → Rec: **Admin + Corporate + Manager** are agents. Field staff (HK/PA/MT) are **not** desk agents — they receive dispatched *checklists*, not tickets.

- **C2** 🟡 **Dispatcher role.** Crystal's doc names Gerardo Sandoval as the dispatcher with a required named backup. Model an explicit "dispatcher" (who assigns work), or is that just any Manager/Corporate agent?
  → Rec: v1 = any agent can assign; add a soft "dispatcher on duty" label later. Confirm, and **name the backup**.

- **C3** 🟡 Do **MTs (maintenance techs) get a ticket view at all**, or only the checklist that was dispatched to them?
  → Rec: MTs live in the **checklist app only** (they get the dispatched Maintenance Checklist). They don't open tickets. Confirm — this keeps field staff's world simple.

- **C4** 🟡 **Assignment model:** manual claim / reassign (desk spec v1) vs. round-robin (v2).
  → Rec: manual v1.

- **C5** 🟢 **Collision handling** (two agents on one ticket): v1 = visible owner + status (claim before replying); live "who's viewing" indicator = v2. Confirm v1.
  → Rec: confirm.

---

## D. Maintenance intake — email desk (blake@)

- **D1** 🔴 **Graph app registration.** You chose "Full Graph now" (Kate does Entra app reg + admin consent for `Mail.Read`, `Mail.Send`, `Mail.ReadWrite` → client secret). **When can Kate do this?** (Gates the live email desk.)
  → Rec: target day 1–2 this week.

- **D2** 🔴 **Sender filter catalog.** The desk spec references `SENDER_CATALOG.md` / `SenderFilter_Blake_070226.xlsx` — **not in this repo.** Can you supply them? Without them I rebuild the archive/ticket sender lists from the spec's §5 summary (loses your real-mailbox tuning).
  → Rec: supply the files.

- **D3** 🟡 **Reply-as-blake@.** All agents reply from the single `blake@rentstayable.com` address; internally we record which agent sent it. Confirm (per desk spec §7a).
  → Rec: confirm.

- **D4** 🟡 **Zoho Desk cutover.** Run the new desk **alongside Zoho** (keep the Exchange Bcc-to-Zoho rule) for ~1 week, compare, then retire Zoho? Or hard cutover?
  → Rec: parallel run 1 week, then retire.

- **D5** 🟢 **Open filter decisions** from desk spec §5: (a) internal `rentstayable.com` forwards sometimes carry real guest messages — currently archived; add a subject exception to keep those? (b) broker / affordablehousing domains archived — OK given the inbox copy is retained?
  → Rec: (a) add subject exception for guest keywords; (b) OK to archive.

- **D6** 🟢 **Leads** (Zillow / FurnishedFinder / Homes.com) — kept as `lead` tickets in a separate Leads view now; route to a leasing person later? Who?
  → Rec: separate view now; name a leasing owner for later routing.

---

## E. Maintenance intake — tenant form

- **E1** 🔴 **Fields** (desk spec §4a): Property (dropdown of 8) · Unit/room# · Name · Contact (email and/or phone, ≥1) · Category · Description. Confirm set.
  → Rec: confirm.

- **E2** 🟡 **Photo upload on the form.** Spec marks it v2, but the app already has the R2 photo pipeline. Include tenant photo upload in v1?
  → Rec: **yes, include** — reuse R2; it's high-value for triage.

- **E3** 🟡 **Spam protection** (no auth on the form): rate-limit + honeypot + CAPTCHA. CAPTCHA provider (Cloudflare Turnstile / hCaptcha / none)?
  → Rec: rate-limit + honeypot v1; add Turnstile if abuse appears.

- **E4** 🟡 **Access:** one public form URL with a property dropdown, or a per-property URL / QR code (printed for guests/tenants)?
  → Rec: per-property URL + QR (prefills property); plus a generic one.

- **E5** 🟢 **Phone-only submissions:** reply box disabled, shows "call the tenant" note (SMS = later). Confirm.
  → Rec: confirm.

---

## F. Triage (AI)

- **F1** 🔴 **Anthropic API key** available for the app (separate from this Claude Code session)? Model: spec pins `claude-sonnet-4-6` (not a current ID) → use **Claude Sonnet 5** (`claude-sonnet-5`) for triage.
  → Rec: provide `ANTHROPIC_API_KEY`; model = Sonnet 5.

- **F2** 🟡 **Triage outputs:** issue summary · category · priority · property/room · suggested reply · is-real-person · **confidence**. Below a confidence threshold → force human review. Confirm fields + that triage never blocks ticket creation (fallback defaults on error).
  → Rec: confirm.

- **F3** 🟡 **Spanish → English.** Crews and some tenants report in Spanish (Crystal's doc, ADR-013). Auto-translate inbound to English for the back-office record, keep the original. Confirm.
  → Rec: confirm.

- **F4** 🔴 **Human-review gate per source:** `email` → **human review queue** before it becomes a working ticket (brief's "no AI decides alone"); `form` → **direct ticket** (structured input); `checklist_fail`/`pm_corrective` → **direct ticket**. Confirm this split.
  → Rec: confirm.

---

## G. Checklist ↔ Ticketing connection (the loop)

- **G1** 🔴 **Dispatch + auto-close loop** (already chosen): from a ticket, an agent dispatches a maintenance/PM checklist to an MT (property/room prefilled); on completion the ticket auto-resolves. Which templates are **dispatchable**?
  → Rec: **Maintenance Checklist** + **PM Checklist**; agent picks. Confirm list.

- **G2** 🟡 **Auto-close trigger:** checklist **submitted**, or **submitted + PM-verified**? (PRD makes submissions immutable after verify.)
  → Rec: **submitted + PM-verified** → ticket auto-Resolved; bare submit → ticket "work done, pending verify."

- **G3** 🔴 **Checklist → ticket direction.** PRD §18 says a manager *escalates* a flagged issue from the review screen. Do we also **auto-create** a ticket when a task fails / structured flag fires / PM corrective is noted, or only on manager escalation?
  → Rec: **auto-create** ticket on failed-task-that-flags-issue + PM corrective (matches today's auto-Issue behavior) **and** allow manual escalate. Confirm.

- **G4** 🔴 **Confirm the boundary:** normal room→checklist auto-creation (Cloudbeds checkout/arrival, PRD §3/§19) is **purely Component I** and does **not** create tickets. Only *maintenance-flagged* results cross into Ticketing. (This is your "the only thing that connects is maintenance.")
  → Rec: confirm.

- **G5** 🟢 Does a dispatched work-order need a **new checklist template** (with cost-capture fields, §H) or reuse the existing Maintenance Checklist?
  → Rec: reuse Maintenance Checklist v1; add a "Work Order" variant with cost fields when §H lands.

---

## H. Cost capture (Crystal's dispatch doc)

- **H1** 🟡 Is **per-job cost capture** (labor time + parts cost) in **Ticketing v1**, or a later phase tied to Crystal's pilot?
  → Rec: **design the fields now, build later** (after the WhatsApp/crew pilot produces real volume). Not in the week-1 desk.

- **H2** 🟢 Minimum to record per job to compute true cost: **time spent · parts cost · labor rate**? And the rule of thumb for "cheaper to outsource than do in-house"? (Crystal's open question.)
  → Rec: Crystal defines; capture time + parts + rate at minimum.

---

## I. Notifications

- **I1** 🟡 **Events → channels.** Existing: Resend email (wired), in-app log, Teams digest (planned), push (later). For tickets: new ticket · assigned · agent replied · resolved · SLA breach. Which events notify whom, on which channel?
  → Rec: assigned → assignee (email + in-app); new maintenance ticket → dispatcher (in-app); SLA breach → manager (email). Confirm.

- **I2** 🟡 **Urgent escalation.** Crystal's doc: true emergencies get a **phone call**, not the queue. Model an "urgent" flag that fires an immediate notify + a call-reminder to the dispatcher?
  → Rec: yes — urgent ticket → immediate in-app + email to dispatcher + "call now" banner.

- **I3** 🟢 **Teams.** PMs live in Teams (Crystal's doc). Post ticket events to per-property Teams channels (ties to ADR-010 digest + the 1 corporate + 8 property webhooks)?
  → Rec: fold into the planned Teams digest; per-ticket Teams posts = later.

---

## J. WhatsApp crew channel (later — confirm deferral)

- **J1** 🔴 Confirm **WhatsApp crew intake is a LATER phase** (needs Meta Business number + verification + Crystal's 2–4 week pilot) — **not** this week.
  → Rec: confirm.

- **J2** 🟢 When built, is WhatsApp intake part of **Ticketing (II)** (just another source → review queue) or a distinct dispatch build?
  → Rec: another **source into Ticketing** (property/location/problem/photo → review → ticket), reusing the desk.

- **J3** 🟢 Crystal's crew format is fixed: **Property · Location · Problem · Photo**, one problem per message, location required. Confirm this is the future WhatsApp contract.
  → Rec: confirm.

---

## K. Construction (Component III) — parked

- **K1** 🟢 You said you don't yet know how to integrate construction scheduling. Directions to consider later: (a) construction = **another ticket source + a "project" grouping** in Ticketing; (b) a **separate construction module** that links to tickets; (c) **defer entirely** until Rob greenlights the brief.
  → Rec: **park until Rob greenlights** `docs/component-iii/ConstructionAgentBrief_RISE8_062026.md` §5; then brainstorm III on its own.

- **K2** 🟢 Send Rob the brief §5 questionnaire now so III can greenlight in parallel?
  → Rec: yes.

---

## L. Data / infra / blockers

- **L1** 🔴 **Prod/dev DB split** — still pending from last session. Real tickets + live email must **not** land in the shared dev DB. Pick the Neon path: (i) you create the Neon prod project + drop connection strings in `.env.production.local`; (ii) give me a `NEON_API_KEY` and I create it; (iii) Vercel Neon marketplace integration. (Runbook: `docs/RUNBOOK.md §Splitting the Production DB`.)
  → Rec: decide before the desk goes live.

- **L2** 🟡 **Cloudbeds API keys** (per-property, read-only) — gates room auto-create / checkout queue (Component I S2/S3), not the desk. Status?
  → Rec: needed for I's room lifecycle; not blocking II's desk.

- **L3** 🔴 **Secrets** to provide for II: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MAILBOX=blake@rentstayable.com`, `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`. Who sets them in Vercel (you / Kate)?
  → Rec: Kate (M365 admin) supplies MS_*; you set ANTHROPIC_API_KEY.

---

## M. Scope & sequencing for the week

- **M1** 🔴 Is this week **planning only** (specs + implementation plans for all three components), with build starting after sign-off? Or **plan II now + start building the desk** once §A–§G are answered?
  → Rec: **plan II fully this week** (this doc → spec → plan), start desk build the moment §A + the 🔴s are answered and Graph consent + DB split land.

- **M2** 🟡 If we build: **order of II sub-pieces** — (1) unified ticket model + migrate existing issues, (2) tenant form intake, (3) email desk (Graph), (4) triage, (5) dispatch+auto-close loop.
  → Rec: that order (model first, cheapest live intake next, then email, then AI, then the loop).

- **M3** 🟡 **Sign-off gates:** Rob (scope/budget + III greenlight), **Crystal** (ticketing features + dispatch — she owns the Maintenance Dispatch), **Kate** (page/UX review before merge). Confirm who signs off on what.
  → Rec: confirm.

- **M4** 🟢 **Reviewers' feature-suggestion loop:** how do Rob/Crystal want to suggest features per component — via this repo's docs, chat, or a shared doc?
  → Rec: your call.

---

## Top 8 to answer first (unblocks everything)

1. **A2 + A3** — issues move into Ticketing; migrate + retire the existing `/issues`? (the whole architecture hinges here)
2. **B1 + B2** — v1 sources + concerns/leads-as-tagged-tickets
3. **B3** — lifecycle states
4. **D1** — when can Kate do the Graph app registration + consent
5. **D2** — supply the sender-filter catalog files, or rebuild from spec?
6. **F1** — Anthropic API key + confirm Sonnet 5
7. **G3 + G4** — auto-create tickets from checklist fails? confirm normal checklists don't touch Ticketing
8. **L1** — prod/dev DB split path

---

*Answer inline, or tell me the numbers in chat. Once §A and the 🔴s are settled, I'll write the Component II design spec, then the implementation plan.*
