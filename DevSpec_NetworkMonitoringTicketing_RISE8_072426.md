# Stayable — Network Device Monitoring & Ticketing System
**Developer Spec · v3.0 · July 24, 2026**

---

## 1. Overview

Build a web application that:
- Receives webhooks from UniFi Protect (cameras) and Aruba Instant On (APs)
- Logs all device events in its own database
- Auto-creates a ticket when a device has not recovered within 5 minutes
- Displays a real-time dashboard — portfolio-wide and per-property
- Notifies the relevant property via Microsoft Teams when a ticket is created
- Posts the resolution as a **reply to the original ticket message thread** (not a new post)
- Captures replies made in Teams to a ticket notification and saves them as **notes on the ticket**

No Zapier. No Smartsheet. No `#it-alerts` channel. The app owns all data and all logic. Each ticket's entire Teams conversation lives in one thread.

---

## 2. Tech Stack (Recommended)

| Layer | Suggestion | Notes |
|---|---|---|
| Frontend | React + TypeScript | Dashboard, ticket views |
| Backend | Node.js (Express) or Python (FastAPI) | Webhook receiver, timer logic, Teams integration |
| Database | PostgreSQL | Events, tickets, devices, properties |
| Hosting | Any VPS / cloud (Vercel + Supabase, Railway, Render, etc.) | Must be publicly accessible for webhooks |
| Auth | Simple JWT or SSO via Microsoft (Teams integration) | IT staff only |
| Teams Integration | **Microsoft Graph API** (required) | Incoming Webhooks will NOT work — threading and reply ingestion require Graph API |

---

## 3. Webhook Integration

### 3.1 UniFi Protect
- **Endpoint:** `POST /webhooks/unifi`
- **Events to handle:**

| UniFi Event Type | System Interpretation |
|---|---|
| `camera.disconnected` / `camera.offline` | Problem event |
| `camera.connected` / `camera.online` | Recovery event |
| `camera.device_error` | Problem event |
| `device.disconnected` (AP via UniFi Network) | Problem event |
| `device.connected` (AP via UniFi Network) | Recovery event |

### 3.2 Aruba Instant On
- **Endpoint:** `POST /webhooks/aruba`
- **Events to handle:**

| Aruba Alert Type | System Interpretation |
|---|---|
| AP offline / disconnected | Problem event |
| AP reconnected / online | Recovery event |
| Uplink changed: wired → over-the-air | Problem event |
| Uplink restored: over-the-air → wired | Recovery event |

### 3.3 Webhook Security
- Validate all incoming requests using HMAC signature (both platforms support this)
- Reject invalid signatures with `401`
- Store raw payloads separately for debugging

> **Note:** Confirm exact field names in both webhook payloads from live testing before writing parsers — they vary by firmware/portal version.

---

## 4. Data Model

### 4.1 `properties`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | String | Lakeland, Orlando, etc. |
| rise8_id | String | 4645, 8700, etc. |
| teams_channel_id | String | Graph API channel ID |
| teams_channel_name | String | e.g. #property-lakeland |

### 4.2 `devices`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| device_key | String | `{device_name}_{property_id}` — unique |
| name | String | |
| type | Enum | `camera` / `ap` |
| source | Enum | `unifi_protect` / `aruba` / `unifi_network` |
| property_id | UUID | FK → properties |
| last_seen_at | Timestamp | Updated on every Recovery event |
| current_status | Enum | `online` / `offline` / `unknown` |

### 4.3 `events`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| device_id | UUID | FK → devices |
| property_id | UUID | FK → properties |
| event_type | Enum | `problem` / `recovery` |
| source_system | Enum | `unifi_protect` / `aruba` / `unifi_network` |
| alert_message | Text | Raw alert text |
| occurred_at | Timestamp | From source system |
| received_at | Timestamp | When webhook arrived |
| ticket_id | UUID | FK → tickets (nullable) |
| resolved_by_event_id | UUID | Self-ref FK — which recovery closed this problem |

### 4.4 `tickets`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| ticket_number | String | Auto: `TKT-YYYYMMDD-NNN` |
| device_id | UUID | FK → devices |
| property_id | UUID | FK → properties |
| trigger_event_id | UUID | FK → events |
| alert_message | Text | |
| status | Enum | `open` / `in_progress` / `resolved` / `closed` |
| opened_at | Timestamp | When ticket was created |
| assigned_to | String | Manual |
| resolution_notes | Text | |
| resolved_at | Timestamp | |
| down_duration_min | Integer | Calculated on resolution |
| teams_notified | Boolean | |
| teams_message_id | String | **Graph API message ID of the original ticket post — required for threading replies** |
| teams_message_url | String | Deep link to the Teams message |

