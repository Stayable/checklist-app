# RISE8 Operations Platform — Status Update

**Date:** May 18, 2026
**Phase:** Pre-build planning complete · Pre-Week-1
**Owner:** Kate Estocapio (Director of Asset Management)
**Sponsor:** Rob Beyer (CEO)

---

## Where we are

Planning is finished. The PRD, Technical Architecture, 8-week Sprint Plan, and the first six ADRs are written, reviewed, and checked into the project repo. Repo scaffolding (CLAUDE.md, TODO.md, launcher) is in place. **No application code has been written yet** — Phase 1 (Week 1 Foundation) is gated on Rob's scope + budget sign-off.

## What's done

- PRD finalized — full scope, role matrix, 9 templates, 11 question types, auth model, photo/geofence rules
- Technical Architecture finalized — Next.js 15 PWA on Vercel, Neon Postgres, Prisma, R2 photos, Resend email, Auth.js v5, Inngest jobs
- 8-week Sprint Plan finalized — week-by-week deliverables, alpha (Wk 4) and feature-complete (Wk 6) gates, 4-week parallel run, Smartsheet cutover plan
- ADRs 001–006 recorded — auth, hosting, ORM, photo storage, sync strategy, mobile shell
- Repo conventions, naming standard, env-var list locked in CLAUDE.md

## What's open / blocking

| Pri | Item | Owner | Needed by |
|---|---|---|---|
| P0 | Sign-off on scope + budget | Rob | Before Week 1 kickoff |
| P0 | Is Jacksonville North (812) the 8th property? (PRD says 8, CLAUDE.md says 7) | Kate | Before Week 2 seed |
| P0 | Field user self-invalidate (call in sick) or manager-only? | Rob / Kate | Week 2 |
| P0 | Bonus calc logic (how Bonus=1 vs 0 works in the new platform) | Rob | Week 3 |
| P0 | SLA defaults per issue priority | Christopher | Week 4 |
| P0 | Final recurring rules per template per property | Property Managers | Week 4 |
| P0 | Final geofence polygon coords per property | Kate | Week 5 |
| P1 | Final subdomain (placeholder `ops.stayable.com`) | Kate | Week 1 |
| P1 | MFA default for managers/corporate (on-by-default vs opt-in) | Kate | Week 1 |
| P2 | Actual Connecteam monthly invoice (validates savings figure) | Kate | — |

## Up next (Week 1, on sign-off)

- Mon: Next.js 15 scaffold → Vercel auto-deploy → Neon DB connected
- Tue: Auth.js v5 Credentials provider, JWT sessions, lockout
- Wed: Prisma schema for users / properties / user_properties + seed for 7 (or 8) properties
- Thu: PWA shell + manifest + service worker, install + verify on real iPhone and Android
- Fri: **Critical de-risk** — photo capture + GPS POC on iOS PWA. Go/no-go on PWA viability ends the week.

## Reference documents (in repo `/docs`)

The following six documents are the source of truth for this project. Please review the ones relevant to your role before Rob's sign-off meeting.

| # | File | Purpose | Read first if you are… |
|---|---|---|---|
| 1 | `docs/PRD.md` | Product Requirements — full scope, roles, templates, question types, auth, photo rules, out-of-scope list | Anyone reviewing scope or features |
| 2 | `docs/ARCHITECTURE.md` | Technical Architecture — stack, data model, API surface, infra, env vars, security | The developer; anyone reviewing cost or risk |
| 3 | `docs/SPRINT_PLAN.md` | 8-week sprint plan + 4-week parallel run + cutover | Anyone tracking timeline or milestones |
| 4 | `docs/DECISIONS.md` | ADRs 001–006 — why we picked each major piece of the stack and approach | Anyone questioning a stack or scope choice |
| 5 | `docs/RUNBOOK.md` | Operational runbook — how to fix common issues, rotate secrets, restore from backup | Ops / support; built up over time |
| 6 | `docs/CHANGELOG.md` | User-facing change history | Anyone tracking releases post-launch |

## Decisions already locked (do not re-debate)

- PWA only — no native iOS/Android wrapper in v1 (Capacitor reserved as fallback only if Week 1 iOS test fails)
- Email + password auth for **all** users (no Microsoft 365 SSO in v1; SSO additive later)
- No Smartsheet write-through during transition — Smartsheet becomes read-only archive on cutover
- Stack: Next.js 15 + Vercel + Neon + R2 + Resend + Auth.js v5 + Prisma + shadcn/ui

## Risks worth flagging

- **iOS PWA GPS** is the single biggest technical risk. Week 1 Friday is the go/no-go. If GPS-via-`navigator.geolocation` doesn't work reliably inside a home-screen-installed PWA on iOS 17+, the fallback is a Capacitor wrapper — that adds ~1 week and an Apple Developer account.
- **Property data alignment** — PRD references 8 properties, CLAUDE.md references 7 (Jacksonville North 812 in question). This must resolve before seed data is written in Week 2.
- **Recurring rules** are owned by Property Managers and not yet collected. If those aren't in by end of Week 3 the Week 5 cron work slips.

---

*Generated 2026-05-18 from repo state. Source: `CLAUDE.md` Current Status block + `TODO.md` + `/docs`.*
