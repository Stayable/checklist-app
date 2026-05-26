# RISE8 Operations Platform — Technical Architecture

**Version:** 1.0
**Date:** May 15, 2026
**Prepared by:** Kate, Director of Asset Management

---

## 1. Stack Overview

This platform is built as a single Next.js application deployed on Vercel, backed by a Postgres database on Neon, with object storage on Cloudflare R2, transactional email via Resend, and authentication using Auth.js with credential-based login. All third-party services have generous free tiers; paid usage is estimated at under $35/month at full operating scale.

| Layer | Choice | Reason | Cost |
|---|---|---|---|
| Framework | Next.js 15 (App Router) | SSR + API routes in one codebase; native Vercel support | $0 (OSS) |
| Language | TypeScript | Type safety end-to-end; tooling support | $0 (OSS) |
| Hosting | Vercel | Existing free tier; zero-config Next.js; serverless scaling | $0 free / $20 Pro |
| Database | Neon Postgres | Existing free tier; serverless Postgres; auto-scales | $0 free / $19 Pro |
| ORM | Prisma 5+ or Drizzle ORM | Type-safe DB access; migration tooling | $0 (OSS) |
| Object Storage | Cloudflare R2 | Photos and PDFs; no egress fees; cheap per-GB | ~$1.50/100GB |
| Auth | Auth.js v5 (NextAuth) | Open-source; supports credentials + future SSO | $0 (OSS) |
| Email | Resend | Existing free tier; developer-friendly; transactional | $0 free / $20 Pro |
| UI Components | shadcn/ui + Tailwind CSS | Headless, accessible, customizable; works with Claude Code | $0 (OSS) |
| PWA / Offline | Workbox + IndexedDB (idb) | Service worker for offline; queued submissions | $0 (OSS) |
| Background Jobs | Vercel Cron + Inngest | Recurring checklist generation; async PDF export | $0 free |
| PDF Generation | @react-pdf/renderer | Generate Connecteam-style PDFs from instance data | $0 (OSS) |
| Monitoring | Vercel Analytics + Sentry free | Error tracking and performance monitoring | $0 free |
| Domain | Subdomain of stayable.com or rentstayable.com | Internal facing; SSL automatic via Vercel | $0 (owned) |

**Total monthly cost at production scale: approximately $40–$50/month**

Composition: Neon Pro ($19) + Cloudflare R2 (~$5) + Resend Pro ($20 only if email volume exceeds 3,000/mo) + Vercel Pro optional ($20 if needed for team features). Sentry, Vercel Analytics, and Inngest are projected to remain on free tiers.

---

## 2. System Architecture

### 2.1 Component Diagram (Logical)

The platform is a single deployable Next.js application that consumes external services. There is no separate backend service in v1.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT DEVICES                            │
│   Mobile browsers (iOS Safari / Android Chrome) — PWA install   │
│   Desktop browsers (Chrome / Edge / Safari)                      │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  VERCEL (Edge + Serverless)                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Next.js Pages   │  │  API Routes      │  │  Cron Jobs    │ │
│  │  (RSC + Client)  │  │  (REST/Actions)  │  │  (5am daily)  │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘ │
└───────────┼─────────────────────┼─────────────────────┼─────────┘
            │                     │                     │
    ┌───────┴──┐         ┌────────┴───────┐    ┌────────┴────────┐
    │ Auth.js  │         │  Prisma ORM    │    │ Inngest Workers │
    └───────┬──┘         └────────┬───────┘    └────────┬────────┘
            │                     │                     │
            ▼                     ▼                     ▼
    ┌───────────────────────────────────────────────────────────┐
    │              NEON POSTGRES (single primary)                │
    │   users, properties, templates, instances, responses,      │
    │   photos (metadata only), issues, audit_log, ...           │
    └───────────────────────────────────────────────────────────┘

    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │ Cloudflare   │    │   Resend     │    │ Sentry       │
    │ R2 (photos,  │    │ (transac.    │    │ (errors)     │
    │  PDFs)       │    │  email)      │    │              │
    └──────────────┘    └──────────────┘    └──────────────┘
