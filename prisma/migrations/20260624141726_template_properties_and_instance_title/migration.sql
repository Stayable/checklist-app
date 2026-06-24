-- AlterTable
ALTER TABLE "checklist_instances" ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "checklist_templates" ADD COLUMN     "all_properties" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "template_properties" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,

    CONSTRAINT "template_properties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_properties_property_id_idx" ON "template_properties"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_properties_template_id_property_id_key" ON "template_properties"("template_id", "property_id");

-- AddForeignKey
ALTER TABLE "template_properties" ADD CONSTRAINT "template_properties_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_properties" ADD CONSTRAINT "template_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
