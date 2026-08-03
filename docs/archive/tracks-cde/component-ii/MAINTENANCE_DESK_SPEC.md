# Maintenance Desk — Feature Spec (module for the existing checklist app)

**Owner:** RISE8 / Stayable
**Status:** Draft for integration
**Target:** Add as a module inside the existing Next.js checklist app (Vercel), reusing its
auth, database, and UI shell. Not a standalone app.
**Prepared:** 07/02/26

---

## 1. Summary

> **⚠ Scope update (2026-07-08): the email desk is ONE channel, not the whole intake — and it's two mailboxes.**
> **Intake reality (confirmed Kyle 2026-07-08):** the *primary* maintenance intake is **TurboTenant + Jotform**, today consolidated in **Smartsheet** (the current maintenance status/progress tracker). This email desk is **additional** — it catches maintenance emails to `admin@`/`blake@` that are hard to track and often missed. **Property managers** own triage/assignment/daily scheduling; **Gerardo & Jesus** schedule contractors downstream. Component II's job is to consolidate TurboTenant + Jotform + email + checklist-emitted issues into **one queue** (replacing the Smartsheet tracker). So this spec covers only the **email lane**; TurboTenant + Jotform ingestion and the unified ticket model are separate, larger pieces to spec.
> **Two mailboxes, not one.** The desk monitors **both `admin@rentstayable.com` and `blake@rentstayable.com`**. This spec is still written for the single `blake@` case; before build, generalize to a **mailbox list**: (a) MS Graph app registration + admin consent for `Mail.Read`/`Mail.Send`/`Mail.ReadWrite` on **both** (§9); (b) `MAILBOX` env → a list, each ticket/message records which mailbox it arrived on/replied from (`sent_as` covers send); (c) filter + triage per mailbox; (d) reply defaults to the origin mailbox. Note `admin@` is *also* the app's admin login identity — same address, separate system; rotate the temp admin password before rollout. Every `blake@`-only reference below = "the receiving mailbox."

Turn `blake@rentstayable.com` into a shared, multi-user maintenance queue that lives
inside the checklist app. Incoming mail is read via Microsoft Graph, filtered to remove
noise (marketing, broker blasts, payment notifications), triaged by Claude (issue,
property, priority, draft reply), and stored as tickets. Agents view, claim, and reply
from inside the app — replies send as blake@ via Graph.

Runs **alongside Zoho Desk** during build (the existing Exchange Bcc-to-Zoho rule stays
as backup). Zoho can be retired once this is stable.

### Goals
1. Nothing dropped — every inbound email is recorded, even filtered noise (recoverable).
2. Filter the noise so the working queue is clean.
3. Multiple users answer without confusion (shared status, ownership; collision in v2).

### Inbound channels (v1)
- **Email** — `admin@rentstayable.com` **and** `blake@rentstayable.com` via Microsoft Graph (filtered + triaged, per mailbox).
- **Maintenance form** — public web form tenants submit; creates a ticket directly.

