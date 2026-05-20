# Architecture Decision Records (ADRs)

This file is an append-only log of significant decisions made on the RISE8 Operations Platform project. Each entry captures the decision, the alternatives considered, the rationale, and the date.

When adding a new ADR, increment the number and follow the template at the bottom.

---

## ADR-001: Build a custom web application instead of replacing Connecteam with another off-the-shelf tool

**Date:** 2026-05-15
**Status:** Accepted

### Context
Connecteam handles operational checklists for 7 Stayable properties but creates two problems: (1) checklists submitted in Connecteam must be manually downloaded as PDFs and re-uploaded to Smartsheet by Karla and Christopher (1–2 hours/day), and (2) structured response data is buried in PDFs and not queryable. Other off-the-shelf checklist tools (Jolt, SafetyCulture, GoCanvas) were considered but have the same fundamental problem — they're black boxes that don't integrate naturally with the rest of the Stayable operations stack.

### Alternatives Considered
1. Stay with Connecteam + build a Connecteam → Smartsheet integration via Make.com
2. Replace Connecteam with another SaaS (Jolt, SafetyCulture, GoCanvas)
3. Build a custom web application

### Decision
Build a custom web application using Claude Code. Kate's team has the development capacity, and a custom build allows tight integration with Smartsheet, custom workflows (bulk creation, attendance invalidation), and ownership of the roadmap.

### Consequences
- Higher upfront effort (8 weeks) vs immediate integration with Make.com (~1–2 weeks)
- Ongoing maintenance burden falls on Kate's team
- Significantly lower long-term cost ($25–$45/mo vs $900/mo Connecteam estimate)
- Full control over feature set; can add bulk creation, geofence verification, employee scorecards

---

## ADR-002: Build as a Progressive Web App (PWA), not a native mobile app

**Date:** 2026-05-15
**Status:** Accepted

### Context
Field staff need to use the app on mobile devices. Connecteam currently provides a native iOS and Android app with offline support. The question was whether to match that with a native build or use a PWA.

### Alternatives Considered
1. Native React Native app (iOS + Android)
2. Capacitor wrapper around a web app
3. Progressive Web App (PWA) with service worker + IndexedDB

### Decision
Build as a PWA. With 2Gbps fiber and AP buildout across all properties, offline use is an edge case (stairwells, between buildings), not the normal case. PWAs avoid app store overhead, allow instant updates, and Claude Code can iterate faster on web than mobile native.

### Consequences
- iOS PWA limitations are real (storage limits, push notification limits, background sync limits)
- Week 1 of build is dedicated to validating iOS PWA viability — if it fails, fall back to Capacitor wrapper in v1.5
- Offline support is "good enough for short windows" not "multi-day offline tolerant"
- Single codebase for desktop and mobile

---

## ADR-003: Authentication via email + password for all users (no Microsoft 365 SSO in v1)

**Date:** 2026-05-15
**Status:** Accepted

### Context
Only managers and corporate currently have Microsoft 365 accounts. Field staff (HK, PA, MT) do not. Authentication options included full M365 SSO for everyone (~$180/mo additional cost), hybrid (M365 for managers + SMS OTP for field), or email + password for everyone.

### Alternatives Considered
1. M365 accounts for everyone (~$180/mo additional cost)
2. Hybrid: M365 SSO + SMS OTP for field staff (~$10–20/mo)
3. Email + password for everyone ($0)

### Decision
Email + password for everyone. Kate accepts the admin burden (estimated 2–5 password resets/week).

### Consequences
- No per-user authentication cost
- Admin must build one-click password reset action (mitigation in scope)
- Some field staff may not regularly check email, complicating self-service reset
- Future: M365 SSO can be added as an additional provider without disrupting field staff login

---

## ADR-004: No Smartsheet write-through during transition; Smartsheet becomes read-only archive on cutover

**Date:** 2026-05-15
**Status:** Accepted

### Context
The current pipeline writes operational data to Smartsheet (via manual Karla/Christopher uploads). Question: should the new platform dual-write to Smartsheet during the transition period to keep existing dashboards alive?

### Alternatives Considered
1. Dual-write during transition (6 months), then retire Smartsheet
2. No write-through; Smartsheet becomes historical archive on cutover (fresh start)
3. Keep Smartsheet sync indefinitely

### Decision
No write-through. Smartsheet becomes read-only archive on cutover. New platform starts fresh — no backfill, no dual-write.

### Consequences
- Build simplifies by ~1 week (no Smartsheet integration code)
- No reconciliation complexity (which system has truth when they diverge?)
- Existing Smartsheet dashboards stop receiving new data on cutover (they become historical reference only)
- New platform must have its own dashboards by cutover (already in scope)

---