```

### 2.2 Data Flow Examples

#### 2.2.1 Field Staff Submits a Checklist

1. Field user opens PWA on phone, taps assigned checklist
2. Client fetches instance + template + questions from Next.js API
3. User fills responses; photos captured via `getUserMedia` or `input[type=file capture=environment]`
4. Each photo is compressed client-side (canvas resize) before upload
5. On submit, client uploads photos directly to R2 via presigned URLs (1 round trip per photo)
6. Client then POSTs response payload (with R2 object keys, EXIF, GPS) to `/api/instances/{id}/submit`
7. Server validates, persists Response + Photo records, runs geofence check, updates instance status to 'submitted'
8. Server enqueues notification to Property Manager via Inngest
9. Inngest worker sends email via Resend; in-app notification record created

#### 2.2.2 Recurring Checklist Generation (5am ET daily)

1. Vercel Cron triggers `/api/cron/generate-checklists` at 5:00 AM ET
2. Cron handler iterates all active recurring rules
3. For each rule, calculates next occurrence date based on rule pattern
4. If next occurrence is today, creates ChecklistInstance records (one per room if room-scoped, one per property if property-scoped)
5. Assigns based on rule's assignment strategy: specific user, role (any on shift), or unassigned
6. Sends in-app + email notifications to assignees
7. Returns summary: instances created, notifications sent, errors

#### 2.2.3 PDF Export (Async)

1. User clicks "Export PDF" on instance detail page (or bulk on a list)
2. Server creates PdfJob record, enqueues Inngest job
3. Worker fetches instance + responses + photos from R2
4. Renders PDF via `@react-pdf/renderer`
5. Uploads result PDF to R2 with 7-day-expiring presigned URL
6. Updates PdfJob status; sends email to requester with download link

---

## 3. Authentication and Authorization

### 3.1 Authentication

v1 uses email + password authentication via Auth.js Credentials provider. All users (field staff, managers, corporate, admin) authenticate the same way.

- **Email + password** — Primary login. Passwords stored as bcrypt hashes.
- **Password reset** — Email-based reset link via Resend, 1-hour token TTL.
- **Admin-initiated reset** — Admin can trigger a password reset for any user from the admin interface (one-click action).
- **MFA** — Optional for field staff (off by default), strongly recommended on for managers/corporate (on by default at provisioning, can be opted out). TOTP via authenticator app (no SMS to avoid cost).
- **Session** — JWT-based session, 30-day rolling expiry, refreshes on activity.
- **Account lockout** — 5 failed attempts in 15 minutes locks account for 30 minutes. Admin can manually unlock.

Future expansion: Microsoft 365 SSO can be added as an additional provider for managers/corporate without disruption to field staff login.

### 3.2 Authorization Model

Role-based access control (RBAC) with property scoping. Each user has:

- A single role: HK, PA, MT, MANAGER, CORPORATE, or ADMIN
- Zero or more property assignments (which properties the user can access)
- Corporate and Admin users implicitly have access to all properties

Authorization is enforced at the API layer using middleware. Each route declares required role + property access. Example:

```ts
// /api/instances/[id]/review
requireAuth({ role: ['MANAGER', 'CORPORATE'], propertyAccess: 'instance.property_id' })
```

### 3.3 User Provisioning

- Admin creates user via interface: enter name, email, role, property assignments
- System generates a one-time activation link valid for 7 days
- System sends activation email via Resend
- User clicks link → sets password → logs in
- If activation link expires, admin can resend

### 3.4 Deactivation

Admin can deactivate a user (sets `active=false`, revokes all sessions). Deactivated users cannot log in. Their historical data and assignments remain intact. There is no hard delete in v1.

---

## 4. Database Schema

Logical schema for Postgres. Field naming follows `snake_case` convention. All tables include `id` (UUID), `created_at`, `updated_at`.

### 4.1 Core Tables

#### users
```
id              uuid pk
email           text unique not null
password_hash   text not null
name            text not null
role            enum('HK','PA','MT','MANAGER','CORPORATE','ADMIN')
active          boolean default true
mfa_enabled     boolean default false
mfa_secret      text nullable
last_login_at   timestamp nullable
phone           text nullable
created_at, updated_at
```

#### user_properties (many-to-many)
```
user_id         uuid fk → users
property_id     uuid fk → properties
primary key (user_id, property_id)
```

#### properties
```
id              uuid pk
property_id     text unique (e.g., '6802', '4645')
name            text
short_code      text — 2-letter, e.g., 'JW' (see ADR-011)
address         text
geofence        polygon (PostGIS) or jsonb (GeoJSON)
active          boolean default true
```

#### rooms
```
id              uuid pk
property_id     uuid fk → properties
room_number     text
status          enum('OCCUPIED','VACANT','OOO')
unique (property_id, room_number)
```

#### checklist_templates
```
id              uuid pk
name            text
version         int default 1
default_role    enum(role)
scope           enum('PER_ROOM','PER_PROPERTY','AD_HOC')
review_level    enum('NONE','MANAGER','CORPORATE')
active          boolean default true
```

#### questions
```
id              uuid pk
template_id     uuid fk → checklist_templates
order_index     int
type            enum('SINGLE','MULTI','YESNO','PASSFAIL','NUMBER',
                     'SHORT_TEXT','LONG_TEXT','PHOTO','SIGNATURE',
                     'DATE','SECTION_DIVIDER')
