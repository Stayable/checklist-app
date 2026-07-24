# Operational Runbook

This document captures the operational knowledge needed to maintain the RISE8 Operations Platform in production. It is built up over time as situations arise. When something breaks and gets fixed, add the procedure here so the next person doesn't have to figure it out from scratch.

---

## Table of Contents

- [Incident Response](#incident-response)
- [Common Issues](#common-issues)
- [User Management](#user-management)
- [Database](#database)
- [Object Storage (R2)](#object-storage-r2)
- [Deployments](#deployments)
- [Monitoring](#monitoring)
- [Secrets Rotation](#secrets-rotation)
- [Backup and Recovery](#backup-and-recovery)

---

## Incident Response

### Severity Levels

| Level | Definition | Response Time |
|---|---|---|
| **P0** | Site down for all users; data loss; auth completely broken | < 1 hour |
| **P1** | Major feature broken for many users (e.g., photo upload failing) | < 4 hours |
| **P2** | Minor feature broken or single user affected | < 1 business day |
| **P3** | Cosmetic / nice-to-have | Next sprint |

### Who To Contact

- **Primary:** Kate
- **Backup:** Christopher
- **Sponsor (P0/P1 only):** Rob

### Communication

- Use the dedicated Teams channel for in-flight updates
- After resolution, document root cause and fix in this runbook

---

## Common Issues

### User can't log in

**Symptom:** User reports they can't log in / "wrong password" error.

**Diagnosis:**
1. Check the user exists in the `users` table
2. Check `active = true`
3. Check `last_login_at` — if it has been recent, likely a password issue
4. Check audit log for failed attempts; account may be locked

**Fix:**
- If locked (5 failed attempts), admin can manually unlock via Admin UI → Users → [user] → Unlock
- If password forgotten, admin can trigger password reset email via Admin UI → Users → [user] → Reset Password

### Photo upload failing

**Symptom:** Field user can't upload photos; gets error on submit.

**Diagnosis:**
1. Check Sentry for client-side errors
2. Check R2 dashboard for upload errors
3. Check if presigned URL generation is failing (server logs in Vercel)
4. Confirm R2 bucket is accessible (try CLI: `aws s3 ls --endpoint-url=...`)

**Common causes:**
- Expired R2 credentials → rotate per [Secrets Rotation](#secrets-rotation)
- File too large → check client-side compression is running
- Bucket misconfigured → check CORS policy allows uploads from production domain

### Recurring checklists not generating

**Symptom:** Morning of a workday, no checklists appear for staff.

**Diagnosis:**
1. Check Vercel Cron logs — did the 5:00 AM ET job run?
2. Check `recurring_rules` table — are rules active?
3. Check Sentry for cron job errors
4. Manually trigger the job via admin endpoint to test

**Fix:**
- If cron failed silently, manually trigger via Admin UI → System → Run Daily Generation
- If a specific rule is broken, edit it via Admin UI → Recurring Rules

### Emails not arriving

**Symptom:** Users report they didn't get assignment / flag notification.

**Diagnosis:**
1. Check `notification_log` — was the notification queued?
2. Check Resend dashboard for delivery status
3. Check spam folder of recipient
4. Check Resend bounce reports
5. Confirm DNS records (SPF, DKIM, DMARC) are still valid

**Fix:**
- If Resend rate limit hit, upgrade to Pro tier
- If DKIM/SPF broken, fix DNS via domain registrar (rentstayable.com / stayable.com)
- If recipient bounced, mark email in DB as invalid; ask user to update

---

## User Management

### Creating a New User

Admin → Users → Create User. Fill in:
- Name (full name)
- Email (will be login)
- Role (HK / PA / MT / MANAGER / CORPORATE / ADMIN)
- Property assignments (which properties they can access)

System sends activation email automatically. Activation link valid for 7 days.

### Deactivating a User

Admin → Users → [user] → Deactivate.

This:
- Sets `active = false`
- Revokes all active sessions immediately
- Preserves all historical data and assignments
- User can no longer log in

To restore access, reactivate via Admin UI.

### Bulk Provisioning

For onboarding many users at once (Week 8 of build), use the bulk import script:

```bash
pnpm tsx scripts/bulk-import-users.ts ./users.csv
```

CSV format: `name,email,role,property_codes` (property_codes comma-separated, quoted if multiple)

---

## Database

### Connecting to Production DB

```bash
# Pull production env
vercel env pull .env.production

# Connect via psql or Prisma Studio
psql $DATABASE_URL
# or
pnpm prisma studio
```

⚠️ Production DB. Read-only queries only unless absolutely necessary. Migrations only via Prisma Migrate.

### Running a Migration

```bash
# Create migration locally
pnpm prisma migrate dev --name <descriptive_name>

# Deploy to staging (manual)
pnpm prisma migrate deploy --schema=./prisma/schema.prisma
# (with DATABASE_URL pointing to staging)

# Deploy to production
# (same command, with production DATABASE_URL pulled via vercel env pull)
```

⚠️ Always backup before destructive migrations. Neon Pro provides 7-day point-in-time recovery.

### Database Query Performance

If a query is slow:
1. Use Neon's query insights dashboard
2. Run `EXPLAIN ANALYZE` to inspect query plan
3. Add appropriate index (see ARCHITECTURE.md Section 4.2 for current indexes)

---

## Object Storage (R2)

### Bucket Layout

- `rise8-ops-prod` — production photos and PDFs
- `rise8-ops-staging` — staging environment
- `rise8-ops-backup` — daily DB dumps and disaster recovery

### Access Patterns

- All access via presigned URLs (15-min for uploads, 1-hour for downloads)
- No public buckets
- Lifecycle policy: PDFs older than 90 days move to infrequent access tier

### Cleaning Up Orphaned Photos

A scheduled job (`/api/cron/cleanup-photos`) runs weekly to remove photos that have no associated response record (uploaded but submit failed). Logs go to Sentry.

---

## Deployments

### Production Deploy

1. PR merged to `main` → Vercel auto-deploys
2. If migration required, run `pnpm prisma migrate deploy` against production DB
3. Monitor Sentry for errors in the 30 minutes after deploy
4. Smoke test critical paths: login, submit checklist, review submission

### Rollback

If a deploy breaks production:
1. Revert the offending commit in GitHub
2. Push to main → Vercel auto-redeploys previous version
3. If DB migration caused the issue, use Neon point-in-time recovery to restore pre-migration state
4. Communicate impact and resolution in Teams channel

### Hotfix Process

1. Branch from `main` (not `develop`)
2. Make minimal fix
3. PR with `hotfix/` prefix
4. Merge directly to `main` after review
5. Cherry-pick to `develop` afterward

---

## Monitoring

### Daily Checks

These should be reviewed every morning:

- **Sentry** — any new unresolved errors in last 24 hours?
- **Vercel Analytics** — any unusual traffic patterns or 5xx spikes?
- **Neon dashboard** — connection count, storage growth, query performance
- **Resend dashboard** — bounce rate, delivery rate
- **R2 dashboard** — storage growth, request count

### Weekly Checks

- **Cost review** — projected monthly bill across all services
- **User activity** — submissions per property, completion rates
- **Audit log review** — any unusual admin actions?

### Alerting

| Trigger | Alert Channel | Recipient |
|---|---|---|
| Sentry: > 10 errors / hour | Teams + Email | Kate |
| Vercel: deploy failed | Teams + Email | Developer |
| Neon: DB > 80% storage | Email | Kate |
| Cron job: failed | Teams + Email | Developer |
| Auth: > 50 failed logins / hour from same IP | Teams | Kate |

---

## Secrets Rotation

All secrets are in Vercel environment variables. Rotate annually or immediately on suspected compromise.

### Rotation Procedure

1. Generate new secret value
2. Update in Vercel env vars (staging first, then production)
3. Redeploy
4. Verify functionality
5. Revoke old secret at the source service

### Secret-Specific Notes

- **AUTH_SECRET:** Rotating will invalidate all existing sessions (users must re-login)
- **DATABASE_URL:** Rotate via Neon dashboard (creates new connection string)
- **R2 keys:** Rotate via Cloudflare dashboard; deploy new env vars before revoking old
- **RESEND_API_KEY:** Rotate via Resend dashboard
- **INNGEST_SIGNING_KEY:** Rotate via Inngest dashboard

---

## Backup and Recovery

### What's Backed Up

- **Database:** Neon Pro PITR (7 days) + nightly logical dump to R2 (30-day retention)
- **R2 (photos/PDFs):** **No object versioning — R2 does not offer it** (confirmed against live bucket settings 2026-06-05; only lifecycle option is the default multipart-abort rule). The earlier "versioned bucket, 30-day soft-delete" line was written assuming S3 semantics and was wrong. Actual protections: (a) keep-forever policy (ADR-013) — production code never deletes photos; (b) object-scoped API token, staging bucket only; (c) R2 **Bucket Lock rules** (none configured yet) can enforce WORM retention — evaluate for the prod bucket at Phase 8, and verify prefix scoping first so cleanup crons aren't blocked
- **Source code:** GitHub (assumed durable)
- **Environment variables:** Documented in `docs/RUNBOOK.md` (this file) with values stored in Vercel

### Restore Procedures

#### Restore database to a specific point in time
1. Neon dashboard → Branches → Create branch from PITR
2. Update DATABASE_URL temporarily to point to the branch
3. Verify data
4. Promote branch to primary (planned outage required)

#### Restore a deleted photo
**Not possible — R2 has no versioning, so a deleted object is gone.** Prevention is the control: production code paths never delete photos (ADR-013 keep-forever); the only delete paths are `/photo-test` throwaway objects and the (future, P2) orphaned-photo cleanup cron, which must be prefix-restricted and reviewed before it ships. For belt-and-braces on prod, consider Bucket Lock (above) and/or the post-launch cross-account backup copy.

#### Full disaster recovery (account compromised, everything wiped)
1. Restore from R2 backup bucket (separate Cloudflare account or AWS S3 cross-region copy — set up post-launch)
2. Provision new Neon database from nightly dump
3. Restore Vercel project from GitHub
4. Update all env vars
5. Communicate downtime to users

---

## Logs

### Where to Find Logs

- **Application logs:** Vercel dashboard → Project → Logs (real-time)
- **Errors:** Sentry dashboard
- **Database queries:** Neon dashboard → Insights
- **Email delivery:** Resend dashboard
- **Audit trail (user actions):** `audit_log` table in DB
- **Notification log:** `notification_log` table in DB

### Log Retention

- Vercel: 1 day on free tier, 7 days on Pro
- Sentry: 30 days on free tier, 90 days on paid
- Neon: query insights 24 hours on free tier, 7 days on Pro
- Resend: 30 days

For long-term audit logging, the `audit_log` table is the source of truth and is retained indefinitely.

---

## Useful Commands

```bash
# Pull production env vars
vercel env pull .env.production

# Run migration on production
DATABASE_URL=$(grep DATABASE_URL .env.production | cut -d'=' -f2) pnpm prisma migrate deploy

# Generate test data
pnpm tsx scripts/generate-test-data.ts

# Reset a user's password (CLI)
pnpm tsx scripts/admin-reset-password.ts <email>

# Run a one-off cron job manually
curl -X POST https://ops.stayable.com/api/cron/generate-checklists \
  -H "Authorization: Bearer $CRON_SECRET"

# Force-cleanup orphaned photos
curl -X POST https://ops.stayable.com/api/cron/cleanup-photos \
  -H "Authorization: Bearer $CRON_SECRET"
```

---

## Splitting the Production DB off the shared Dev DB

**Status:** ✅ **DONE 2026-07-24.** Production now runs on its own Neon project **`ep-summer-cloud-axmco63q`** (`us-east-2`, `neondb`); **Preview + local stay on the old shared dev DB `ep-falling-moon-apwovbb3`** (`us-east-1`). Executed per the steps below: `migrate deploy` (11 migrations) + core seed (8 properties, admin + kate/bke CORPORATE, 9 templates, SLA, 0 instances, no demo data) against the new DB; Vercel Production `DATABASE_URL`/`DIRECT_URL` repointed (Preview re-added with the dev value — note: removing a var from one environment when it was attached to multiple drops ALL its bindings, so re-add each explicitly); redeploy `dpl_2T6KEA…` → `checklist-elgpiqjdp`, aliased to ops.rentstayable.com, Ready. Verified `/login` 200, `/review` 307, `/api/auth/session` 200. Prod prod-DB connection strings live in gitignored `.env.production.local` (run future prod migrations with `prisma migrate deploy` sourcing that file). **Rollback:** `vercel promote https://checklist-4gwsbzke8-stayable-admins-projects.vercel.app` re-aliases prod to the last dev-DB-backed deployment.
**Post-cutover TODO:** re-rotate admin pw (seeded `StayableCheck` on the new DB); kate/bke rotate `ChangeMe!2026` via `/profile`; existing prod sessions are invalid (user IDs differ across DBs) → re-login; OTP emails go to the `@rentstayable.com` inboxes; `CRON_SECRET` still unset (5 AM gen inert — set it now that prod has its own DB).

**(historical, pre-split)** Prod (`ops.rentstayable.com`) shared the **dev** Neon DB `ep-falling-moon-apwovbb3` (`neondb`), which held seeded test users + PLACEHOLDER question content. Because they shared, **any migration applied locally also hit prod's schema** — e.g. `20260702221150_drop_bonus_eligible` was applied to that shared DB on 2026-07-02.

**What actually needs a human:** only **creating the Neon prod database** — that needs Neon console access (or a `NEON_API_KEY` + `neonctl`, neither present here). The Vercel CLI *is* installed, authed (`admin-15537530`), and linked, so the env-var repoint (step 4) can be scripted. Once the prod DB exists and its connection strings are provided, Claude can run migrate + seed + the Vercel Production env writes + redeploy end-to-end.

**Recommended approach — new empty prod DB, migrate fresh, seed real data** (a Neon *branch* would copy the dev placeholders, which is the opposite of what we want).

1. **Create the DB.** Neon console → new project (or new database in an isolated project), e.g. `stayable-ops-prod`. Copy both connection strings: the **pooled** URL (→ `DATABASE_URL`) and the **direct** URL (→ `DIRECT_URL`, used by migrations).

2. **Apply schema** to the empty DB (all migrations, no data):
   ```bash
   DATABASE_URL="<prod-pooled>" DIRECT_URL="<prod-direct>" pnpm prisma migrate deploy
   ```

3. **Seed real data — decision required.** `prisma/seed.ts` creates the 8 properties + a temp admin + TEST users + PLACEHOLDER templates/questions. For prod you want the 8 properties + geofences + one real admin, then the real template/question content (owed by Karla/Christopher) and staff provisioned via the admin UI. Either trim `seed.ts` to properties+admin only, or run the full seed and then delete the test users. Run against prod explicitly:
   ```bash
   DATABASE_URL="<prod-pooled>" DIRECT_URL="<prod-direct>" pnpm tsx prisma/seed.ts
   ```

4. **Repoint Vercel Production** (CLI — it's authed + linked). `DATABASE_URL`/`DIRECT_URL` are currently `Production, Preview` on the *same* (dev) value; to split, remove the Production-scoped copy and re-add the prod value to Production only, leaving Preview on the dev DB:
   ```bash
   vercel env rm DATABASE_URL production -y && printf '%s' "<prod-pooled>" | vercel env add DATABASE_URL production
   vercel env rm DIRECT_URL  production -y && printf '%s' "<prod-direct>" | vercel env add DIRECT_URL  production
   ```

5. **Redeploy production** so the new env is picked up (env changes don't apply to existing deployments): push a commit to `main`, or redeploy the latest prod deployment from the Vercel dashboard.

6. **Verify:** log in as the new prod admin → `/admin/users` + `/admin/properties` show the real (not test) data; submit + review a checklist round-trips.

7. **Only now** set `CRON_SECRET` in Vercel Production to enable 5 AM generation — the route is fail-closed until it's set (commit `9cf069d`), and you don't want auto-gen firing against placeholder content.

**After the split:** local dev keeps pointing at the dev DB, so local migrations no longer touch prod. To apply a future migration to prod, run `prisma migrate deploy` against the prod URLs (step 2 pattern), or fold it into a deploy step. Consider a clean prod R2 bucket at the same time (still `rise8-ops-staging` today).

---

*Add to this runbook every time something is fixed or learned. Future-you will thank present-you.*
