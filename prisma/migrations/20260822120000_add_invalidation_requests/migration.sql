-- Invalidation requests (ADR-014, amended 2026-08-21 ET for the stayover case).
--
-- NOTE the directory name says 20260822 and the decision date is 2026-08-21.
-- The stamp came from the harness clock, which is UTC-derived and runs a day
-- ahead of Eastern in the evening. The name is NOT corrected: this migration is
-- already recorded in _prisma_migrations on production, and renaming an applied
-- migration is how you manufacture drift. Eastern is the operating clock for
-- every date in this repo (ADR-013).
--
-- Additive only: one new enum, three nullable columns, one index, one FK with
-- ON DELETE SET NULL. No existing column changes type and nothing is dropped,
-- so live reads keep working — apply this to the DB BEFORE deploying the code
-- that reads it.
--
-- Deliberately NOT a new value on "InstanceStatus". `status: { in: [...] }`
-- filters silently EXCLUDE a new enum member and `notIn` silently INCLUDE it,
-- so adding one would quietly redefine /review's tabs, the report denominators,
-- the dashboard tiles and the field home list — every one of them with a clean
-- typecheck. A pending request is still assigned work.

-- CreateEnum
CREATE TYPE "InvalidationReason" AS ENUM ('STAYOVER', 'ROOM_NOT_NEEDED', 'DUPLICATE', 'STAFF_UNAVAILABLE', 'NO_ACCESS', 'OTHER');

-- AlterTable
ALTER TABLE "checklist_instances" ADD COLUMN     "invalidation_reason_code" "InvalidationReason",
ADD COLUMN     "invalidation_requested_at" TIMESTAMPTZ,
ADD COLUMN     "invalidation_requested_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "checklist_instances_invalidation_requested_at_idx" ON "checklist_instances"("invalidation_requested_at");

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_invalidation_requested_by_user_id_fkey" FOREIGN KEY ("invalidation_requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
