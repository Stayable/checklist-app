import { DeviceType } from "@prisma/client";

// Human labels for DeviceType (2026-07-31).
//
// The enum was being rendered raw everywhere — a ticket row said "AP", a device
// page said "AP · UNIFI · ONLINE". Fine for whoever wrote the poller, opaque to
// a property manager scanning for "which cameras are down". One label map, used
// by the ticket list, the device page, the property page and the ticket filter,
// so the same device never reads two different ways on two screens.

const LABELS: Record<DeviceType, string> = {
  [DeviceType.CAMERA]: "Camera",
  [DeviceType.AP]: "Access point",
  [DeviceType.SWITCH]: "Switch",
  [DeviceType.GATEWAY]: "Gateway",
  [DeviceType.NVR]: "NVR",
};

/**
 * Display label for a device type. `null`/`undefined` yields an em dash rather
 * than an empty cell — a mass-outage parent ticket has no device at all, and
 * "—" says that honestly where a blank looks like a rendering bug.
 */
export function deviceTypeLabel(type: DeviceType | null | undefined): string {
  if (type == null) return "—";
  return LABELS[type];
}

/**
 * Options for the device-type filter, ordered by how many of them the estate
 * actually has (455 cameras, 99 APs, 70 switches, 8 gateways, 8 NVRs as of
 * 2026-07-31) so the common choices are at the top of the list.
 */
export const DEVICE_TYPE_OPTIONS: { value: DeviceType; label: string }[] = [
  DeviceType.CAMERA,
  DeviceType.AP,
  DeviceType.SWITCH,
  DeviceType.GATEWAY,
  DeviceType.NVR,
].map((value) => ({ value, label: LABELS[value] }));

/** Narrows an untrusted query-param string to a DeviceType, else null. */
export function parseDeviceType(raw: string | undefined | null): DeviceType | null {
  if (!raw) return null;
  return raw in DeviceType ? (raw as DeviceType) : null;
}
