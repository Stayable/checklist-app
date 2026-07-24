-- CreateEnum
CREATE TYPE "CompletionCheck" AS ENUM ('PASS', 'FAIL');

-- AlterTable
ALTER TABLE "checklist_templates" ADD COLUMN     "collects_checkout_flags" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "checklist_instances" ADD COLUMN     "completion_check" "CompletionCheck",
ADD COLUMN     "items_to_replace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "items_to_replace_list" TEXT,
ADD COLUMN     "locked_at" TIMESTAMPTZ,
ADD COLUMN     "notify_corporate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "place_ooo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "return_deposit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "room_label" TEXT,
ADD COLUMN     "verified_at" TIMESTAMPTZ,
ADD COLUMN     "verified_by_pm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verified_by_user_id" UUID;

-- CreateIndex
CREATE INDEX "checklist_instances_verified_by_user_id_idx" ON "checklist_instances"("verified_by_user_id");

-- AddForeignKey
ALTER TABLE "checklist_instances" ADD CONSTRAINT "checklist_instances_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
