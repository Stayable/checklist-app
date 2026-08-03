# Archived — Tracks C, D and E (2026-08-03)

**Why this exists.** On 2026-08-03 Kyle narrowed the RISE8 Operations Platform to
**two tracks: A (Checklist / StayCheck) and B (Network Monitoring & IT
Ticketing)**. Maintenance/Ticketing (C), Contractor Dispatch + WhatsApp (D) and
Construction (E) are **out of scope for this codebase** — they are being
replaced by a separate system Kyle is building. Recorded as **ADR-028**.

This directory is **reference material, not a backlog.** Nothing in it is
scheduled. Do not restart work from these documents; if any of it returns, it
returns through a fresh decision.

---

## What was archived

### Documents (here)

| Path | Track | What it is |
|---|---|---|
| `component-ii/MAINTENANCE_DESK_SPEC.md` | C | MS Graph email desk → Claude triage → tickets. Replaced Zoho Desk. ⚠ Names a model id that never existed (`claude-sonnet-4-6`) |
| `component-ii/MaintenanceTicketingDesignReview_RISE8_070726.md` | C | Kate's Part-1 reconciliation of the ticketing design |
| `component-ii/MaintenanceTicketingScopingQuestions_RISE8_070726.md` | C | §A–§M scoping + the Top-8 blockers, never answered |
| `component-ii/TicketingBriefDispatch_RISE8_070826.md` | D | Contractor-scheduling brief for Gerardo & Jesús. Re-scoped 2026-07-08, **never sent** |
| `component-ii/ProjectBrief_MaintenanceDispatch_062226.docx` | C/D | Crystal's original maintenance/dispatch brief |
| `component-ii/WhatsAppAutomationSpec_RISE8_072826.md` | D | Twilio/Meta WhatsApp rail: wa.me vs Cloud API, 4 UTILITY templates, 24-hour window, schema delta |
| `component-ii/MetaBusinessPortfolioSetup_RISE8_072926.md` | D | Meta Business Portfolio + sender registration walkthrough |
| `component-ii/IngestionEngineSketch_RISE8_070726.png` | C | Hand sketch of the intake engine |
| `component-iii/ConstructionAgentBrief_RISE8_062026.md` | E | Construction progress / scheduling brief. Never got a go/no-go |
| `superpowers/2026-07-23-t2-contractor-job-design.md` | D | Design spec for the contractor job record (built, now dropped) |
| `TracksCDE_Tracker_RISE8_080326.md` | C/D/E | The tracker sections for C, D and E, lifted verbatim out of `TODO.md` — including every open §Q that belonged to them |

### Code that was deleted (recoverable from git)

Removed in `94ce338` on branch `chore/narrow-scope-to-checklist-network`. The
last commit where it all still exists is **`6d7b2ae`**:

```
git show 6d7b2ae:app/contractors/page.tsx      # etc.
git diff 6d7b2ae 94ce338                        # the whole excision
```

| What | Where it was |
|---|---|
| Contractor directory (CRUD, property-scoped, audited) | `app/contractors/` |
| Dispatch queue + create + detail, one-tap `wa.me` / `tel:` | `app/dispatch/` |
| Public no-account signed job link (72h HMAC) | `app/j/[token]/`, `lib/job-link.ts` |
| Eligibility + ranking (`canAssignContractor`, `rankContractorsForJob`) | `lib/contractor-jobs.ts` |
| Bilingual dispatch message builder | `lib/dispatch-message.ts` |
| Trade labels / ordering | `lib/contractors.ts` |
| `contractorJob` presign scope, `contractorJobPhotoKey` | `app/api/photos/presign/route.ts`, `lib/r2.ts` |
| 4-contractor seed roster (placeholder numbers) | `prisma/seed.ts` |

**Database.** `contractors`, `contractor_properties`, `contractor_jobs`, the
`Trade` and `JobStatus` enums, and `Photo.contractorJobId` are dropped by
`prisma/migrations/20260803120000_drop_contractor_dispatch/`. All three tables
were **verified empty in production** first (2026-08-03, `ep-summer-cloud`), so
no data was lost. `Photo` returns to exactly-one-of(response, issue) per ADR-016.

The roster Kyle confirmed 2026-07-08 was **never entered** — it only ever
existed as seed code with placeholder numbers: Orlando Torres (plumbing,
contracted / direct hire), Arlis Velázquez (plumbing), Jesús Pérez (electrical,
also the contractor scheduler), Cristina de León (electrical).

### The parked consent / invite rail — still on a branch, never merged

Track D8 (Twilio A2P 10DLC messaging consent) was built but never merged and
never applied to any database. It lives on **`claude/rise8-operations-platform-rv9B6`**,
commits **`7ab342d`…`509be11`**, with migration `20260730120000_add_invites_and_consent`.
Leaving that branch unmerged **is** the archive — there is nothing to revert.

It contains: `InviteToken` + append-only `ConsentRecord`, `lib/consent-copy.ts`
(EN/ES, `POLICY_VERSION 2026-07-29.1`), `lib/consent.ts hasLiveConsent`,
`/invite/[token]`, `/legal/messaging`, `/legal/opt-in` (a screenshotable proof
replica for Twilio review, **never opened in a browser**), admin invite actions,
plus `docs/component-ii/PrivacyPolicyMessagingAmendment_RISE8_073026.md` and
`docs/SubsystemIsolationMap_RISE8_073026.md`.

⚠ **One part of that branch must NOT be discarded if it is ever reconciled:**
`InviteKind.ACCOUNT` is **staff account activation**, wired into
`app/admin/users/actions.ts`. It is Track A functionality that happens to live in
the consent rail. See the isolation map on that branch.

---

## Decisions worth not re-litigating

Kept here so archiving doesn't lose them:

- Contractors use **WhatsApp only** — no SMS. Phone is the emergency first touch
  to the one contracted plumber.
- **No contractor accounts.** Access was by signed link.
- Dispatchers reused the **`MANAGER`** role — no new role was created.
- `onCall` **ranked but never excluded** a contractor: a hard availability filter
  could leave a property with nobody eligible mid-emergency.
- The signed job link was deliberately **reusable, not single-use** — read-only,
  and a contractor re-opening it while standing in the room is normal.
- Track C intake reality: tenant requests arrive via **TurboTenant + Jotform**,
  consolidated in Smartsheet. Property managers own triage. The `admin@` /
  `blake@` email desk was an *additional* lane, not the whole intake.

## Questions that died unanswered

Owners were never going to be chased for these once scope narrowed:

- **Q6** (Crystal) — Track C ops reality + the Top-8 technical blockers
- **Q15** (Crystal) — who receives the PM-facing intake brief
- **Q16** (Kyle) — is contractor scheduling separable from the internal daily schedule
- **Q17** (Crystal) — WhatsApp Business API cost + Meta verification timeline
- **Q18** (Crystal) — Construction ops input, for a go/no-go that never happened
- **Q23** (Gerardo) — who classifies an issue as an emergency, and how
- **Q27** (Kyle) — does the live Twilio A2P submission match the built form (it did not:
  the spec table said "submit blocked until ticked", the shipped form never blocked)
