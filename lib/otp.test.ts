import { describe, expect, it } from "vitest";
import { generateOtpCode, hashOtp, verifyOtpHash, isExpired } from "./otp";

describe("otp", () => {
  it("generates a 6-digit code", () => {
    for (let i = 0; i < 50; i++) expect(generateOtpCode()).toMatch(/^\d{6}$/);
  });
  it("hash verifies the right code and rejects a wrong one", () => {
    const h = hashOtp("123456", "pep");
    expect(verifyOtpHash("123456", "pep", h)).toBe(true);
    expect(verifyOtpHash("654321", "pep", h)).toBe(false);
  });
  it("hash is pepper-dependent", () => {
    expect(hashOtp("123456", "a")).not.toBe(hashOtp("123456", "b"));
    expect(verifyOtpHash("123456", "b", hashOtp("123456", "a"))).toBe(false);
  });
  it("isExpired is exclusive at the boundary forward", () => {
    const exp = new Date("2026-06-25T12:00:00Z");
    expect(isExpired(exp, new Date("2026-06-25T11:59:59Z"))).toBe(false);
    expect(isExpired(exp, new Date("2026-06-25T12:00:01Z"))).toBe(true);
  });
});
