-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('CAMERA', 'AP');

-- CreateEnum
CREATE TYPE "DeviceSource" AS ENUM ('UNIFI_PROTECT', 'UNIFI_NETWORK', 'ARUBA');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NetworkEventType" AS ENUM ('PROBLEM', 'RECOVERY');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('STANDARD', 'MASS_OUTAGE');

-- CreateEnum
CREATE TYPE "TicketNoteSource" AS ENUM ('TEAMS_REPLY', 'MANUAL');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'NETWORK_TECH';

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "spotipo_api_key" TEXT,
ADD COLUMN     "spotipo_site_id" TEXT,
ADD COLUMN     "teams_channel_id" TEXT,
ADD COLUMN     "teams_channel_name" TEXT;

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "device_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "source" "DeviceSource" NOT NULL,
    "property_id" UUID NOT NULL,
    "last_seen_at" TIMESTAMPTZ,
    "current_status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_events" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "event_type" "NetworkEventType" NOT NULL,
    "source" "DeviceSource" NOT NULL,
    "alert_message" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticket_id" UUID,
    "resolved_by_event_id" UUID,

    CONSTRAINT "network_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_webhook_payloads" (
    "id" UUID NOT NULL,
    "source" "DeviceSource" NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_webhook_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "device_id" UUID,
    "property_id" UUID NOT NULL,
    "trigger_event_id" UUID,
    "alert_message" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "ticket_type" "TicketType" NOT NULL DEFAULT 'STANDARD',
    "opened_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_to" TEXT,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "down_duration_min" INTEGER,
    "teams_notified" BOOLEAN NOT NULL DEFAULT false,
    "teams_message_id" TEXT,
    "teams_message_url" TEXT,
    "affected_devices" JSONB,
    "parent_ticket_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_notes" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "source" "TicketNoteSource" NOT NULL,
    "author" TEXT,
    "teams_reply_id" TEXT,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_jobs" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "run_at" TIMESTAMPTZ NOT NULL,
    "event_id" UUID,
    "ticket_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_key_key" ON "devices"("device_key");

-- CreateIndex
CREATE INDEX "devices_property_id_idx" ON "devices"("property_id");

-- CreateIndex
CREATE INDEX "devices_current_status_idx" ON "devices"("current_status");

-- CreateIndex
CREATE UNIQUE INDEX "network_events_resolved_by_event_id_key" ON "network_events"("resolved_by_event_id");

-- CreateIndex
CREATE INDEX "network_events_device_id_occurred_at_idx" ON "network_events"("device_id", "occurred_at");

-- CreateIndex
CREATE INDEX "network_events_property_id_occurred_at_idx" ON "network_events"("property_id", "occurred_at");

-- CreateIndex
CREATE INDEX "network_events_ticket_id_idx" ON "network_events"("ticket_id");

-- CreateIndex
CREATE INDEX "raw_webhook_payloads_source_received_at_idx" ON "raw_webhook_payloads"("source", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "tickets_property_id_status_idx" ON "tickets"("property_id", "status");

-- CreateIndex
CREATE INDEX "tickets_status_opened_at_idx" ON "tickets"("status", "opened_at");

-- CreateIndex
CREATE INDEX "tickets_device_id_status_idx" ON "tickets"("device_id", "status");

-- CreateIndex
CREATE INDEX "tickets_parent_ticket_id_idx" ON "tickets"("parent_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_notes_teams_reply_id_key" ON "ticket_notes"("teams_reply_id");

-- CreateIndex
CREATE INDEX "ticket_notes_ticket_id_idx" ON "ticket_notes"("ticket_id");

-- CreateIndex
CREATE INDEX "network_jobs_status_run_at_idx" ON "network_jobs"("status", "run_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_events" ADD CONSTRAINT "network_events_resolved_by_event_id_fkey" FOREIGN KEY ("resolved_by_event_id") REFERENCES "network_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_ticket_id_fkey" FOREIGN KEY ("parent_ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_notes" ADD CONSTRAINT "ticket_notes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

