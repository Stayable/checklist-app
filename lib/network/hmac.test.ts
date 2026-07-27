import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyHmacSignature } from "./hmac";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyHmacSignature", () => {
  const secret = "test-shared-secret";
  const body = JSON.stringify({ event: "camera.disconnected", device: "cam-1" });

  it("returns true for a correctly signed body", () => {
    expect(verifyHmacSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("returns true when the header omits the sha256= prefix", () => {
    const digest = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyHmacSignature(body, digest, secret)).toBe(true);
  });

  it("returns false for a wrong signature", () => {
    expect(verifyHmacSignature(body, sign(body, "wrong-secret"), secret)).toBe(false);
  });

  it("returns false for a tampered body", () => {
    const validSig = sign(body, secret);
    expect(verifyHmacSignature(body + "tampered", validSig, secret)).toBe(false);
  });

  it("returns false when the header is missing", () => {
    expect(verifyHmacSignature(body, null, secret)).toBe(false);
  });

  it("returns false when the secret is missing", () => {
    expect(verifyHmacSignature(body, sign(body, secret), undefined)).toBe(false);
  });

  it("returns false (not throw) on a length-mismatched signature", () => {
    expect(() => verifyHmacSignature(body, "sha256=deadbeef", secret)).not.toThrow();
    expect(verifyHmacSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });

  it("returns false (not throw) on a non-hex signature", () => {
    expect(() => verifyHmacSignature(body, "sha256=not-hex-at-all!!", secret)).not.toThrow();
    expect(verifyHmacSignature(body, "sha256=not-hex-at-all!!", secret)).toBe(false);
  });
});
