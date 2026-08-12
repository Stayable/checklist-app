-- Contractor update fan-out, app side
-- (docs/ContractorUpdateFanout_Contract_081226.md; review in
--  docs/ContractorUpdateFanout_AppSideReadiness_RISE8_081326.md).
--
-- PURELY ADDITIVE: one ALTER TYPE ... ADD VALUE, one CREATE TYPE, two
-- CREATE TABLE. No DROP, no column removed, no existing table altered except
-- the enum gaining a value. Apply order for production is therefore
-- DB FIRST, THEN CODE (the reverse of 20260803120000, which was a drop).
--
-- ⚠ The DELAYED value and the STATUS_MAP change in
-- scripts/sync-contractor-schedule-from-smartsheet.ts must reach any given
-- environment TOGETHER. Left mapping Delayed -> PLANNED, the next sync run
-- does not merely revert a delayed job: it appends a SYSTEM note claiming
-- Smartsheet said so, to an append-only thread that cannot be corrected.
--
-- ADD VALUE runs inside Prisma's migration transaction. That is allowed from
-- PostgreSQL 12 onward (Neon is far past it) provided the new value is not
-- USED in the same transaction — nothing here writes it. AFTER 'PLANNED'
-- keeps the physical enum order matching the declaration order in
-- schema.prisma, so the sort order of the type is the lifecycle order.

-- AlterEnum
ALTER TYPE "ContractorJobStatus" ADD VALUE 'DELAYED' AFTER 'PLANNED';

-- CreateEnum
CREATE TYPE "ContractorUpdateResolution" AS ENUM ('JOB_STATUS', 'JOB_NOTE', 'DAILY_NOTE', 'AMBIGUOUS');

-- CreateTable
-- Capture-before-trust. Deliberately NO unique constraint: a duplicate
-- delivery must still be captured, and the idempotency key lives on
-- contractor_updates instead.
CREATE TABLE "contractor_update_captures" (
    "id" UUID NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_update_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_updates" (
    "id" UUID NOT NULL,
    "message_sid" TEXT NOT NULL,
    "contract_version" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "contractor_phone" TEXT,
    "contractor_name" TEXT NOT NULL,
    "matched_by" TEXT,
    "resolution" "ContractorUpdateResolution" NOT NULL,
    "job_id" UUID,
    "status_applied" "ContractorJobStatus",
    "smartsheet_row_id" TEXT,
    "received_at_utc" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contractor_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_update_captures_received_at_idx" ON "contractor_update_captures"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_updates_message_sid_key" ON "contractor_updates"("message_sid");

-- CreateIndex
CREATE INDEX "contractor_updates_work_date_contractor_phone_idx" ON "contractor_updates"("work_date", "contractor_phone");

-- CreateIndex
CREATE INDEX "contractor_updates_job_id_idx" ON "contractor_updates"("job_id");

-- CreateIndex
CREATE INDEX "contractor_updates_resolution_created_at_idx" ON "contractor_updates"("resolution", "created_at");

-- AddForeignKey
ALTER TABLE "contractor_updates" ADD CONSTRAINT "contractor_updates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "contractor_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
