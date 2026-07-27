-- T11 (UniFi poller): widen DeviceType beyond CAMERA|AP.
--
-- The live fleet pulled from the UniFi Site Manager API is mostly switches
-- (USW Pro 24 PoE etc.) plus one gateway console per property (UDM/UCG/UCK)
-- and Protect recorders (UNVR). With only CAMERA|AP available, every switch
-- would have to be stored as "AP", which then lies in the /network UI.
--
-- Additive only: ALTER TYPE ... ADD VALUE cannot remove or reorder existing
-- values, so no existing row changes meaning and old code keeps working.
-- IF NOT EXISTS makes this safely re-runnable.
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'SWITCH';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'GATEWAY';
ALTER TYPE "DeviceType" ADD VALUE IF NOT EXISTS 'NVR';
