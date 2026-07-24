import { describe, expect, it } from "vitest";
import { assertUnlocked, InstanceLockedError, isLocked } from "./review-lock";

describe("isLocked", () => {
  it("is false when lockedAt is null", () => {
    expect(isLocked({ lockedAt: null })).toBe(false);
  });

  it("is true when lockedAt is a date", () => {
    expect(isLocked({ lockedAt: new Date("2026-07-25T10:00:00Z") })).toBe(true);
  });

  it("is true even for the epoch (any non-null date locks)", () => {
    expect(isLocked({ lockedAt: new Date(0) })).toBe(true);
  });
});

describe("assertUnlocked", () => {
  it("does not throw when unlocked", () => {
    expect(() => assertUnlocked({ lockedAt: null })).not.toThrow();
  });

  it("throws InstanceLockedError when locked", () => {
    expect(() => assertUnlocked({ lockedAt: new Date() })).toThrow(InstanceLockedError);
  });
});
