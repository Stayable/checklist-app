-- Template multiplicity — the SECOND scope axis (W1, ADR-034 owed).
--
-- Date stamp is 2026-08-31 Eastern, derived, NOT read off the harness clock —
-- the harness reported 2026-09-01 while ET was still Aug 31 12:52 PM. Eastern
-- is the operating clock for every date in this repo (ADR-013).
--
-- WHY THIS EXISTS. TemplateScope answers "what is this checklist ABOUT" (a room,
-- the property). It cannot express "how many copies of it exist per day", which
-- is what the real Connecteam templates need: "812 PM PA Checklist — per PA on
-- shift" is one instance per person, "Maintenance Checklist — per task" is one
-- per task, "Roof PM" is exactly one. All three are PER_PROPERTY.
--
-- WHY A SECOND FIELD AND NOT MORE TemplateScope MEMBERS. PER_PA and PER_PM would
-- be identical behaviour with a different role, so every new role would need
-- another enum member — and every `scope === ...` branch in the codebase would
-- have to learn it. Worse, a new TemplateScope member is silently EXCLUDED by
-- `{ in: [...] }` filters and silently INCLUDED by `notIn`, exactly the hazard
-- recorded for InstanceStatus in the 20260822120000 migration. A separate
-- nullable-free column with a default touches no existing filter.
--
-- Additive only: one new enum, one column with a DEFAULT, one nullable column.
-- Nothing is dropped and no column changes type, so code deployed before this
-- migration keeps working and code deployed after it reads sane values.
-- APPLY THIS TO THE DATABASE BEFORE DEPLOYING THE CODE THAT READS IT.
--
-- Rollback is asymmetric on purpose: `vercel promote` reverts the code, this
-- migration stays. `copies` has a DEFAULT and `task_label` is nullable, so
-- older code simply ignores both.

-- CreateEnum
CREATE TYPE "InstanceMultiplicity" AS ENUM ('ONE', 'PER_ASSIGNEE', 'PER_TASK');

-- AlterTable: every existing template is one-per-subject, which is what all 9
-- seeded templates already do, so the default backfills them correctly.
ALTER TABLE "checklist_templates"
  ADD COLUMN "copies" "InstanceMultiplicity" NOT NULL DEFAULT 'ONE';

-- AlterTable: scope token for a PER_TASK instance ("Pool gate"). Nullable
-- because only PER_TASK instances have one. Deliberately its own column rather
-- than parsed back out of `title`, which is a composed display string.
ALTER TABLE "checklist_instances"
  ADD COLUMN "task_label" TEXT;