prompt          text
required        boolean default true
options         jsonb (for SINGLE / MULTI)
photo_min       int nullable
photo_max       int nullable
fail_flags_issue boolean default false  (for PASSFAIL)
conditional     jsonb nullable  ({show_if: {question_id, value}})
```

#### recurring_rules
```
id              uuid pk
template_id     uuid fk
property_id     uuid fk
pattern         jsonb (cron-like)
assignment      jsonb ({type: 'user|role|unassigned', target: ...})
active          boolean default true
```

#### checklist_instances
```
id              uuid pk
template_id     uuid fk
property_id     uuid fk
room_id         uuid fk nullable
scheduled_for   date
due_at          timestamp
assigned_user_id uuid fk nullable
status          enum('SCHEDULED','ASSIGNED','IN_PROGRESS',
                     'SUBMITTED','REVIEWED','FLAGGED',
                     'INVALIDATED','EXPIRED')
invalidation_reason text nullable
reassigned_to_instance_id uuid fk nullable (self ref)
opened_at, submitted_at, reviewed_at, reviewed_by_user_id
bonus_eligible  boolean default true
```

#### responses
```
id              uuid pk
instance_id     uuid fk → checklist_instances
question_id     uuid fk → questions
answer          jsonb (shape depends on question type)
notes           text nullable
responded_at    timestamp
```

#### photos
```
id              uuid pk
response_id     uuid fk → responses
r2_key          text (object storage key)
file_size_bytes int
exif_timestamp  timestamp nullable
gps_lat         decimal nullable
gps_lng         decimal nullable
geofence_status enum('VERIFIED','OFF_PROPERTY','NO_GPS')
created_at
```

#### issues
```
id              uuid pk
property_id     uuid fk
room_id         uuid fk nullable
source_instance_id uuid fk nullable
source_question_id uuid fk nullable
title           text
description     text
status          enum('OPEN','ASSIGNED','IN_PROGRESS',
                     'RESOLVED','WONT_FIX')
priority        enum('LOW','MEDIUM','HIGH','URGENT')
assigned_user_id uuid fk nullable
sla_target_at   timestamp
resolved_at     timestamp nullable
resolution_note text nullable
```

#### audit_log
```
id              uuid pk
actor_user_id   uuid fk
entity_type     text (e.g., 'checklist_instance', 'issue')
entity_id       uuid
action          text (e.g., 'status_change', 'assign', 'invalidate')
before          jsonb nullable
after           jsonb nullable
created_at      timestamp
```

### 4.2 Indexes

Indexes are added on all foreign keys plus the following query-heavy columns:

- `checklist_instances`: `(property_id, scheduled_for)`, `(assigned_user_id, status)`, `(status, due_at)`
- `responses`: `(instance_id)`
- `photos`: `(response_id)`, `(geofence_status)` — partial index
- `issues`: `(property_id, status)`, `(assigned_user_id, status)`, `(sla_target_at)` — for SLA cron
- `audit_log`: `(entity_type, entity_id)`, `(actor_user_id, created_at)`

---

## 5. PWA and Offline Strategy

### 5.1 PWA Setup

- Web App Manifest with name, icons (192/512/maskable), theme color, display: standalone
- Service Worker registered via Workbox
- Install prompt shown to user after 2 sessions if not already installed
- Custom install instruction screen for iOS Safari (shows "tap Share, Add to Home Screen" with screenshots)

### 5.2 Offline Capabilities

- App shell (HTML/CSS/JS) cached via service worker; loads with no network
- Today's assigned checklists prefetched and cached on login
- Photos captured offline stored in IndexedDB as Blob
- Draft responses saved to IndexedDB on every change
- Submissions queued via Workbox Background Sync API when offline
- On reconnect, queued submissions auto-upload
- Clear status indicator at top of app: "Online" / "Offline — N items queued"

### 5.3 Known Limitations (iOS)

- iOS Safari PWAs have ~50MB storage soft limit; large photo backlogs may evict
- Background Sync API limited on iOS; relies on app being reopened
- Push notifications require iOS 16.4+ and PWA installed to home screen
- File input GPS metadata stripped on some iOS versions — capture geolocation separately via geolocation API at photo time

Mitigation: with 2Gbps fiber + AP buildout across all properties, true offline use is an edge case (stairwells, between buildings). The platform is designed to gracefully handle short offline windows, not multi-day offline use.

---

## 6. Geofence Verification

Each property has a polygon defined as GeoJSON in the `properties.geofence` column. Configuration UI in Admin lets you draw the polygon on a Mapbox or Leaflet map.

### 6.1 Verification Logic

1. Photo capture triggers a separate `navigator.geolocation.getCurrentPosition()` call to capture coordinates (independent of EXIF, which iOS strips)
2. Coordinates stored with photo upload
3. Server-side: on photo upload, check if `(lat, lng)` is inside `property.geofence` polygon using PostGIS `ST_Contains` or in-app point-in-polygon
4. Status stored in `photos.geofence_status`: `VERIFIED`, `OFF_PROPERTY`, or `NO_GPS`

### 6.2 UX Notes

- First-time users are prompted to allow location access with a clear explanation
- If location is denied, photos can still be submitted but show "No Location" badge
- Off-property warning shown to user immediately after photo capture (allowing retake)
- Buffer of 50 meters added to geofence to accommodate GPS drift

---

## 7. Notifications

### 7.1 In-App Notifications

- Stored in `notification_log` table
- Bell icon in app header shows unread count
- Notification center lists last 50 notifications
- Real-time updates via Server-Sent Events or polling (v1 starts with 60-second polling)

### 7.2 Email Notifications

- Sent via Resend API
- Templates stored in `/emails` directory using react-email
- Each user has notification preferences (per event type, on/off)
- Daily digest mode available: "send me a single email at 7am with all yesterday's events"

### 7.3 Push Notifications (Future / v1.5)

Web Push API for Android and iOS 16.4+. Requires user permission. Not in v1 scope but database schema and notification dispatch layer are designed to support it without refactoring.

---

## 8. Deployment and Environments

### 8.1 Environments

| Env | Domain | DB | Purpose |
|---|---|---|---|
| Local | `localhost:3000` | Local Postgres (Docker) | Developer workstations |
| Preview | auto-generated per PR | Neon preview branches | PR review |
| Staging | `staging-ops.stayable.com` | Neon staging DB | Pre-production validation |
| Production | `ops.stayable.com` (TBD) | Neon production DB | Live |

### 8.2 Deployment Process

1. Git push to feature branch → Vercel Preview deployment auto-generated
2. PR merged to main → Vercel Production deployment
3. Database migrations run via Prisma Migrate or Drizzle Kit; manually triggered post-deploy via Vercel CLI or admin route
4. Rollback: revert commit + redeploy; for DB rollback, use Neon point-in-time recovery

### 8.3 Secrets Management

- All secrets in Vercel environment variables (encrypted at rest)
- Separate variables per environment (Local, Preview, Staging, Production)
- Required: `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `INNGEST_SIGNING_KEY`
- Local `.env.local` file (gitignored) for development

