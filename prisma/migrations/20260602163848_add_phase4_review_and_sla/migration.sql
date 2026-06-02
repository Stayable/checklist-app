-- AlterTable
ALTER TABLE "checklist_instances" ADD COLUMN     "manager_note" TEXT;

-- CreateTable
CREATE TABLE "sla_defaults" (
    "priority" "IssuePriority" NOT NULL,
    "hours" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sla_defaults_pkey" PRIMARY KEY ("priority")
);
