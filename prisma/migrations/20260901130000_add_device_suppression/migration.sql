-- Device suppression (2026-09-01 ET, derived — the harness clock runs ahead).
--
-- The re-arm sweep closed a real hole: four code paths left a device OFFLINE
-- with no ticket, permanently, because events are transitions-only and nothing
-- reconciled. But it introduced the opposite failure for one case. A
-- DECOMMISSIONED device that UniFi still reports offline now loops: the tech
-- resolves the ticket, the sweep re-arms it, a new ticket opens ~7 minutes
-- later, forever. Before the sweep that device sat silently stranded; after it,
-- it is a ticket generator.
--
-- The loop is CORRECT for a device somebody will repair and useless for one
-- nobody will, and no amount of polling can tell those apart — only a human
-- can. So: an explicit acknowledgement.
--
-- Suppression hides the device from TICKETING, not from MONITORING. Its status
-- keeps updating, so a suppressed device that comes back ONLINE is visible at
-- once and can be un-suppressed. Deliberately three columns and not a boolean:
-- who silenced it and why is the first question anyone asks months later.
--
-- Overlaps TODO §Q32 ("what happens to a device that disappears from UniFi")
-- but is not the same thing. §Q32 is about a device UniFi STOPS reporting;
-- this is about one UniFi keeps reporting that nobody will fix.
--
-- Additive: three nullable columns, one partial index. Nothing dropped, no
-- column changes type, so code deployed before this migration keeps working.
-- APPLY BEFORE DEPLOYING THE CODE THAT READS IT.

-- AlterTable
ALTER TABLE "devices"
  ADD COLUMN "suppressed_at"     TIMESTAMPTZ,
  ADD COLUMN "suppressed_reason" TEXT,
  ADD COLUMN "suppressed_by_id"  UUID;

-- The reconciler asks "which offline devices are NOT suppressed" every tick.
-- Partial, because suppressed devices are the rare case and a full index would
-- be mostly dead weight.
CREATE INDEX "devices_suppressed_at_idx" ON "devices" ("suppressed_at")
  WHERE "suppressed_at" IS NOT NULL;
