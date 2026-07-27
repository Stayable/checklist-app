import { describe, expect, it } from "vitest";
import { mapArubaEvent, mapUnifiEvent } from "./event-mapping";

describe("mapUnifiEvent", () => {
  it("maps problem event types", () => {
    expect(mapUnifiEvent("camera.disconnected")).toBe("PROBLEM");
    expect(mapUnifiEvent("camera.offline")).toBe("PROBLEM");
    expect(mapUnifiEvent("camera.device_error")).toBe("PROBLEM");
    expect(mapUnifiEvent("device.disconnected")).toBe("PROBLEM");
  });

  it("maps recovery event types", () => {
    expect(mapUnifiEvent("camera.connected")).toBe("RECOVERY");
    expect(mapUnifiEvent("camera.online")).toBe("RECOVERY");
    expect(mapUnifiEvent("device.connected")).toBe("RECOVERY");
  });

  it("returns null for unrecognized event types", () => {
    expect(mapUnifiEvent("camera.motion_detected")).toBeNull();
    expect(mapUnifiEvent("")).toBeNull();
    expect(mapUnifiEvent("totally.unknown")).toBeNull();
  });
});

describe("mapArubaEvent", () => {
  it("maps AP offline / disconnected phrasings to PROBLEM", () => {
    expect(mapArubaEvent("AP offline")).toBe("PROBLEM");
    expect(mapArubaEvent("AP disconnected")).toBe("PROBLEM");
    expect(mapArubaEvent("Access point offline")).toBe("PROBLEM");
    expect(mapArubaEvent("access point is disconnected")).toBe("PROBLEM");
  });

  it("maps uplink wired-to-over-the-air changes to PROBLEM", () => {
    expect(mapArubaEvent("Uplink changed: wired to over-the-air")).toBe("PROBLEM");
    expect(mapArubaEvent("uplink changed from wired to over the air")).toBe("PROBLEM");
  });

  it("maps AP reconnected / online phrasings to RECOVERY", () => {
    expect(mapArubaEvent("AP reconnected")).toBe("RECOVERY");
    expect(mapArubaEvent("AP online")).toBe("RECOVERY");
    expect(mapArubaEvent("Access point back up")).toBe("RECOVERY");
  });

  it("maps uplink restored (over-the-air -> wired) to RECOVERY", () => {
    expect(mapArubaEvent("Uplink restored: over-the-air to wired")).toBe("RECOVERY");
  });

  it("does not let a false-offline substring inside a reconnect message win", () => {
    // Contains the substring "disconnected" but describes a recovery.
    expect(mapArubaEvent("AP reconnected (was disconnected 3m ago)")).toBe("RECOVERY");
    expect(mapArubaEvent("Connection restored after being offline")).toBe("RECOVERY");
  });

  it("is case- and whitespace-tolerant", () => {
    expect(mapArubaEvent("  AP OFFLINE  ")).toBe("PROBLEM");
    expect(mapArubaEvent("AP RECONNECTED")).toBe("RECOVERY");
  });

  it("returns null for unrecognized alert text", () => {
    expect(mapArubaEvent("Firmware update available")).toBeNull();
    expect(mapArubaEvent("")).toBeNull();
  });
});