### Non-goals (v1)
- Agent collision indicators (who's-viewing), round-robin assignment, SLA timers → v2.
- Inbound channels other than email + the maintenance form.

---

## 2. Where it fits in the existing app

Add as a sibling feature to checklists. Assumes the host app is Next.js (App Router).
Confirm and adjust these to the app's real conventions before building:

```
app/
  (existing checklist routes)
  maintenance/
    page.jsx                # queue (list + views)
    [id]/page.jsx           # ticket detail + reply + notes
    report/page.jsx         # PUBLIC tenant maintenance form (no auth)
  api/
    graph-webhook/route.js  # MS Graph push endpoint (public, validated)
    form-submit/route.js    # public form intake → create ticket
    tickets/route.js        # list/update tickets (authed)
    reply/route.js          # send reply via Graph, attributed to agent (authed)
    note/route.js           # add internal note (authed)
lib/
  maintenance/
    filter.js               # sender/domain/subject classifier  [BUILT]
    triage.js               # Claude triage                      [BUILT]
    graph.js                # Graph auth/read/send/subscribe      [BUILT]
    db.js                   # ticket persistence                  [BUILT — adapt to app's DB client]
```

**Reuse from the host app, do not rebuild:**
- **Auth** — the checklist app's existing login/session guards the `/maintenance` UI and
  the `tickets`/`reply` APIs. If it's already Microsoft/Entra, users get access with no
  new login. (`graph-webhook` and the public form endpoint are the exceptions — see §7a
  and §8.) **Agents are the app's existing users** (see §7a); no separate agent accounts
  are created for the maintenance module.
- **Database** — if the app already uses Postgres/Neon, add the two tables below to the
  same database and use the app's existing DB client instead of `lib/maintenance/db.js`'s
  standalone `neon()` connection.
- **UI shell** — nav, layout, component library. The maintenance pages should render
  inside the app's existing chrome, matching its patterns.

---

## 3. Data model

Two tables (namespace `maintenance_` if sharing a DB with checklists).

```sql
CREATE TABLE maintenance_tickets (
  id               SERIAL PRIMARY KEY,
  source           TEXT NOT NULL DEFAULT 'email',  -- email|form
  graph_message_id TEXT UNIQUE,        -- dedupe (email only); null for form
  from_email       TEXT NOT NULL,
  from_name        TEXT,
  from_phone       TEXT,               -- captured by form; null for email
  unit             TEXT,               -- captured by form (room/unit #)
  subject          TEXT,
  status           TEXT NOT NULL DEFAULT 'open',  -- open|on_hold|closed|archived
  priority         TEXT DEFAULT 'normal',         -- urgent|high|normal|low
  category         TEXT,                          -- maintenance|plumbing|hvac|...
  property_id      TEXT,                          -- 4645|2295|6802|812|5399|2535|44199|8700
  issue_summary    TEXT,
  suggested_reply  TEXT,
  tags             TEXT[] DEFAULT '{}',
  filter_reason    TEXT,                          -- audit: why ticketed/archived
  assigned_to      TEXT,                          -- user email; null = unassigned
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_messages (
  id           SERIAL PRIMARY KEY,
  ticket_id    INTEGER REFERENCES maintenance_tickets(id) ON DELETE CASCADE,
  direction    TEXT NOT NULL,     -- inbound|outbound|internal_note
  author       TEXT,              -- inbound: sender email; outbound/note: AGENT's email
  sent_as      TEXT,              -- outbound: the from address used (blake@rentstayable.com)
  body         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mt_status ON maintenance_tickets(status);
CREATE INDEX idx_mt_assigned ON maintenance_tickets(assigned_to);
```

`status='archived'` is how "nothing dropped" is honored — filtered noise is stored here,
hidden from the queue, fully queryable.

---

## 4. Pipeline (inbound)

```
New mail in blake@ inbox
   │  (MS Graph webhook subscription: changeType=created, resource=inbox/messages)
   ▼
POST /api/graph-webhook
   ├─ validationToken present?  → echo it (subscription handshake)
   ├─ verify clientState == WEBHOOK_SECRET
   ├─ dedupe on graph_message_id
   ├─ graph.getMessage(id)      → sender, subject, body
   ├─ filter.classify(email)
   │     ├─ action=archive  → insert ticket status='archived' + reason (STOP)
   │     └─ action=ticket   → continue
   ├─ triage(email)             → {issue, category, priority, property_id, suggested_reply}
   └─ insert ticket status='open' + inbound message row
```

Webhook must ack fast (Graph retries/expires on slow responses). Volume is low
(~7,200/yr ≈ 20/day), so inline processing is fine; if it grows, push to a queue and
process async.

**Subscription lifecycle:** mail subscriptions expire (~3 days max). Add a scheduled
job (Vercel Cron, daily) to renew via `graph.createSubscription()`. If the host app has
no cron, a daily renewal endpoint hit by an external scheduler works too.

## 4a. Pipeline (form submission)

A public maintenance form lets tenants report issues directly — no email needed. Because
the form collects structured fields, it skips the filter entirely (a submission is always
a real request) and goes straight to a ticket.

```
Tenant submits /maintenance/report  (public page)
   │
   ▼
POST /api/form-submit   (public, rate-limited + spam-guarded)
   ├─ validate required fields (property, unit, name, contact, description)
   ├─ (optional) triage() for priority/category only — property/unit come from the form
   └─ insert ticket source='form', status='open' + inbound message row
```

Form fields:
- **Property** (required, dropdown of the 8 Stayable properties → property_id)
- **Unit / room #** (required)
- **Name** (required)
- **Contact** — email and/or phone (at least one required; drives how agents reply)
- **Category** (dropdown: plumbing, hvac, electrical, appliance, pest, other)
- **Description** (required, free text)
- **Photo** (optional, v2 — needs file storage)

Spam protection: rate-limit by IP, a honeypot field, and optionally a lightweight
CAPTCHA. No auth (tenants aren't app users), so these guards matter.

Reply path for form tickets: if the tenant gave an email, agents reply via Graph as
blake@ exactly like email tickets. If phone-only, the ticket shows the number and the
reply box is disabled with a "call the tenant" note (SMS is a v2 option).

---

## 5. Filtering

Logic is built and tested in `lib/maintenance/filter.js` against a YTD scan of the real
mailbox. See `SENDER_CATALOG.md` / `SenderFilter_Blake_070226.xlsx` for the full lists.

- **Domain archive:** alchemyrea.com, ccsend.com, info.zumper.com, email.homes.com,
  email.costar.com, mcdlv.net, alignable.com, laerrealty.com, affordablehousing.com,
  cervera.com, avisonyoung.com, dshhoteladvisors.com, owpbrokers.com, zohodesk.com
- **Internal archive:** rentstayable.com, rise8companies.com
- **Sender archive:** m365copilotupdates@microsoft.com; no-reply@turbotenant.com (subject-gated)
- **Sender ticket (lead):** rentalclientservices@zillowrentals.com,
  messaging@leads.furnishedfinder.com, noreply@homes.com
- **TurboTenant subject rule:** "maintenance" → ticket; payment/check-in/deposit → archive; else → ticket(review)
- **Default:** anything unmatched → ticket

The lists are plain arrays — editing them is a one-line change, no schema impact. Consider
moving them to a DB table later so non-devs can edit filters in-app (v2).

### Open decisions
1. Internal rentstayable.com forwards sometimes carry real guest messages. Currently
   archived. Add a subject exception to keep those? **(still open)**
2. **RESOLVED:** Leads (Zillow, FurnishedFinder, Homes.com tour requests) are **leads, not
   maintenance.** Kept as tickets tagged `lead`, shown in a separate **Leads** view and
   excluded from the maintenance Active queue. (v2 option: route to a leasing person.)
3. Broker/affordablehousing domains archived — OK given inbox copy is retained? **(still open)**

---

## 6. Triage (Claude)

`lib/maintenance/triage.js` calls the Anthropic API (model `claude-sonnet-4-6`) with the
email and returns strict JSON: `issue_summary`, `category`, `priority`, `property_id`
(mapped to the 8 Stayable IDs), `is_person`, `suggested_reply`. Triage never blocks
ticket creation — on error it falls back to safe defaults so the ticket is still created.

Cost is per-email and tiny; only emails that pass the filter are triaged (archived noise
is not sent to Claude).

---

## 7a. Multi-agent model (multiple accounts replying to one ticket)

Several team members work the same queue. The model:

- **Agents = existing app users.** Whoever can log into the checklist app (and is granted
  the maintenance role/permission) is an agent. No separate accounts. Identity comes from
  the app's session.
- **One shared queue, per-ticket ownership.** A ticket has `assigned_to` (one agent at a
  time) plus a status everyone sees. Any agent can open any ticket; assigning it signals
  "I've got this." v1 assignment is manual claim / reassign; round-robin is v2.
- **Any agent can reply.** The reply box is available to any agent with access, whether or
  not the ticket is assigned to them (so coverage never blocks on one person).
- **Replies always send as blake@rentstayable.com.** The tenant/guest sees a single
  consistent address, never individual agents' emails. Internally, each outbound message
  records `author` = the agent who sent it and `sent_as` = blake@. So the thread shows
  "Reply sent by karla@… (as blake@rentstayable.com)" to the team, while the recipient
  just sees blake@.
- **Internal notes.** `direction='internal_note'` lets agents leave notes on a ticket
  that the tenant never receives — for handoffs and context between agents.
- **Attribution & audit.** Every status change, assignment, and reply is tied to an agent
  via `author`, giving a full who-did-what trail.

**Collision handling (v1 vs v2):** v1 relies on visible ownership + status to avoid two
people working the same ticket. True live collision indicators ("Karla is viewing this")
are v2. Until then, the convention is: claim (assign to self) before replying.

Permissions: gate the module behind a maintenance role in the app's existing
authorization. Minimum two levels — **agent** (view, reply, claim, change status) and
**admin** (also reassign others, edit filters, see archived). Map to whatever role
system the checklist app already has.


**Queue — `/maintenance`**
- Default view: **Active** = status in (open, on_hold), newest first.
- Saved views: **Leads** (tag=lead), **Archived/Low-Signal** (status=archived, read-only).
- Row: priority chip, property_id, from_name, issue_summary, category, created_at, assignee.
- Filters: property, category, priority, status.

**Ticket detail — `/maintenance/[id]`**
- Header: subject, from (name/email/phone), property, unit, source (email/form),
  priority, status control, assignee control (claim / reassign).
- Thread: inbound + outbound + internal notes in order. Outbound shows the sending agent
  and "(as blake@rentstayable.com)".
- Reply box: prefilled with `suggested_reply` (editable); available to any agent; Send →
  `/api/reply`. Toggle for **internal note** (saved, not emailed).
- Actions: change status, set priority/property, claim/assign.

**Public maintenance form — `/maintenance/report`** (no auth)
- Standalone public page (linkable/QR-able for tenants).
- Fields per §4a; property is a dropdown of the 8 Stayable properties.
- On submit → `/api/form-submit` → confirmation screen with a reference number.
- Styled to match the tenant-facing brand, separate from the internal app chrome.

Follow the checklist app's existing component and styling conventions for the internal
pages — this should look like part of the app, not a bolted-on tool.

---

## 8. APIs

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/graph-webhook` | Graph handshake + clientState | Receive new-mail notifications |
| `POST /api/form-submit` | public (rate-limited, honeypot/CAPTCHA) | Tenant form → create ticket (source=form) |
| `GET /api/tickets?view=active\|leads\|archived` | app session | List tickets for a view |
| `PATCH /api/tickets` | app session | Update status/priority/assignee/property |
| `POST /api/reply` | app session | Send reply as blake@ via Graph; record agent as author; append outbound message |
| `POST /api/note` | app session | Add an internal note (not emailed) |

---

## 9. Environment / secrets (Vercel)

```
# Microsoft Graph (app registration — see §10)
MS_TENANT_ID=
MS_CLIENT_ID=
MS_CLIENT_SECRET=
MAILBOX=blake@rentstayable.com
WEBHOOK_SECRET=            # random string; validates Graph notifications

# Anthropic (console credits)
ANTHROPIC_API_KEY=

# Database — reuse the app's existing DATABASE_URL if sharing Neon
DATABASE_URL=
```

---

## 10. External setup (done by an admin — outside this repo)

**Azure / Entra app registration (needs MS admin):**
1. Entra admin center → App registrations → New registration.
2. API permissions → Microsoft Graph → **Application** permissions:
   `Mail.Read`, `Mail.Send`, `Mail.ReadWrite` → **Grant admin consent**.
3. Certificates & secrets → new client secret → copy into `MS_CLIENT_SECRET`.
4. Copy Tenant ID + Client (Application) ID into env.

**Neon:** if not reusing the app's DB, create a project and run the §3 DDL.

**Graph subscription:** after first deploy, call `createSubscription()` once with the
deployed `/api/graph-webhook` URL; schedule daily renewal.

---

## 11. Rollout

1. Add tables (namespaced) to the app DB.
2. Drop in `lib/maintenance/*` (adapt `db.js` to the app's DB client).
3. Add the API routes + pages inside the app's auth; add the public form page + endpoint.
4. Wire the maintenance role into the app's existing authorization (agent/admin).
5. Create the Azure app registration; set env vars in Vercel.
6. Deploy; register the Graph subscription; send a test email → confirm ticket; submit a
   test form → confirm ticket (source=form).
7. Run alongside Zoho (Bcc rule stays) for a week; compare.
8. When confident: retire Zoho, optionally remove the Bcc rule.

## 12. v2 backlog
- Agent collision indicator (who's viewing/replying live).
- Round-robin / rule-based assignment.
- SLA timers + escalation on `urgent`.
- In-app editable filter lists (move §5 arrays to DB so admins edit without a deploy).
- Lead routing: send `lead`-tagged tickets to a leasing person/queue.
- Form: photo upload (needs file storage); SMS reply for phone-only submissions.
- AI-drafted replies on demand; real-time queue updates (websockets/polling).
```