### 4.5 `ticket_notes`
| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| ticket_id | UUID | FK → tickets |
| source | Enum | `teams_reply` / `manual` |
| author | String | Teams display name or app user |
| teams_reply_id | String | Graph API reply message ID (nullable) |
| content | Text | Note text |
| created_at | Timestamp | |

---

## 5. Core Application Logic

### 5.1 Webhook Ingestion

```
POST /webhooks/unifi  or  POST /webhooks/aruba
  │
  ├── Validate HMAC signature → 401 if invalid
  ├── Parse payload → device_name, property, event_type, message, timestamp
  ├── Upsert device record
  ├── Insert event record
  ├── Update device.current_status
  │
  ├── If event_type = PROBLEM:
  │     ├── Check mass outage: count Problem events for this property in last 120 seconds
  │     ├── If count >= 5 → trigger mass outage path (see §5.5)
  │     └── Otherwise → schedule 5-min timer job (event_id)
  │
  └── If event_type = RECOVERY:
        ├── Find most recent open Problem event for this device
        ├── Set resolved_by_event_id on that event
        ├── If open ticket exists for device:
        │     ├── Update ticket: status=resolved, resolved_at=now, down_duration=calculated
        │     └── Post resolution reply to Teams thread (see §5.3)
        └── Update device.current_status = online
```

### 5.2 5-Minute Timer

```
Timer fires (event_id):
  │
  ├── Open ticket exists for device? → skip (already ticketed)
  ├── Recovery event arrived since Problem? → skip (self-resolved)
  │
  └── Create ticket:
        ├── Insert into tickets table, status=open
        ├── Update event.ticket_id
        ├── POST to Teams channel via Graph API
        ├── Save returned message_id → tickets.teams_message_id
        └── Update device.current_status = offline
```

**Timer implementation:** Use BullMQ + Redis (recommended) or DB-based polling. Do NOT use in-memory `setTimeout` — timers must survive server restarts.

**Duplicate suppression:** Before creating, query `SELECT 1 FROM tickets WHERE device_id = ? AND status IN ('open','in_progress')`. If a row exists, skip.

### 5.3 Teams Threading (Graph API)

**Posting the initial ticket notification:**
```
POST /v1.0/teams/{team-id}/channels/{channel-id}/messages
→ save response body.id as tickets.teams_message_id
```

**Posting the resolution reply (not a new post):**
```
POST /v1.0/teams/{team-id}/channels/{channel-id}/messages/{teams_message_id}/replies
```

This ensures the resolution appears inside the original ticket thread, not as a separate channel post.

**Message templates:**

New ticket:
```
🔴 Device Ticket Created

Property: {Property Name}
Device: {Device Name} ({Device Type})
Issue: {Alert Message}
Offline Since: {occurred_at}
Ticket: {ticket_number}

No recovery detected after 5 minutes. Please investigate.
Reply to this message to add notes to the ticket.

[View Ticket] → {app_url}/tickets/{ticket_id}
```

Resolution reply:
```
✅ Resolved

Down Duration: {down_duration_min} min
Resolved At: {resolved_at}
```

### 5.4 Teams Reply → Ticket Notes

When a user replies to a ticket notification in Teams, the app captures it and saves it as a note.

**Implementation options (choose one):**

**Option A — Graph API Change Notifications (recommended):**
- Subscribe to `https://graph.microsoft.com/v1.0/teams/{team-id}/channels/{channel-id}/messages/{message-id}/replies`
- Microsoft pushes new replies to a webhook endpoint on the app: `POST /webhooks/teams-reply`
- App matches `message-id` to `tickets.teams_message_id`, inserts row into `ticket_notes`

**Option B — Polling:**
- App polls `GET .../messages/{message-id}/replies` every 60 seconds for open tickets
- Simpler to implement, slightly delayed, higher API call volume

For either option:
- Skip replies posted by the app itself (bot account) to avoid logging the resolution reply as a note
- Store `teams_reply_id` to prevent duplicate inserts on re-poll
- Notes are visible in the ticket detail view in the app

### 5.5 Mass Outage Detection

A mass outage is defined as **5 or more devices at the same property going offline within a 120-second window**.

**Key difference from standard flow:** a mass outage ticket is created **immediately** — the 5-minute threshold is bypassed. The ticket is logged even if all devices recover quickly.

