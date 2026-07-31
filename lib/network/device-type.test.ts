import { describe, expect, it } from "vitest";
import { DeviceType } from "@prisma/client";
import { DEVICE_TYPE_OPTIONS, deviceTypeLabel, parseDeviceType } from "./device-type";

describe("deviceTypeLabel", () => {
  it("labels every device type", () => {
    expect(deviceTypeLabel(DeviceType.CAMERA)).toBe("Camera");
    expect(deviceTypeLabel(DeviceType.AP)).toBe("Access point");
    expect(deviceTypeLabel(DeviceType.SWITCH)).toBe("Switch");
    expect(deviceTypeLabel(DeviceType.GATEWAY)).toBe("Gateway");
    expect(deviceTypeLabel(DeviceType.NVR)).toBe("NVR");
  });

  it("renders an em dash for a ticket with no device (mass-outage parent)", () => {
    expect(deviceTypeLabel(null)).toBe("—");
    expect(deviceTypeLabel(undefined)).toBe("—");
  });

  // Guard: a future DeviceType value added to the schema must not silently
  // render as undefined in the UI. This fails the moment the enum grows.
  it("covers the enum exhaustively — no type renders blank", () => {
    for (const t of Object.values(DeviceType)) {
      const label = deviceTypeLabel(t);
      expect(label, `${t} has no label`).toBeTruthy();
      expect(label).not.toBe("—");
    }
  });
});

describe("DEVICE_TYPE_OPTIONS", () => {
  it("offers every device type exactly once", () => {
    const values = DEVICE_TYPE_OPTIONS.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.sort()).toEqual(Object.values(DeviceType).sort());
  });

  it("leads with the types the estate has most of", () => {
    expect(DEVICE_TYPE_OPTIONS[0]?.value).toBe(DeviceType.CAMERA);
    expect(DEVICE_TYPE_OPTIONS[1]?.value).toBe(DeviceType.AP);
  });
});

describe("parseDeviceType", () => {
  it("accepts a valid value", () => {
    expect(parseDeviceType("CAMERA")).toBe(DeviceType.CAMERA);
  });

  it("rejects junk rather than throwing — an unknown param means no filter", () => {
    expect(parseDeviceType("camera")).toBeNull(); // case-sensitive by design
    expect(parseDeviceType("ROUTER")).toBeNull();
    expect(parseDeviceType("")).toBeNull();
    expect(parseDeviceType(undefined)).toBeNull();
    expect(parseDeviceType(null)).toBeNull();
  });
});
