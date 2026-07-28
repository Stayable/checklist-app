-- T2 (Contractor Dispatch MVP): dispatchable contractor jobs.
--
-- Fully additive: one new enum, one new table, one nullable column + index on
-- `photos`. No existing row changes meaning, so this is safe to apply to a live
-- database ahead of the code deploy.

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('OPEN', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "contractor_jobs" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_label" TEXT,
    "trade" "Trade" NOT NULL,
    "problem" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" "JobStatus" NOT NULL DEFAULT 'OPEN',
    "contractor_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "completion_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contractor_jobs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: third nullable photo owner (response | issue | contractor job).
ALTER TABLE "photos" ADD COLUMN "contractor_job_id" UUID;

-- CreateIndex
CREATE INDEX "contractor_jobs_property_id_status_idx" ON "contractor_jobs"("property_id", "status");
CREATE INDEX "contractor_jobs_contractor_id_idx" ON "contractor_jobs"("contractor_id");
CREATE INDEX "contractor_jobs_urgent_status_idx" ON "contractor_jobs"("urgent", "status");
CREATE INDEX "photos_contractor_job_id_idx" ON "photos"("contractor_job_id");

-- AddForeignKey
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "photos" ADD CONSTRAINT "photos_contractor_job_id_fkey" FOREIGN KEY ("contractor_job_id") REFERENCES "contractor_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
