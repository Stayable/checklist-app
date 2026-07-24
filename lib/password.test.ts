import { describe, it, expect } from "vitest";
import {
  validatePasswordStrength,
  MIN_PASSWORD_LENGTH,
  generateTempPassword,
} from "./password";

describe("validatePasswordStrength", () => {
  it("rejects passwords shorter than the minimum", () => {
    expect(validatePasswordStrength("short")).toMatch(/at least/);
    expect(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH - 1))).not.toBeNull();
  });

  it("accepts passwords at or above the minimum", () => {
    expect(validatePasswordStrength("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(validatePasswordStrength("a-longer-passphrase")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(validatePasswordStrength(null)).not.toBeNull();
    expect(validatePasswordStrength(undefined)).not.toBeNull();
    expect(validatePasswordStrength(12345678)).not.toBeNull();
  });
});

describe("generateTempPassword", () => {
  it("returns the requested length from the unambiguous alphabet", () => {
    expect(generateTempPassword().length).toBe(12);
    expect(generateTempPassword(16)).toMatch(/^[A-Za-z2-9]{16}$/);
  });
});
