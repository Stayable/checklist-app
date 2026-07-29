# IT Ticketing Plan — RISE8 / Stayable

**Domain:** IT infrastructure ticketing (access points, cameras, network gear) across the 8 Stayable properties.
**Prepared by:** Claude Code / Kyle · **Date:** 2026-07-24
**Status:** 🟡 **ON HOLD — planning only, not scheduled.** Backend of record = **Zoho Desk**; the Zoho Desk build/integration is deliberately deferred (this doc captures scope so it isn't lost).
**Incoming spec:** Kate to provide an IT-ticketing spec `.md` (parallels the S7 maintenance ticketing `.md`). Until it lands, this doc is the **integration frame** — reconcile against her spec on receipt.
**Monitoring:** **UniFi API access confirmed** (Ubiquiti) — resolves §7 Q3; enables automated asset inventory + status, and potential auto-ticketing. See §5/§6.
**Relationship to StayCheck:** **Separate from** StayCheck maintenance ticketing (S7). See §4 boundary — do not merge the two.

> ⚠️ This is net-new scope beyond the StayCheck v1.1 build. It is captured here on request; nothing is built, and it does not enter the S-phase sequence unless explicitly greenlit (would become its own ADR at that point).

---

## 1. Why a separate IT track

StayCheck exists for **property operations** — housekeeping, maintenance, room lifecycle. Its `Issue` / work-order model (S7) is for **physical/maintenance** problems tied to rooms and checklists (HVAC, roof, plumbing, pests), worked by maintenance techs and contractors.

**IT problems are a different animal:** WiFi access points down, cameras offline / not recording, switch or ISP outage, cabling. Different assets, different responders (in-house IT or a managed-services provider), different urgency model, and a different tool. Forcing them into StayCheck's maintenance pipeline would pollute the maintenance dashboards, SLAs, and the field-staff issue queue. Keep them separate.

**Decision (proposed):** IT tickets live in **Zoho Desk**, not in StayCheck. RISE8 already runs the Zoho suite (CRM is connected), so Zoho Desk is the natural helpdesk of record. **Held for now.**

---

## 2. Scope of IT ticketing (when un-held)

### IT asset categories to track
Per property (×8). *Exact counts/models per property = unknown, but now **pullable via the UniFi API** for anything on the UniFi platform (see §6).*
- **Wireless access points (APs)** — the 2 Gbps fiber + AP buildout; **UniFi Network** (API-visible: model, adoption/online status, uptime).
- **Network core** — switches, gateway/firewall — also **UniFi Network** where UniFi gear is used.
- **Cameras** — surveillance. **On UniFi Protect? — CONFIRM.** If yes, camera inventory + online/recording status is API-visible too; if the cameras are a non-UniFi system, they need a separate source.
- **Endpoints** *(TBD in/out of scope)* — front-desk / PMS terminals, printers, door-lock controllers (not UniFi; manual).

### Ticket types (examples)
- AP offline / degraded coverage / needs reboot or replacement.
- Camera offline / not recording / lens or mount issue / storage full.
- Network outage (property-wide or zone), ISP down, switch failure.
- Cabling / new drop / relocation.
- Provisioning / config change (SSID, VLAN, firmware).

### Lifecycle (Zoho Desk native)
New → Open → In Progress / On Hold (waiting on vendor/part) → Resolved → Closed, with priority + SLA. Use Zoho Desk's built-in states — do **not** re-implement a ticket engine.

---

## 3. Backend of record: Zoho Desk (HELD)

**Chosen tool:** Zoho Desk. **Build status: on hold.**

What "on hold" means concretely: we do **not** provision Zoho Desk, define categories, wire notifications, or build any StayCheck↔Zoho integration now. This section is the checklist for when it's greenlit.

**Connector note:** a **Zoho Desk MCP connector exists** and can be authenticated when we start (distinct from the Zoho **CRM** connector already in use). That gives an automatable path for setup + optional StayCheck intake later — but it stays untouched while held.

---

## 4. Boundary vs StayCheck (keep clean)

| | StayCheck maintenance ticketing (S7) | IT ticketing (this doc) |
|---|---|---|
| Assets | Rooms, building systems (HVAC, roof, plumbing) | APs, cameras, network gear |
| Source | Failed checklist questions, manager flags | IT-issue reports / monitoring alerts |
| Worked by | Maintenance techs, contractors | IT / MSP |
| Tool | StayCheck `Issue` model | **Zoho Desk** |
| Status | In active StayCheck plan (S7, blocked on Kate's `.md`) | **On hold** |

**Do not** route IT issues through StayCheck's `Issue` table or the field-staff issue queue. If, later, a property manager should be able to *report* an IT problem from inside StayCheck, that is a **thin intake** (a form that creates a Zoho Desk ticket via API) — explicitly part of the deferred integration, not a second ticket system.

---

## 5. Optional future integration (all deferred)

Only relevant once Zoho Desk is live and if we decide StayCheck should touch IT at all:
- **UniFi → Zoho Desk auto-ticketing:** poll (or webhook, if available) the UniFi API for device-offline / adoption-lost events and auto-open a Zoho Desk ticket, tagged to property + device. This is the highest-value integration — turns "a manager notices the WiFi is down" into an automatic ticket. Deferred with the rest.
- **StayCheck → Zoho Desk intake:** a "Report IT issue" action (property + category + description + photo) that opens a Zoho Desk ticket via the Zoho Desk API/MCP; StayCheck stores only a reference (ticket #, link), never a parallel record.
- **Status echo-back:** show open IT ticket count per property on a corporate view (read-only pull from Zoho Desk).
- **Asset inventory home:** decide whether IT assets live in Zoho Desk's asset module, a StayCheck `Asset` extension (S4 introduces an `Asset` registry — could be reused), or are sourced live from UniFi. Leaning: UniFi as the source of truth for UniFi-managed gear, Zoho for everything else.

None of these are scheduled.

---

## 6. What can start now without Zoho (optional, low-cost)

Useful pre-work that doesn't require un-holding Zoho Desk:
- **IT asset inventory — auto-pull from UniFi.** With UniFi API access, the AP / switch / gateway inventory (and cameras, if UniFi Protect) can be pulled programmatically per site rather than hand-typed: model, MAC/IP, adoption status, uptime. A small read-only script against the UniFi API gets us a live per-property inventory. Non-UniFi gear (endpoints, non-Protect cameras) still needs a manual pass.
- This inventory feeds whatever ticketing/asset system we eventually pick and is useful regardless of Zoho timing. Low effort given the API — worth doing early if you want a real IT asset picture across the 8 properties.

---

## 7. Open questions (need answers before un-holding)

1. **Who operates IT** — in-house staff, or a managed-services provider (MSP)? Determines assignment pool, SLAs, and whether Zoho Desk seats go to a vendor. *(Unknown.)*
2. **Endpoints in scope?** — just network/AP/camera infrastructure, or also front-desk PCs / PMS terminals / printers / door locks? *(Unknown.)*
3. ~~**Monitoring source**~~ — **RESOLVED: UniFi (Ubiquiti), API access confirmed.** APs/switches/gateway are UniFi-managed and API-visible; auto-ticketing on device-offline is feasible (§5). Remaining sub-question: **are the cameras on UniFi Protect** (API-visible) or a separate system?
4. **Does StayCheck need any IT surface at all**, or is IT ticketing fully self-contained in Zoho Desk? *(Determines whether §5 ever happens.)*
5. **Asset counts per property** — needed to scope Zoho Desk plan/seats and the inventory effort. *(Unknown — §6 pass answers this.)*

---

*On hold. Un-holding this = confirm the §7 answers, then it gets its own ADR and a real implementation plan for the Zoho Desk setup + any StayCheck intake.*
