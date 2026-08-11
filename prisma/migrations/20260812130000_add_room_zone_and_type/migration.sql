-- Additive: zone (building) and room type on rooms, from the Cloudbeds
-- inventory export loaded 2026-08-12. Both nullable, no default, no existing
-- column touched — safe to apply before the code that reads them.
ALTER TABLE "rooms" ADD COLUMN "zone" TEXT;
ALTER TABLE "rooms" ADD COLUMN "room_type" TEXT;
