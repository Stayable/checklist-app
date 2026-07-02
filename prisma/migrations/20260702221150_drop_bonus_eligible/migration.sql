-- Drop dead column: bonus logic was scrapped from v1 (ADR-014). No code reads it.
-- Part of the StayCheck v1.1 S0 foundation work (spec 2026-07-02, item 10).
ALTER TABLE "checklist_instances" DROP COLUMN "bonus_eligible";
