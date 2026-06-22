# Design — Unified Shell, Auth/OTP, and Checklist Authoring Epic

**Date:** 2026-06-22
**Owner:** Kate
**Status:** Draft for review
**Relates to:** ADR-009 (recurrence), ADR-010 (branding), ADR-011 (review UI), ADR-013 (platform foundations), ADR-017 (Connecteam-familiar UI). Introduces new ADRs (see §9).

This spec covers a layout redesign plus a feature epic requested 2026-06-22. Several
requested items already exist in the data model or are built-but-unmerged; this spec
distinguishes new work from polish.

---

## 1. Goals

1. **Unified responsive shell** — one navigation/layout system across all authed pages: a navy left sidebar on desktop, the existing bottom tab bar on mobile. Replaces today's two disjoint systems (manager bottom bar + admin's own top header) and the inconsistent page widths.
2. **Checklist authoring** — let admins build checklist templates (field types, title, assignee), create checklists manually (immediate) or via the existing recurring rules (5 AM ET cron), browse completed checklists, and resume in-progress ones.
3. **Auth hardening** — password + email OTP for all users, with a 30-day trusted-device window, delivered via the existing Resend account.

Non-goals: changing the recurrence cron model (stays 5 AM ET global, ADR-009); cross-device resume; per-property template permissions (admin-only for now).

---

## 2. Locked decisions (from brainstorming 2026-06-22)

| Topic | Decision |
|---|---|
| Desktop nav | Left sidebar (navy), content area right. Mobile keeps bottom tab bar. |
| Shell mount | Route-aware in root `app/layout.tsx` (Approach A — no route-group file moves). |
| Fill screen | Reparented into shell + given a wide desktop layout. **Layout/CSS only — photo/GPS/submit pipeline untouched.** Done last. |
| Auto-create timing | Keep single global 5 AM ET cron. No per-rule time. (ADR-009 unchanged.) |
| Manual create | Created **immediately** on submit of the create form. No cron. |
| Resume | Same-device only (already works via IndexedDB draft). Add a "mark-opened" step. |
| OTP | Password + email OTP for **all** users; **30-day trusted-device** window skips OTP on a known device. |
| Admin account | `admin@rentstayable.com`, password `StayableAdmin` (rotated from `StayableCheck`). |
| Template perms | Create/edit/delete templates = **ADMIN only**. Revisit other perms later. |
| Template cleanup | **Hard-delete** the 9 placeholders — scripted, row-count-confirmed, run **last**. |

---

## 3. Component 1 — AppShell

**File:** `components/shell/AppShell.tsx` (+ small sub-parts: `Sidebar.tsx`, `PageHeader.tsx`).

**Responsibilities**
- Desktop (`lg+`): fixed left **navy sidebar** (~240px) — Stayable wordmark, role-aware nav links, property picker, online status, sign-out pinned at bottom. Content area to the right, standardized max width + padding, with a consistent `PageHeader` slot (title + optional actions).
- Mobile (`<lg`): sidebar hidden; render the existing bottom tab bar (fold `BottomNav` in) + a compact top header.
- **Route-aware:** renders nothing on `/login`, `/install`, `/ios-spike`, `/photo-test` (reuse the `HIDE_PREFIXES` pattern already in `BottomNav`).

**Nav model (role-aware)** — single source of truth, replaces both `BottomNav.managerTabs()` and the hand-built `app/admin/layout.tsx` header:
- HK / PA / MT: Today (+ My Tasks later)
- MANAGER / CORPORATE: Today, Review, Issues, Rules, Completed
- ADMIN: the above + Admin (Users, Templates, SLA, Properties)

**Visual language preserved** (what Kate liked): navy chrome, white rounded cards (`ring-1 ring-slate-200 shadow-sm`), status pills, progress bar. The navy "header band" becomes the sidebar on desktop / compact header on mobile.

**Width standardization:** content area capped consistently (target `max-w-6xl` for lists/tables, narrower inner constraints for forms). Removes the current spread of `max-w-md / 3xl / 4xl / 5xl / 6xl`.

**Affected files:** `app/layout.tsx` (mount AppShell), delete custom header in `app/admin/layout.tsx`, strip the inline navy header from `app/page.tsx`, and have each page render content only (shell provides chrome). `BottomNav.tsx` folds into the shell's mobile branch.

---

## 4. Component 2 — Auth / OTP

**Decision recap:** password (existing) + email OTP (new) for all users; 30-day trusted-device skip.

**Flow**
1. User submits email + password → validated (existing Credentials provider, bcrypt, lockout).
2. If the request carries a valid **trusted-device** token (signed cookie, ≤30 days old, matching the user) → log in, skip OTP.
3. Otherwise → generate a 6-digit OTP, store hashed with a short TTL (e.g. 10 min), email it via Resend, show the OTP entry screen.
4. Correct OTP → issue session **and** set/refresh the 30-day trusted-device cookie.

**Data**
- `login_otps` table (or reuse a verification-token table): `user_id`, `code_hash`, `expires_at`, `consumed_at`, attempt counter.
- Trusted-device token: signed (HMAC with `AUTH_SECRET`), payload `{userId, deviceId, issuedAt}`, 30-day expiry; stored as an httpOnly cookie. Optional `trusted_devices` table if we want admin visibility/revocation (nice-to-have, not v1-critical).

**Email:** Resend transactional send. **Prerequisite (blocking this component):** `RESEND_API_KEY` + a verified from-address in env. OTP email is bilingual EN/ES for field staff per ADR-013.

