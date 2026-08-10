-- Contractor scheduling (2026-08-11 design, ADR-030).
--
-- Adds 3 enums (Trade, ContractorJobStatus, ContractorNoteSource) and 5 tables
-- (contractors, contractor_properties, contractor_jobs, contractor_job_notes,
-- contractor_daily_notes) for a scheduling-only contractor feature: a
-- directory, date-scheduled jobs, and two append-only note threads.
--
-- This is a NEW SCHEDULING FEATURE, NOT A REVERT of migration
-- 20260803120000_drop_contractor_dispatch (commit 94ce338, 2026-08-03), which
-- deleted an earlier contractor/dispatch rail (tables contractors,
-- contractor_properties, contractor_jobs, enums Trade and JobStatus, and
-- column photos.contractor_job_id) from this schema and from production. The
-- names Contractor/ContractorProperty/ContractorJob/Trade are reused here
-- because they are the correct domain nouns and are now free — the dropped
-- rail's dispatch-only surface (contracted/onCall ranking fields, a
-- Contractor.userId link to User, and a contractor-owned Photo) is
-- deliberately absent, and the status enum is the new, differently-named
-- ContractorJobStatus (no DISPATCHED value), not a revived JobStatus. Nothing
-- in this migration or the feature it supports sends a message or issues a
-- contractor-facing link.
--
-- Purely additive: 3 CREATE TYPE, 5 CREATE TABLE, their indexes, and
-- ADD CONSTRAINT ... FOREIGN KEY. No DROP anywhere, and no existing table
-- (including "photos" — see ADR-016) is altered. Safe to apply to production
-- before the corresponding code deploys.

-- CreateEnum
CREATE TYPE "Trade" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HVAC', 'ROOFING', 'PEST', 'LANDSCAPING', 'PRESSURE_WASHING', 'GENERAL');

-- CreateEnum
CREATE TYPE "ContractorJobStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractorNoteSource" AS ENUM ('STAFF', 'SYSTEM');

-- CreateTable
CREATE TABLE "contractors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "trades" "Trade"[],
    "phone" TEXT,
    "whatsapp" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contractors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_properties" (
    "contractor_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_properties_pkey" PRIMARY KEY ("contractor_id","property_id")
);

-- CreateTable
CREATE TABLE "contractor_jobs" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_label" TEXT,
    "trade" "Trade" NOT NULL,
    "description" TEXT NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContractorJobStatus" NOT NULL DEFAULT 'PLANNED',
    "contractor_id" UUID,
    "scheduled_for" DATE,
    "created_by_user_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "close_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contractor_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_job_notes" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "source" "ContractorNoteSource" NOT NULL,
    "author_user_id" UUID,
    "author_label" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_job_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_daily_notes" (
    "id" UUID NOT NULL,
    "property_id" UUID,
    "for_date" DATE NOT NULL,
    "source" "ContractorNoteSource" NOT NULL,
    "author_user_id" UUID,
    "author_label" TEXT,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_daily_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_properties_property_id_idx" ON "contractor_properties"("property_id");

-- CreateIndex
CREATE INDEX "contractor_jobs_property_id_scheduled_for_idx" ON "contractor_jobs"("property_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "contractor_jobs_scheduled_for_idx" ON "contractor_jobs"("scheduled_for");

-- CreateIndex
CREATE INDEX "contractor_jobs_contractor_id_idx" ON "contractor_jobs"("contractor_id");

-- CreateIndex
CREATE INDEX "contractor_jobs_status_idx" ON "contractor_jobs"("status");

-- CreateIndex
CREATE INDEX "contractor_jobs_urgent_status_idx" ON "contractor_jobs"("urgent", "status");

-- CreateIndex
CREATE INDEX "contractor_job_notes_job_id_idx" ON "contractor_job_notes"("job_id");

-- CreateIndex
CREATE INDEX "contractor_daily_notes_for_date_property_id_idx" ON "contractor_daily_notes"("for_date", "property_id");

-- AddForeignKey
ALTER TABLE "contractor_properties" ADD CONSTRAINT "contractor_properties_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_properties" ADD CONSTRAINT "contractor_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_jobs" ADD CONSTRAINT "contractor_jobs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_job_notes" ADD CONSTRAINT "contractor_job_notes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "contractor_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_job_notes" ADD CONSTRAINT "contractor_job_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_daily_notes" ADD CONSTRAINT "contractor_daily_notes_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_daily_notes" ADD CONSTRAINT "contractor_daily_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

