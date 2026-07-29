import { describe, expect, it } from "vitest";
import { parseArubaPayload, parseUnifiPayload } from "./parse";

describe("parseUnifiPayload", () => {
  it("parses a camera-disconnect fixture as PROBLEM/UNIFI_PROTECT/CAMERA", () => {
    const result = parseUnifiPayload({
      event: "camera.disconnected",
      device: "Lobby Camera",
      propertyId: "4645",
      message: "Camera went offline",
      timestamp: "2026-07-25T09:00:00.000Z",
    });

    expect(result).toEqual({
      deviceName: "Lobby Camera",
      propertyRef: "4645",
      eventType: "PROBLEM",
      source: "UNIFI_PROTECT",
      deviceType: "CAMERA",
      alertMessage: "Camera went offline",
      occurredAt: new Date("2026-07-25T09:00:00.000Z"),
    });
  });

  it("parses a device.connected fixture as RECOVERY/UNIFI_NETWORK/AP", () => {
    const result = parseUnifiPayload({
      event: "device.connected",
      device: "AP-Front-Desk",
      propertyId: "8700",
      timestamp: 1785150000,
    });

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe("RECOVERY");
    expect(result?.source).toBe("UNIFI_NETWORK");
    expect(result?.deviceType).toBe("AP");
    expect(result?.deviceName).toBe("AP-Front-Desk");
    expect(result?.propertyRef).toBe("8700");
    expect(result?.alertMessage).toBeNull();
  });

  it("falls back to now() when timestamp is absent", () => {
    const before = Date.now();
    const result = parseUnifiPayload({
      event: "camera.connected",
      device: "Lobby Camera",
      propertyId: "4645",
    });
    const after = Date.now();

    expect(result).not.toBeNull();
    expect(result!.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result!.occurredAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("returns null when propertyId is missing", () => {
    expect(
      parseUnifiPayload({ event: "camera.disconnected", device: "Lobby Camera" }),
    ).toBeNull();
  });

  it("returns null when device is missing", () => {
    expect(
      parseUnifiPayload({ event: "camera.disconnected", propertyId: "4645" }),
    ).toBeNull();
  });

  it("returns null for an unmapped event string", () => {
    expect(
      parseUnifiPayload({
        event: "camera.motion_detected",
        device: "Lobby Camera",
        propertyId: "4645",
      }),
    ).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseUnifiPayload(null)).toBeNull();
    expect(parseUnifiPayload("not an object")).toBeNull();
    expect(parseUnifiPayload(undefined)).toBeNull();
  });
});

describe("parseArubaPayload", () => {
  it("parses an AP-offline fixture as PROBLEM/ARUBA/AP", () => {
    const result = parseArubaPayload({
      alertType: "AP offline",
      apName: "AP-Pool-Deck",
      propertyId: "2295",
      message: "Access point stopped responding",
      timestamp: "2026-07-25T09:05:00.000Z",
    });

    expect(result).toEqual({
      deviceName: "AP-Pool-Deck",
      propertyRef: "2295",
      eventType: "PROBLEM",
      source: "ARUBA",
      deviceType: "AP",
      alertMessage: "Access point stopped responding",
      occurredAt: new Date("2026-07-25T09:05:00.000Z"),
    });
  });

  it("parses an AP-reconnect fixture as RECOVERY", () => {
    const result = parseArubaPayload({
      alertType: "AP reconnected",
      apName: "AP-Pool-Deck",
      propertyId: "2295",
      timestamp: "2026-07-25T09:10:00.000Z",
    });

    expect(result).not.toBeNull();
    expect(result?.eventType).toBe("RECOVERY");
    expect(result?.source).toBe("ARUBA");
    expect(result?.deviceType).toBe("AP");
  });

  it("returns null when propertyId is missing", () => {
    expect(parseArubaPayload({ alertType: "AP offline", apName: "AP-Pool-Deck" })).toBeNull();
  });

  it("returns null when apName is missing", () => {
    expect(parseArubaPayload({ alertType: "AP offline", propertyId: "2295" })).toBeNull();
  });

  it("returns null for an unmapped alert string", () => {
    expect(
      parseArubaPayload({
        alertType: "Firmware update available",
        apName: "AP-Pool-Deck",
        propertyId: "2295",
      }),
    ).toBeNull();
  });

  it("returns null for non-object payloads", () => {
    expect(parseArubaPayload(null)).toBeNull();
    expect(parseArubaPayload(42)).toBeNull();
  });
});
