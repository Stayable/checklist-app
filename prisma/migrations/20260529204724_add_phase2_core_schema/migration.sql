-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('OCCUPIED', 'VACANT', 'OOO');

-- CreateEnum
CREATE TYPE "TemplateScope" AS ENUM ('PER_ROOM', 'PER_PROPERTY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ReviewLevel" AS ENUM ('NONE', 'MANAGER', 'CORPORATE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE', 'MULTI', 'YESNO', 'PASSFAIL', 'NUMBER', 'SHORT_TEXT', 'LONG_TEXT', 'PHOTO', 'SIGNATURE', 'DATE', 'SECTION_DIVIDER');

-- CreateEnum
CREATE TYPE "InstanceStatus" AS ENUM ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'FLAGGED', 'INVALIDATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GeofenceStatus" AS ENUM ('VERIFIED', 'OFF_PROPERTY', 'NO_GPS');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX');

-- CreateEnum
CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'TEAMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_number" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'VACANT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "default_role" "Role" NOT NULL,
    "scope" "TemplateScope" NOT NULL,
    "review_level" "ReviewLevel" NOT NULL DEFAULT 'MANAGER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "type" "QuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "photo_min" INTEGER,
    "photo_max" INTEGER,
    "fail_flags_issue" BOOLEAN NOT NULL DEFAULT false,
    "conditional" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "pattern" JSONB NOT NULL,
    "assignment" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_instances" (
    "id" UUID NOT NULL,
    "system_id" TEXT,
    "template_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "scheduled_for" DATE NOT NULL,
    "due_at" TIMESTAMPTZ,
    "assigned_user_id" UUID,
    "status" "InstanceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "invalidation_reason" TEXT,
    "reassigned_to_instance_id" UUID,
    "opened_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by_user_id" UUID,
    "bonus_eligible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checklist_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer" JSONB NOT NULL,
    "notes" TEXT,
    "responded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" UUID NOT NULL,
    "response_id" UUID NOT NULL,
    "r2_key" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "exif_timestamp" TIMESTAMPTZ,
    "gps_lat" DECIMAL(9,6),
    "gps_lng" DECIMAL(9,6),
    "geofence_status" "GeofenceStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "source_instance_id" UUID,
    "source_question_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "IssuePriority" NOT NULL DEFAULT 'MEDIUM',
    "assigned_user_id" UUID,
    "sla_target_at" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "resolution_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "event" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "target" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "read_at" TIMESTAMPTZ,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_property_id_room_number_key" ON "rooms"("property_id", "room_number");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_code_key" ON "checklist_templates"("code");

-- CreateIndex
CREATE INDEX "questions_template_id_idx" ON "questions"("template_id");

-- CreateIndex
CREATE INDEX "recurring_rules_template_id_idx" ON "recurring_rules"("template_id");

-- CreateIndex
CREATE INDEX "recurring_rules_property_id_idx" ON "recurring_rules"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_instances_system_id_key" ON "checklist_instances"("system_id");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_instances_reassigned_to_instance_id_key" ON "checklist_instances"("reassigned_to_instance_id");

-- CreateIndex
CREATE INDEX "checklist_instances_property_id_scheduled_for_idx" ON "checklist_instances"("property_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "checklist_instances_assigned_user_id_status_idx" ON "checklist_instances"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "checklist_instances_status_due_at_idx" ON "checklist_instances"("status", "due_at");

-- CreateIndex
CREATE INDEX "checklist_instances_template_id_idx" ON "checklist_instances"("template_id");

-- CreateIndex
CREATE INDEX "checklist_instances_room_id_idx" ON "checklist_instances"("room_id");

-- CreateIndex
CREATE INDEX "checklist_instances_reviewed_by_user_id_idx" ON "checklist_instances"("reviewed_by_user_id");

-- CreateIndex
CREATE INDEX "responses_instance_id_idx" ON "responses"("instance_id");

-- CreateIndex
CREATE INDEX "responses_question_id_idx" ON "responses"("question_id");

-- CreateIndex
CREATE INDEX "photos_response_id_idx" ON "photos"("response_id");

-- CreateIndex
CREATE INDEX "photos_geofence_status_idx" ON "photos"("geofence_status");

-- CreateIndex
CREATE INDEX "issues_property_id_status_idx" ON "issues"("property_id", "status");

-- CreateIndex
CREATE INDEX "issues_assigned_user_id_status_idx" ON "issues"("assigned_user_id", "status");

-- CreateIndex
CREATE INDEX "issues_sla_target_at_idx" ON "issues"("sla_target_at");

-- CreateIndex
CREATE INDEX "issues_source_instance_id_idx" ON "issues"("source_instance_id");

-- CreateIndex
CREATE INDEX "issues_source_question_id_idx" ON "issues"("source_question_id");

-- CreateIndex
CREATE INDEX "issues_room_id_idx" ON "issues"("room_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_log_user_id_read_at_idx" ON "notification_log"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_log_channel_status_idx" ON "notification_log"("channel", "status");

-- CreateIndex
CREATE INDEX "notification_log_entity_type_entity_id_idx" ON "notification_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_reassigned_to_instance_id_fkey" FOREIGN KEY ("reassigned_to_instance_id") REFERENCES "checklist_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "checklist_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_source_instance_id_fkey" FOREIGN KEY ("source_instance_id") REFERENCES "checklist_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_source_question_id_fkey" FOREIGN KEY ("source_question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
