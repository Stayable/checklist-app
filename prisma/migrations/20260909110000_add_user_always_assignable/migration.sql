-- Per-user assignability override.
--
-- ⚠ Directory stamped 20260909 but authored 2026-09-08 ~12:30 PM ET. The
-- harness clock on this machine runs ~12h ahead, and the neighbouring
-- 20260909100000_add_user_remote had already been applied to production under
-- the same wrong stamp — a correct 20260908 name here would sort BEFORE an
-- applied migration. Kept consistent with its neighbour deliberately; renaming
-- an applied migration manufactures drift (CLAUDE.md).
--
-- Why: `isOnSiteAssignable` limits the batch-create "Assign to" pool to field
-- staff and on-site Property Managers, so Kyle's CORPORATE account cannot be
-- given a checklist — and he needs to assign himself one to walk the app end
-- to end. Widening the rule to CORPORATE would put all six corporate users in
-- every property's list and undo the decision made an hour earlier.
--
-- So: an explicit per-row override rather than a category change. It is
-- expected to be true on exactly ONE row. If it ever needs to be true for a
-- group, that group is a missing role — widen the predicate instead of ticking
-- rows, or this becomes a second, invisible permission system.
--
-- Membership in user_properties is a SEPARATE requirement the pool query also
-- imposes; scripts/set-test-assignee.ts attaches the row to all 8 properties.

ALTER TABLE "users"
  ADD COLUMN "always_assignable" BOOLEAN NOT NULL DEFAULT false;