---

## 9. Security

### 9.1 Application Security

- HTTPS enforced (Vercel automatic)
- Content Security Policy (CSP) headers set via `next.config.js`
- Rate limiting on auth endpoints via `@upstash/ratelimit` (free tier)
- All inputs validated via Zod schemas at API boundaries
- SQL injection prevented by ORM (parameterized queries)
- XSS prevented by React's default escaping; no `dangerouslySetInnerHTML`
- CSRF protection via Auth.js built-in tokens

### 9.2 Data Security

- Passwords hashed with bcrypt (cost factor 12)
- Database connection over SSL
- R2 buckets private; access via presigned URLs only (15-min expiry for upload, 1-hour for download)
- PII (email, name, phone) treated as protected; no logging of PII
- Audit log records all sensitive actions

### 9.3 Backup and Recovery

- Neon Pro: 7-day point-in-time recovery included
- Daily logical backup to R2 via `pg_dump` (Vercel Cron job)
- R2: versioned bucket, 30-day retention on deleted objects
- Recovery test performed monthly

---

## 10. Smartsheet Sync — Not in v1

Per scope decision, the new platform does not write to Smartsheet during transition. Smartsheet sheets become a read-only historical archive on cutover date. The Smartsheet workspace remains accessible to staff for looking up pre-cutover data.

This decision simplifies the build by ~1 week and avoids dual-write reconciliation complexity. If Smartsheet sync becomes necessary later, it can be added as a one-way push job.

---

## 11. Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| iOS PWA limitations (storage, push, background sync) | Field staff on iPhone may have degraded UX vs. native app | Test on real iPhones in Week 1. If unacceptable, wrap in Capacitor in v1.5 |
| Password reset burden on admins | 2–5 reset requests per week consuming admin time | Build one-click admin reset; self-service via email reset |
| Photo storage growth | R2 bucket grows ~3.6GB/year, manageable for years 1–3 | Cold-storage archive job at year 3 to lower tier |
| Geolocation denied by users | Geofence verification falls back to NO_GPS | Manager training: NO_GPS is acceptable, not a failure |
| Single developer / bus factor | If primary developer is unavailable, no one can fix issues | Document architecture and runbooks; pair Kate + Christopher on key decisions |
| Vercel/Neon free tier limits hit unexpectedly | Service throttling or downtime | Monitor via Vercel dashboard weekly; upgrade to Pro pre-emptively |
| Resend deliverability issues | Notifications not arriving, missed assignments | Use authenticated sending domain (SPF/DKIM/DMARC); monitor bounces |

---

*End of Technical Architecture*
