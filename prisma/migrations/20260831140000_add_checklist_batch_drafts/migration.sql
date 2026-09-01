-- Save as Draft for the batch-create wizard (W4, D9).
--
-- Date stamp is 2026-08-31 Eastern, derived, NOT read off the harness clock —
-- the harness reported 2026-09-01 while ET was still Aug 31 11:56 PM. Eastern
-- is the operating clock for every date in this repo (ADR-013).
--
-- WHY THIS EXISTS. A manager composing a multi-batch create ("all of Building A
-- tomorrow, plus the three PM PA checklists") loses the whole composition if the
-- tab closes, and the wizard is the only place that work can be expressed. A
-- draft is somewhere to put it that costs nothing to abandon.
--
-- WHY A NEW TABLE AND NOT A ChecklistInstance STATUS. This is the whole point of
-- D9. A draft is the DEFINITION of work someone is still composing; it is not
-- work. Represented as instances in a PENDING state it would appear in the field
-- staff's home list, in /review's tabs, in the dashboard's in-flight tiles and
-- in both report denominators — because a new InstanceStatus member is silently
-- EXCLUDED by `status: { in: [...] }` filters and silently INCLUDED by `notIn`,
-- so all of those surfaces would change meaning with a clean typecheck and a
-- green build. That hazard is pinned by a test and already written down in
-- migration 20260822120000, which is why the close-out/stayover work added no
-- status either. ZERO checklist_instances rows exist until the user presses
-- Create; a draft that is never opened again has cost the estate nothing.
--
-- WHY `batches` IS JSONB AND NOT NORMALISED ROWS. The wizard's input shape
-- (BatchInput in lib/batch-create.ts) is still moving — per-batch due time is
-- specified but not built — and a draft is a convenience, not a record. A
-- child table would have to migrate every time the wizard grows a field, for
-- data nobody audits. The price is that the column is UNTRUSTED ON READ: a row
-- written by an older wizard need not parse against today's shape. Every read
-- path validates it with Zod (lib/batch-draft.ts) and reports a stale draft
-- rather than throwing, so a shape change degrades to one unusable draft
-- instead of a 500 on the list page.
--
-- WHY BOTH FOREIGN KEYS CASCADE. A draft is private to its author and scoped to
-- one property; it is meaningless without either. Deactivating a user does not
-- delete them, so this only fires on a real row deletion.
--
-- Additive only: one new table, two new indexes, two new foreign keys. Nothing
-- existing is dropped and no column changes type, so code deployed before this
-- migration keeps working and code deployed after it reads sane values.
-- APPLY THIS TO THE DATABASE BEFORE DEPLOYING THE CODE THAT READS IT.
--
-- Rollback is asymmetric on purpose: `vercel promote` reverts the code, this
-- table stays. Nothing else references it, so older code simply ignores it.

-- CreateTable
CREATE TABLE "checklist_batch_drafts" (
    "id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    -- Optional label ("Tomorrow's HK"). NULL means the UI shows a derived one,
    -- so a draft is never nameless and saving never demands a decision first.
    "name" TEXT,
    -- BatchInput[]: [{ templateId, roomIds[], assigneeIds[], taskLabels[],
    -- dates[], assignedUserId }]. Validated on read, never trusted.
    "batches" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_batch_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checklist_batch_drafts_created_by_user_id_idx" ON "checklist_batch_drafts"("created_by_user_id");

-- CreateIndex: the list query is one author's drafts at one property, newest
-- first. There is deliberately NO index on property_id alone — no query reads
-- another person's drafts, and an index shaped for one would invite writing it.
CREATE INDEX "checklist_batch_drafts_created_by_user_id_property_id_updat_idx" ON "checklist_batch_drafts"("created_by_user_id", "property_id", "updated_at");

-- AddForeignKey
ALTER TABLE "checklist_batch_drafts" ADD CONSTRAINT "checklist_batch_drafts_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_batch_drafts" ADD CONSTRAINT "checklist_batch_drafts_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