```
Mass outage detected for property_id:
  │
  ├── Check: does an open mass outage ticket already exist for this property?
  │     └── If yes → skip (don't create a second one for the same event cluster)
  │
  ├── Create ticket immediately:
  │     ├── ticket_type: mass_outage
  │     ├── status: open
  │     ├── alert_message: "Mass outage — {N} devices offline simultaneously"
  │     ├── affected_devices: list of device names/IDs involved
  │     └── opened_at: now
  │
  ├── Post Teams notification to property channel (same thread pattern)
  │
  ├── Individual devices in the cluster:
  │     ├── Still get their own event records logged
  │     ├── Do NOT get individual tickets at this point — covered by mass outage ticket
  │     └── Their standard 5-min timer jobs are cancelled / marked as superseded
  │
  └── Schedule 10-minute resolution check job (mass_outage_ticket_id)
```

**10-minute resolution check (new background job):**

```
10-min job fires for mass_outage_ticket_id:
  │
  ├── Query all affected devices on this ticket
  ├── Split into two groups:
  │     ├── RECOVERED: devices that have a Recovery event since the outage started
  │     └── STILL OFFLINE: devices with no Recovery event yet
  │
  ├── Post a reply to the mass outage Teams thread:
  │     "✅ {N} devices recovered within 10 min: {device_list}
  │      🔴 {M} devices still offline: {device_list} — individual tickets created"
  │     (if all recovered: post full resolution reply, close ticket)
  │     (if all still offline: post update, keep ticket open)
  │
  ├── For each RECOVERED device:
  │     └── Mark as resolved in the mass outage ticket's affected_devices record
  │
  ├── For each STILL OFFLINE device:
  │     ├── Create a standard individual ticket (status: open)
  │     ├── Post individual ticket notification to property channel
  │     └── Link individual ticket back to the mass outage ticket (parent_ticket_id)
  │
  └── Mass outage ticket status:
        ├── All recovered → status = resolved, resolved_at = now
        └── Any still offline → status = in_progress (stays open until all individual tickets close)
```

**`tickets` table additions:**

| Field | Type | Notes |
|---|---|---|
| ticket_type | Enum | `standard` / `mass_outage` — default `standard` |
| affected_devices | JSONB | `[{device_id, device_name, status: "recovered"/"offline", recovered_at}]` — updated as devices recover |
| parent_ticket_id | UUID | FK → tickets (self-ref) — set on individual tickets spawned from a mass outage |

**Resolution behavior:**
- If all affected devices recover within 10 minutes: mass outage ticket auto-resolves, single resolution reply posted to thread
- If some devices remain offline at 10 minutes: recovered devices are noted in the thread reply, still-offline devices get individual standard tickets, mass outage ticket stays open
- Mass outage ticket fully closes when all its spawned individual tickets are resolved
- Resolution reply is posted to the original Teams thread at each stage

**Teams notification for mass outage (initial post):**
```
🔴 Mass Outage Detected

Property: {Property Name}
Devices Affected: {N} devices offline simultaneously
Time: {occurred_at}
Ticket: {ticket_number}

Devices: {device_1}, {device_2}, ... {device_N}

[View Ticket] → {app_url}/tickets/{ticket_id}
```

**10-minute check reply — all recovered:**
```
✅ All devices recovered

All {N} affected devices came back online within 10 minutes.
Down Duration: {max_duration} min
```

**10-minute check reply — split outcome:**
```
10-Minute Check

✅ Recovered ({N} devices): {device_1}, {device_2}, ...
🔴 Still Offline ({M} devices): {device_A}, {device_B}, ...

Individual tickets created for still-offline devices.
```

**10-minute check reply — all still offline:**
```
10-Minute Check — All Devices Still Offline

🔴 {N} devices remain offline. Individual tickets have been created for each.
```

**Required Graph API permissions:**
- `ChannelMessage.Send` — post messages and replies
- `ChannelMessage.Read.All` — read replies
- `OnlineMeetings.ReadWrite` (if using subscriptions) — change notifications

---

## 6. Dashboard Requirements

### 6.1 Portfolio View
- Summary cards: Open Tickets | Devices Currently Offline | Properties with Issues | Avg Resolution Time (30d)
- Table: all open tickets, sortable by property, device type, ticket age
- Color: 🔴 open >4h · 🟡 1–4h · 🟢 <1h

### 6.2 Per-Property View
- All devices at that property with current status and last seen timestamp
- Open tickets for that property
- 30-day event history

### 6.3 Ticket Detail View
- Full event timeline for the device
- Editable: status, assigned to, resolution notes
- Teams thread notes log (all replies captured from Teams, chronological)
- Teams message link

### 6.4 Device History
- Per-device event log
- Recurring flag: auto-highlighted if 3+ tickets in 30 days

