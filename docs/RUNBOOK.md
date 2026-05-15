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
- **R2 (photos/PDFs):** Versioned bucket, 30-day retention on deleted objects
- **Source code:** GitHub (assumed durable)
- **Environment variables:** Documented in `docs/RUNBOOK.md` (this file) with values stored in Vercel

### Restore Procedures

#### Restore database to a specific point in time
1. Neon dashboard → Branches → Create branch from PITR
2. Update DATABASE_URL temporarily to point to the branch
3. Verify data
4. Promote branch to primary (planned outage required)

#### Restore a deleted photo
1. R2 dashboard → Bucket → Versions → Find deleted object
2. Restore version
3. Update DB record if necessary

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

*Add to this runbook every time something is fixed or learned. Future-you will thank present-you.*
