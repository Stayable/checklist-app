-- CreateEnum
CREATE TYPE "Trade" AS ENUM ('PLUMBING', 'ELECTRICAL', 'HVAC', 'APPLIANCE', 'GENERAL', 'COSMETIC', 'LANDSCAPING', 'PEST_CONTROL', 'ROOFING');

-- CreateTable
CREATE TABLE "contractors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "trades" "Trade"[],
    "whatsapp" TEXT,
    "phone" TEXT,
    "language" "Locale" NOT NULL DEFAULT 'es',
    "contracted" BOOLEAN NOT NULL DEFAULT false,
    "onCall" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "user_id" UUID,
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

-- CreateIndex
CREATE UNIQUE INDEX "contractors_user_id_key" ON "contractors"("user_id");

-- CreateIndex
CREATE INDEX "contractors_active_idx" ON "contractors"("active");

-- CreateIndex
CREATE INDEX "contractor_properties_property_id_idx" ON "contractor_properties"("property_id");

-- AddForeignKey
ALTER TABLE "contractors" ADD CONSTRAINT "contractors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_properties" ADD CONSTRAINT "contractor_properties_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_properties" ADD CONSTRAINT "contractor_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