---

## 7. Internal API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/webhooks/unifi` | Receive UniFi alerts |
| POST | `/webhooks/aruba` | Receive Aruba alerts |
| POST | `/webhooks/teams-reply` | Receive Graph API change notifications for thread replies |
| GET | `/api/tickets` | List tickets (filterable) |
| GET | `/api/tickets/:id` | Ticket detail with notes |
| PATCH | `/api/tickets/:id` | Update ticket |
| POST | `/api/tickets/:id/notes` | Add manual note |
| GET | `/api/devices` | List devices with status |
| GET | `/api/devices/:id/history` | Device event history |
| GET | `/api/properties` | List properties |
| GET | `/api/dashboard/summary` | Portfolio counts |

---

## 8. Property Reference

| Property | RISE8 ID | Teams Channel |
|---|---|---|
| Lakeland | 4645 | #property-lakeland |
| Orlando OBT | 8700 | #property-orlando |
| Davenport | 44199 | #property-davenport |
| St. Augustine | 2535 | #property-staugustine |
| Kissimmee East | 2295 | #property-kissimmee-east |
| Kissimmee West | 5399 | #property-kissimmee-west |
| Jacksonville West | 6802 | #property-jacksonville-west |
| Jacksonville North | 812 | #property-jacksonville-north |

---

## 9. Open Items for Developer

- [ ] Confirm UniFi Protect webhook payload schema from live controller test
- [ ] Confirm Aruba Instant On webhook payload schema from live portal test
- [ ] Confirm the `site`/property field name in both payloads — critical for property mapping
- [ ] Kate / Kyle to provide: Teams tenant ID, team ID, and channel IDs for all 8 properties
- [ ] Register Graph API app in Azure AD — IT to handle Azure AD access
- [ ] Confirm Graph API change notifications vs. polling for reply ingestion (depends on hosting environment and Azure subscription)
- [ ] Confirm 5-min timer implementation: BullMQ/Redis vs. DB polling (depends on hosting)
- [ ] Should overnight tickets (10 PM–8 AM) suppress Teams notifications or post with [OVERNIGHT] tag?
- [ ] Should AP wired-to-OTA events use the same 5-min SLA as camera offline events?

---

## 10. Phased Rollout

| Phase | Scope | Est. Effort |
|---|---|---|
| 1 | Webhook receivers + DB schema + event logging | 2–3 days |
| 2 | 5-min timer + ticket creation logic | 1–2 days |
| 3 | Teams Graph API — post ticket notification, save message_id | 1 day |
| 4 | Teams Graph API — post resolution as reply to thread | 0.5 days |
| 5 | Teams reply ingestion → ticket notes | 1–2 days |
| 6 | Dashboard (portfolio + per-property + ticket detail with notes) | 2–3 days |
| 7 | Escalation rules + recurring device flagging | 1–2 days |

---

## 11. Guest WiFi Dashboard (Spotipo)

### 11.1 Overview

The same web application hosts a second dashboard section for monitoring guest WiFi activity across all Stayable properties via the **Spotipo API**. This is monitoring only — no ticketing, no alerting. Data is read-only, pulled from Spotipo's per-site API and displayed in an overall portfolio view and a per-property view.

---

### 11.2 Spotipo API

**Base URL:** `https://api.spotipo.com/ext/{siteid}/api/v1/`

**Authentication:** `Authentication-Token: $API_KEY` header on every request

**Key concept:** Each Stayable property is a separate Spotipo **site**, identified by a `siteid`. All calls are scoped per site — there is no single multi-site aggregation endpoint. The app must call each property's site separately and aggregate results.

**Confirmed endpoints:**

| Endpoint | Method | Description |
|---|---|---|
| `/ext/{siteid}/api/v1/guest/` | GET | All guests for a site; supports `?fromdate=&todate=` (DD-MM-YYYY), `?page=`, `?per_page=`, `?search=` |
| `/ext/{siteid}/api/v1/guestuser/` | GET | Guestusers (paid/voucher users); includes `auths[].online` (bool), `auths[].last_seen_at`, `time_used`, `data_used` |

**Guest response fields used:**

| Field | Dashboard Use |
|---|---|
| `metadata.total` | Total guests in date range |
| `auths[].online` | Online now count (filter where `online = true`) |
| `auths[].last_seen_at` | Last activity timestamp |
| `auths[].time_used` | Dwell time display |
| `auths[].data_used` | Data usage (optional display) |

