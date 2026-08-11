-- Additive only. Two independent changes, both needed for RPM/GSA test accounts
-- (2026-08-12). No DROP, no column altered, nothing renamed — safe to apply
-- BEFORE the code that uses it, which is this repo's required order for adds.
--
-- NOT a revert or reversal of anything.

-- 1. AGENT role: checklist-only management. Manager-level inside the Checklist
--    section, deliberately excluded from Maintenance / Construction / Network /
--    Admin (lib/roles.ts canAccessMaintenance + requireMaintenanceAccess).
--    ALTER TYPE ... ADD VALUE runs inside a transaction on PostgreSQL 12+ as
--    long as the new value is not itself used in the same transaction; it is
--    not. Same technique used when NETWORK_TECH was added.
ALTER TYPE "Role" ADD VALUE 'AGENT';

-- 2. Forced password change. Existing rows default to false, so no current user
--    is affected. Set true for admin-provisioned accounts whose first password
--    was handed over out-of-band; requireUser() then redirects every guarded
--    page and action to the profile page until it is changed.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
