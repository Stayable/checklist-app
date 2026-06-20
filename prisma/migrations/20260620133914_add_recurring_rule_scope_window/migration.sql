-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "created_by_user_id" UUID,
ADD COLUMN     "effective_from" DATE,
ADD COLUMN     "effective_to" DATE,
ADD COLUMN     "scope" JSONB,
ADD COLUMN     "skip_days" JSONB;

-- CreateIndex
CREATE INDEX "recurring_rules_property_id_active_idx" ON "recurring_rules"("property_id", "active");

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