## ADR-005: Tech stack — Next.js 15 + Vercel + Neon Postgres + Prisma + Cloudflare R2 + Auth.js + Resend

**Date:** 2026-05-15
**Status:** Accepted

### Context
Choice of tech stack drives developer velocity, ongoing cost, and future flexibility.

### Decision
- **Framework:** Next.js 15 (App Router) — server-side rendering and API routes in one codebase
- **Hosting:** Vercel — existing free tier, zero-config Next.js deployment
- **Database:** Neon Postgres — existing free tier, serverless, branches for preview environments
- **ORM:** Prisma (or Drizzle — developer's choice, pick one)
- **Object Storage:** Cloudflare R2 — no egress fees, ~$0.015/GB
- **Auth:** Auth.js v5 — open-source, supports credentials + future SSO
- **Email:** Resend — existing free tier
- **UI:** shadcn/ui + Tailwind CSS — works well with Claude Code, fully customizable

### Consequences
- All-in cost projected at $25–$45/month at production scale
- Most services have free tiers that cover early development
- Stack is well-known and well-documented; Claude Code support is strong
- Single deploy target (Vercel) simplifies operations

---

## ADR-006: Out of scope for v1 — time tracking, payroll, HR, scheduling, chat, hiring, training, knowledge base

**Date:** 2026-05-15
**Status:** Accepted

### Context
Connecteam handles many modules beyond checklists. Question: which to replicate in v1?

### Decision
Operations-only scope. Out of scope:
- Time clock / time tracking → handled by Paycom
- Payroll / benefits / HR → handled by Paycom
- Shift scheduling → handled by Paycom
- Hiring / onboarding → out
- Training / courses / knowledge base → use SharePoint
- Chat / messaging → out
- Surveys → out
- Guest-facing features → out

In scope:
- Operational checklists (assignment, completion, review)
- Photos with geofence verification (this is our "time tracking" via EXIF)
- Issues pipeline
- Recurring/bulk creation
- Dashboards
- PDF export on request

### Consequences
- v1 timeline drops to 8 weeks (vs 20+ weeks for Connecteam parity)
- Connecteam can be fully retired post-cutover since Paycom covers everything else
- Future v1.5+ can add scope if needed (push notifications, anomaly detection, AI photo analysis)

---

## ADR-007: Jacksonville North (812) is in scope as the 8th property

**Date:** 2026-05-21
**Status:** Accepted

### Context
The PRD lists 8 properties but the original CLAUDE.md scope card listed 7, leaving JN (812) ambiguous. The Week 2 seed and the geofence work in Week 6 both need a definitive answer so we are not retrofitting an 8th property mid-build.

### Alternatives Considered
1. Ship v1 with 7 properties and add JN post-cutover as a v1.5 addition
2. Include JN in v1 from the start

### Decision
Include Jacksonville North (812) as the 8th active property. Seed scripts, geofence polygons, recurring rules, training, and provisioning all assume 8 properties.

### Consequences
- One additional property to configure during Week 8 go-live (users, rooms, geofence polygon, recurring rules)
- No retrofit work later; cleaner cutover
- Marginal effort increase in Weeks 5–8; no schema changes required

---

## ADR-008: MFA on-by-default for managers and corporate; optional for field staff

**Date:** 2026-05-21
**Status:** Accepted

### Context
The auth design called for MFA but left the default state open: on-by-default vs opt-in for managers/corporate. Field-staff MFA is friction-heavy on shared/older devices and the role rarely sees sensitive cross-property data, so the trade-off is different per role.

### Alternatives Considered
1. MFA opt-in for all roles
2. MFA on-by-default for all roles
3. MFA on-by-default for managers/corporate/admin; optional/off-by-default for field staff

### Decision
Option 3. MFA is on-by-default for MANAGER, CORPORATE, and ADMIN roles. Field staff (HK, PA, MT) can enable MFA but it is off by default. Implementation is TOTP via authenticator app (Google Authenticator, Authy, 1Password, etc.) — **no SMS**.

### Consequences
- Week 1 Auth.js scaffolding must include TOTP enrollment + verification flow (not just stub)
- Manager/corp first-login flow includes a forced MFA enrollment step before reaching the dashboard
- Recovery codes generated on enrollment; admin can reset MFA via the same one-click flow that resets passwords
- Field-staff login stays one-step; no friction added to the most common path

---

## ADR Template (copy for new entries)

```
## ADR-XXX: [Short title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Deprecated | Superseded by ADR-YYY

### Context
[What problem are we solving? What forces are at play?]

### Alternatives Considered
1. [Option 1]
2. [Option 2]
3. [Option 3]

### Decision
[What did we decide?]

### Consequences
[What are the trade-offs? What becomes easier? What becomes harder?]
```
