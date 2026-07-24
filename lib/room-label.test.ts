import { describe, expect, it } from "vitest";
import { roomDisplay } from "./room-label";

describe("roomDisplay", () => {
  it("prefers the real room number", () => {
    expect(roomDisplay({ roomNumber: "312" }, "Suite")).toBe("312");
  });

  it("falls back to the free-text label when there is no room", () => {
    expect(roomDisplay(null, "Suite")).toBe("Suite");
  });

  it("trims the label", () => {
    expect(roomDisplay(null, "  Lobby  ")).toBe("Lobby");
  });

  it("returns null when neither is set", () => {
    expect(roomDisplay(null, null)).toBeNull();
    expect(roomDisplay(null, "")).toBeNull();
    expect(roomDisplay(null, "   ")).toBeNull();
    expect(roomDisplay(undefined, undefined)).toBeNull();
  });
});
