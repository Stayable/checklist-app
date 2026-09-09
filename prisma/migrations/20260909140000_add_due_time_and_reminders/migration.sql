-- ADR-037: an optional due time (defaulting to 6 PM ET in the UI) plus the
-- two reminders that fire against it.
--
-- `recurring_rules.due_time` closes a real gap: rules had NO way to express a
-- deadline, so every checklist the 5 AM cron generated carried `due_at = NULL`
-- and could never be overdue, reminded about, or counted as late. The wizard
-- could set a due time; the thing that will actually generate the work could
-- not.
--
-- The two `reminded_*` stamps on an instance are set when a reminder is SENT,
-- which makes them the idempotency guard as well as the audit trail: the cron
-- re-runs every 15 minutes and must never notify twice. Two columns rather
-- than one flag because "an hour before" and "at the deadline" are distinct
-- events and either one can be the one that failed.
--
-- Additive and nullable throughout. NULL keeps today's behaviour exactly:
-- no deadline, therefore no reminders.

ALTER TABLE "recurring_rules"
  ADD COLUMN "due_time" TEXT;

ALTER TABLE "checklist_instances"
  ADD COLUMN "reminded_before_at" TIMESTAMPTZ,
  ADD COLUMN "reminded_due_at" TIMESTAMPTZ;
