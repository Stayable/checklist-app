# Prod steps — template library (2026-08-31 ET)

Run in this order. Steps 1–3 are prod writes; I did not run any of them.

## 1. See what is pending (read-only, safe)
```
pnpm dotenv -e .env.production.local -- npx prisma migrate status
```
Expect TWO pending, in this order:
- `20260831130000_add_template_multiplicity`
- `20260831140000_add_checklist_batch_drafts`
- `20260831150000_add_template_published_at`
- `20260901120000_add_question_hint`
⚠ If `20260813120000_add_contractor_update_fanout` is also listed as pending, STOP
and tell me — step 2 would apply it too, and it is not part of this work.

## 2. Apply the migration — BEFORE any deploy
```
pnpm dotenv -e .env.production.local -- npx prisma migrate deploy
```
Additive only: one enum, one defaulted column, one nullable column, and one new
table. Nothing is dropped and no column changes type, so the code currently
running in production keeps working after it.

## 3. Seed the 28 templates
```
pnpm dotenv -e .env.production.local -- tsx prisma/seed.ts
```
Creates 22 zero-question drafts, renames 6 existing, retires HKR / PAR / MGR.
Idempotent and safe to re-run: `update` never touches `active` except to keep the
three retired ones down, and questions are only written to a template that has
none — so nothing you author in the builder is overwritten by a later run.

## 4. Deploy
Push `main`. That is what makes it live for the testers.

## Rollback
Code only — `vercel promote <previous-url>`. The migration stays; the column has a
default and the other is nullable, so older code ignores both.
