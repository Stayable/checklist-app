-- Template publish state (W2 amendment, 2026-08-31 ET).
--
-- Kyle's flow: templates are filled in (by extraction from the Connecteam PDF
-- archive, or by hand), then a Property Manager REVIEWS the result and
-- publishes it themselves. Filling a template must therefore NOT publish it.
--
-- `active` alone cannot express that. A filled-but-unreviewed draft and a
-- retired template are both active:false with questions attached, so the
-- Templates page could not tell which rows deserve a Publish button and which
-- are history. An earlier fix auto-activated a template as soon as it gained
-- its first question, which resolved the ambiguity in the wrong direction --
-- it publishes without review, which is exactly what this flow forbids.
--
--   published_at NULL                 -> draft (empty if 0 questions, else filled)
--   published_at SET + active TRUE    -> published, in use
--   published_at SET + active FALSE   -> retired
--
-- Backfill: every template that is currently active has, by definition, been
-- published, so it takes created_at as its publish time. This is a reasonable
-- approximation, not a record -- the real publish moment was not stored. The
-- three retired templates (HKR / PAR / MGR) are also stamped, because they were
-- genuinely in use before being retired and must read as retired, not as drafts.
-- Only the never-touched seeded drafts stay NULL, which is correct for them.
--
-- Additive: one nullable column. Nothing is dropped, no column changes type, so
-- code deployed before this migration keeps working.
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT.

-- AlterTable
ALTER TABLE "checklist_templates" ADD COLUMN "published_at" TIMESTAMPTZ;

-- Backfill anything that has ever been in use: active templates, plus retired
-- ones (inactive but carrying questions, which is what "was once live" looks
-- like). A never-filled seeded draft has no questions and stays NULL.
UPDATE "checklist_templates" t
SET "published_at" = t."created_at"
WHERE t."active" = TRUE
   OR EXISTS (SELECT 1 FROM "questions" q WHERE q."template_id" = t."id");