> **Revenue note:** A dedicated revenue totals endpoint is not confirmed in the public API docs. Developer must test against a live Spotipo account to determine whether payment/revenue data is accessible via the guestuser response or requires a separate endpoint. If unavailable via API, revenue may need to be pulled from Spotipo's built-in dashboard export until confirmed. Flag this with Spotipo support before building the revenue card.

---

### 11.3 Property → Site ID Mapping

Each Stayable property must be configured with its Spotipo `siteid` in the app's properties table (same `properties` table used by the device monitoring section — add a `spotipo_site_id` column).

| Property | RISE8 ID | Spotipo Site ID |
|---|---|---|
| Lakeland | 4645 | *(configure on setup)* |
| Orlando OBT | 8700 | *(configure on setup)* |
| Davenport | 44199 | *(configure on setup)* |
| St. Augustine | 2535 | *(configure on setup)* |
| Kissimmee East | 2295 | *(configure on setup)* |
| Kissimmee West | 5399 | *(configure on setup)* |
| Jacksonville West | 6802 | *(configure on setup)* |
| Jacksonville North | 812 | *(configure on setup)* |

---

### 11.4 Data Fetching Strategy

Spotipo's API is per-site only — no portfolio-level endpoint exists. The app fetches all sites in parallel and aggregates client-side.

```
GET /api/wifi/summary?from={date}&to={date}
  │
  ├── For each property with spotipo_site_id configured:
  │     └── GET https://api.spotipo.com/ext/{siteid}/api/v1/guest/
  │           ?fromdate={DD-MM-YYYY}&todate={DD-MM-YYYY}
  │
  ├── Aggregate across all sites:
  │     ├── total_guests = sum of metadata.total per site
  │     ├── online_now = sum of auths where online = true per site
  │     └── total_revenue = sum of payment amounts per site (if available via API)
  │
  └── Return per-property breakdown + portfolio totals
```

**Polling / caching:**
- Dashboard loads on page visit — do not auto-refresh aggressively
- Cache responses for 60 seconds to avoid hammering the Spotipo API across 8 sites simultaneously
- "Online now" can refresh every 60 seconds (Spotipo polls usage data at that interval internally)
- Date-range queries (total guests, revenue) can cache for 5 minutes — they don't change in real time

---

### 11.5 Dashboard UI — Guest WiFi Section

**Portfolio view (matches the Spotipo dashboard screenshot layout):**

| Card | Value | Source |
|---|---|---|
| Total Guests | Count of unique guests across all properties in date range | `metadata.total` summed |
| Online Now | Count of guests with `auths[].online = true` across all properties | Live, refreshed every 60s |
| Dwell Time | Average `time_used` across all active guests | `auths[].time_used` |
| Total Revenue | Sum of paid WiFi revenue in date range | Payment data (confirm API availability) |

**Date range selector:** defaults to last 7 days; user-selectable. Applies to Total Guests and Total Revenue cards. Online Now is always real-time regardless of date range.

**Per-property view:**

Same four cards, scoped to a single property. Accessible by clicking a property row or switching property tab.

Property table (portfolio view):

| Column | Value |
|---|---|
| Property | Name |
| Total Guests | Count for period |
| Online Now | Live count |
| Revenue | Period total |
| Avg Dwell Time | Formatted (h:mm) |

---

### 11.6 New Database Column

Add to existing `properties` table:

| Field | Type | Notes |
|---|---|---|
| spotipo_site_id | String | Nullable — only populated for properties using Spotipo |
| spotipo_api_key | String (encrypted) | Per-site API key if Spotipo uses per-site keys; otherwise one global key in app config |

---

### 11.7 New Internal API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/wifi/summary` | Portfolio totals — accepts `?from=YYYY-MM-DD&to=YYYY-MM-DD` |
| GET | `/api/wifi/summary/:property_id` | Per-property totals for date range |
| GET | `/api/wifi/online` | Live online now count, all properties |
| GET | `/api/wifi/online/:property_id` | Live online now count, single property |

These endpoints proxy and aggregate Spotipo API calls server-side — the frontend never calls Spotipo directly (keeps API keys server-side only).

---

### 11.8 Open Items for Developer

- [ ] Kate to provide Spotipo `siteid` for each of the 8 properties
- [ ] Kate to provide Spotipo API key(s) — confirm if one global key or per-site keys
- [ ] Developer to test live Spotipo account to confirm: (a) revenue field availability in API response, (b) exact field names for `online` and `last_seen_at`, (c) pagination behavior for large guest lists
- [ ] Confirm whether Spotipo API rate limits exist and what the per-minute call threshold is (relevant given 8 parallel site calls on every dashboard load)

---

*Prepared by RISE8 IT Operations · Kate · July 24, 2026*
