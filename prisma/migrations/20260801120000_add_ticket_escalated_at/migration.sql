-- Records when a ticket crossed the escalation threshold (2026-08-01).
--
-- Escalation was display-only until now: computed on every read from openedAt
-- for a badge. Kyle's ask is a realtime Teams post to the General channel the
-- moment a ticket escalates, which needs persisted state — "has this already
-- been announced?" is not derivable from openedAt, so without this column the
-- sweep would re-announce the same ticket every minute until it was resolved.
--
-- Additive and nullable, so it is safe to apply while the previous build is
-- still serving: existing rows read NULL. Every open ticket already older than
-- the threshold will therefore escalate on the first sweep after deploy — see
-- the priming note in lib/network/escalate.server.ts, which is why the sweep
-- caps how many it will announce in one tick.
--
-- Authored by hand rather than `prisma migrate diff`: the shared dev DB carries
-- un-merged drift so `migrate dev` wants a reset, and this is one ADD COLUMN
-- plus one index that matches the schema exactly.
ALTER TABLE "tickets" ADD COLUMN "escalated_at" TIMESTAMPTZ;

-- Serves the sweep's only query — open tickets with escalated_at IS NULL.
CREATE INDEX "tickets_status_escalated_at_idx" ON "tickets"("status", "escalated_at");
