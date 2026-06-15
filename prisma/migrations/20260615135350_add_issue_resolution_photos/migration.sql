-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "issue_id" UUID,
ALTER COLUMN "response_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "photos_issue_id_idx" ON "photos"("issue_id");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