**Admin account:** set `admin@rentstayable.com` password to `StayableAdmin`. (Weak/known — acceptable for now per Kate; harden before real staff onboarding.)

**Login page:** existing `/app/login` reskinned into the shell-less auth layout; add the OTP entry step.

**ADR note:** this supersedes the v1 MFA plan (TOTP authenticator) with email OTP + trusted-device. New ADR required.

---

## 5. Component 3 — User management

`/admin/users` already does create / reset-password / deactivate / multi-property assign. Changes:
- Reskin into the shell.
- **Add hard-delete** with guards: cannot delete yourself; warn/handle dependent rows (assigned instances, audit references). Prefer to block delete if the user has authored/owns referenced data, falling back to deactivate, OR reassign-then-delete — resolve exact rule in the plan.
- ADMIN-only (already enforced via `requireAdmin`).

---

## 6. Component 4 — Checklist authoring

### 6a. Template Builder (`/admin/templates`, ADMIN-only)
Turn the read-only template view editable.
- **Template fields:** Title (required), default assignee or role, scope (per-room / per-property / ad-hoc), review level.
- **Questions** (ordered, add/remove/reorder), each with a type mapped to the existing `QuestionType` enum:
  - checkbox (multiple) → `MULTI`
  - radio (one) → `SINGLE`
  - single line → `SHORT_TEXT`
  - multi line → `LONG_TEXT`
  - upload photo (with title) → `PHOTO` (title = the question prompt; `photoMax` configurable)
  - also available: yes/no (`YESNO`), pass/fail (`PASSFAIL`), number (`NUMBER`), date (`DATE`), signature (`SIGNATURE`), section divider (`SECTION_DIVIDER`)
  - per question: **required** toggle.
- **Auto start/complete time are NOT questions** — they're automatic instance metadata: start = `openedAt` (stamped on first open, see §6e), complete = `submittedAt`. Both display in ET on the completed checklist.
- **Template code:** custom templates need a code for the `CL-{prop}-{code}-{YYYYMMDD}-{seq}` system ID (ADR-009). Auto-derive (e.g. first letters of title / sequence) and ensure uniqueness. Resolve algorithm in the plan.

### 6b. Manual create (`/checklists/new`, MANAGER+)
- Pick a template → **edit Title (required, defaults to template name + date)** → choose assignee → property/room as scope requires → **Create now** (immediate instance, status ASSIGNED).
- "Edit the template instead" link → opens the builder pre-filled (fork).
- **Empty state (0 templates):** message + button → "Create a checklist template first" → routes to the builder.

### 6c. Auto-create (recurring rules) — already built
- Exists at `/rules` (Phase 5, on branch). No rebuild. Polish only after Kate reviews it.
- Same **empty state** treatment when 0 templates exist.

### 6d. Completed checklists (`/completed`, MANAGER+)
- Filtered list over instances with status `SUBMITTED` / `REVIEWED`.
- Filters: **property, date (range), assignee.**
- Row links to the existing review detail view.

### 6e. Mark-opened + resume
- **New "mark-opened" action:** first time the assigned user opens a checklist, stamp `openedAt = now` and set status `IN_PROGRESS` (today `openedAt` is only set at submit — start time is effectively fake).
- Same-device resume already works (`lib/draft-store.ts` IndexedDB). Surface it: on Home, in-progress checklists show a "Resume" affordance.

### 6f. Home revamp (`app/page.tsx`)
- Split today's assignments into **To do today** and **Done today**.
- Add a **Recently completed** section below (last N completed, ET-anchored).
- For managers/corp, scope = their own assignments (portfolio rollups stay on dashboards, Phase 6).

---

## 7. Component 5 — Template hard-delete (LAST)

- Runs only after real templates exist (else manual/auto create have nothing to use; empty states cover the gap if Kate wants it earlier).
- Script: count and display affected rows — templates, questions, dependent `checklist_instances`, `responses`, `photos`, `recurring_rules` — **pause for confirmation**, then delete in dependency order inside a transaction.
- Runs against the **shared prod DB** — irreversible. Confirmation gate is mandatory.

---

## 8. Build order

1. **AppShell** (foundation — everything renders inside it).
2. **Auth / OTP + user delete + admin password** (needs `RESEND_API_KEY`).
3. **Template Builder + Manual create** (with empty states).
4. **Completed view + Home revamp + mark-opened/resume.**
5. **Recurring-rules polish** (after Kate reviews `/rules`).
6. **Template hard-delete** (gated on row-count confirmation).

---

## 9. New ADRs to record

- **ADR-018 — Unified responsive AppShell.** Left-sidebar desktop / bottom-bar mobile; single role-aware nav; standardized widths; supersedes the split nav from ADR-017's structural pass.
- **ADR-019 — Email OTP + 30-day trusted device.** Supersedes the TOTP-authenticator MFA plan for v1; password + email OTP for all users via Resend.
- **ADR-020 — Template authoring in v1.** Reverses "template editing out of scope"; admin-only template builder + manual instance creation.

---

## 10. Open items / prerequisites

- **BLOCKING (Component 4 auth):** `RESEND_API_KEY` + verified from-address — not yet in env.
- Template **code** auto-derivation algorithm — finalize in the plan.
- User hard-delete dependency rule (block vs reassign vs cascade) — finalize in the plan.
- Confirm whether managers may *manual-create* from templates (assumed yes) vs ADMIN-only like authoring (authoring is admin-only; instance creation assumed manager+).
- Exact prod row counts for the template delete — captured at delete time.
