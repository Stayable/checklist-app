import { describe, expect, it } from "vitest";
import { signTrustedToken, parseTrustedToken, newDeviceId, TRUSTED_MAX_AGE_MS } from "./trusted-device";

const SECRET = "test-secret";
const t0 = 1_750_000_000_000;

describe("trusted-device token", () => {
  it("round-trips a valid token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    const parsed = parseTrustedToken(tok, SECRET, new Date(t0 + 1000), TRUSTED_MAX_AGE_MS);
    expect(parsed).toEqual({ userId: "u1", deviceId: "d1" });
  });
  it("rejects a tampered token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET) + "x";
    expect(parseTrustedToken(tok, SECRET, new Date(t0 + 1000), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    expect(parseTrustedToken(tok, "other", new Date(t0 + 1000), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects an expired token", () => {
    const tok = signTrustedToken("u1", "d1", t0, SECRET);
    expect(parseTrustedToken(tok, SECRET, new Date(t0 + TRUSTED_MAX_AGE_MS + 1), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(parseTrustedToken("garbage", SECRET, new Date(t0), TRUSTED_MAX_AGE_MS)).toBeNull();
    expect(parseTrustedToken("", SECRET, new Date(t0), TRUSTED_MAX_AGE_MS)).toBeNull();
  });
  it("newDeviceId is unique-ish and non-empty", () => {
    expect(newDeviceId()).not.toBe(newDeviceId());
    expect(newDeviceId().length).toBeGreaterThan(10);
  });
});
