# RISE8 Operations Platform

Internal web application replacing Connecteam's operational checklist functionality for RISE8 Companies / Stayable extended-stay hotels.

**Status:** Pre-build planning. Target v1 launch: **10 weeks** from kickoff. Cutover from Connecteam: **14 weeks** from kickoff (extended per ADR-012 for Contractor Checklists + Quick Tasks).

---

## What It Does

- Field staff (Housekeeping, Property Attendants, Maintenance Techs) complete operational checklists on mobile.
- Property managers review submissions and approve/flag/request re-do.
- Issues auto-route to maintenance with SLA tracking.
- Real-time dashboards per property, user, role, and checklist type.
- Photo capture with geofence verification.
- Recurring and bulk checklist creation.
- **Quick Tasks** — lightweight ad-hoc task assignment.
- PDF export on demand.
- Daily Teams digest — auto-posted to master corporate channel + per-property channels.

## What It Doesn't Do

- Time clock, payroll, HR, shift scheduling → **Paycom** handles all of this
- Chat / messaging
- Hiring / onboarding
- Training / knowledge base
- Guest-facing functionality

---

## Documentation

Start here, in order:

1. **[CLAUDE.md](./CLAUDE.md)** — Project context, decisions, conventions. Required reading.
2. **[docs/PRD.md](./docs/PRD.md)** — Product Requirements Document. What we're building.
3. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — Technical Architecture. How we're building it.
4. **[docs/SPRINT_PLAN.md](./docs/SPRINT_PLAN.md)** — 10-week build plan with milestones.
5. **[docs/DECISIONS.md](./docs/DECISIONS.md)** — Architecture Decision Records (ADRs).
6. **[docs/RUNBOOK.md](./docs/RUNBOOK.md)** — Operational runbook.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Hosting | Vercel |
| Database | Neon Postgres + Prisma ORM |
| Object Storage | Cloudflare R2 |
| Auth | Auth.js v5 (Credentials provider) |
| Email | Resend |
| UI | shadcn/ui + Tailwind CSS |
| PWA / Offline | Workbox + IndexedDB |
| Background Jobs | Inngest + Vercel Cron |
| Monitoring | Sentry + Vercel Analytics |

**Recurring cost target:** ~$25–$45/month at full scale.

---

## Getting Started (Developer)

### Prerequisites

- Node.js 20+
- pnpm (preferred) or npm
- Neon account
- Vercel account
- Cloudflare account (for R2)
- Resend account
- GitHub repo access

### Setup

```bash
# Clone
git clone <repo-url>
cd rise8-ops-platform

# Install dependencies
pnpm install

# Copy env template and fill in
cp .env.example .env.local
# Edit .env.local with your local DB URL and dev keys

# Generate Prisma client
pnpm prisma generate

# Run migrations
pnpm prisma migrate dev

# Seed (creates test properties, templates, admin user)
pnpm prisma db seed

# Start dev server
pnpm dev
```

App should be running at `http://localhost:3000`.

Default admin (created by seed): `admin@stayable.com` / `changeme` (change immediately on first login).

### Common Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm test             # Unit tests
pnpm test:e2e         # End-to-end tests (Playwright)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm prisma studio    # Database GUI
pnpm prisma migrate dev --name <name>  # Create + apply migration
```

---

## Environment Variables

See `.env.example` for the full list. Required:

- `DATABASE_URL` — Neon connection string
- `AUTH_SECRET` — Auth.js secret (generate: `openssl rand -base64 32`)
- `AUTH_URL` — Full app URL
- `RESEND_API_KEY` — Resend API key
- `RESEND_FROM_EMAIL` — Verified sending email
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` — Cloudflare R2
- `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` — Inngest
- `SENTRY_DSN` — Sentry (optional in dev)
- `NEXT_PUBLIC_APP_URL` — Public-facing URL

---

## Deployment

- **Production:** auto-deploy on push to `main` → Vercel production
- **Staging:** auto-deploy on push to `develop` → staging environment
- **Preview:** auto-deploy on PR → unique preview URL per PR

Database migrations are run manually post-deploy via Vercel CLI:

```bash
vercel env pull .env.production
pnpm prisma migrate deploy
```

---

## Project Status

See the **Current Status** section in [CLAUDE.md](./CLAUDE.md) for the up-to-date phase and milestone tracking.

---

## Contributing

1. Read [CLAUDE.md](./CLAUDE.md) first.
2. Find your task in [docs/SPRINT_PLAN.md](./docs/SPRINT_PLAN.md).
3. Create a feature branch off `develop`.
4. Open a PR with a clear description.
5. Self-review, then request review.
6. After merge to `develop`, Vercel auto-deploys to staging.
7. Periodic releases to `main` go to production.

## License

Proprietary — RISE8 Companies LLC. All rights reserved.

## Contact

- **Product owner:** Kate (Director of Asset Management)
- **Sponsor:** Rob Beyer (CEO)
- **Ops support:** Christopher Acoy Jr., Karla Ysabelle Dugayo
