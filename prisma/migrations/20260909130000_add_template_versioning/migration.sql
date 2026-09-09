-- ADR-036: template question-set versioning.
--
-- Editing a template's questions used to be impossible once any checklist had
-- been created from it: `updateTemplate` replaced the question rows with
-- DELETE + INSERT, and `responses_question_id_fkey` is ON DELETE RESTRICT, so
-- the delete would throw the moment a response existed. The guard that blocked
-- the edit was a crash shim, not a policy, and it froze 4 live templates.
--
-- Instead of deleting, an edit now bumps `checklist_templates.version` and
-- INSERTs a fresh question set at the new number. Nothing is ever deleted, so
-- RESTRICT never fires and an already-created checklist keeps rendering the
-- exact questions it was filled against.
--
-- Additive and backward compatible: every existing row defaults to version 1,
-- which is what `checklist_templates.version` already held (the column has
-- existed since Phase 2 and was never read or written).

ALTER TABLE "questions"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "checklist_instances"
  ADD COLUMN "template_version" INTEGER NOT NULL DEFAULT 1;

-- Every instance-scoped question read is keyed (template_id, version).
CREATE INDEX "questions_template_id_version_idx"
  ON "questions"("template_id", "version");
