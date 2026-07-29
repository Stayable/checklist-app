import { describe, expect, it } from "vitest";
import { ConsentChannel } from "@prisma/client";
import { hasLiveConsent } from "./consent";

const W = ConsentChannel.WHATSAPP;
const S = ConsentChannel.SMS;

describe("hasLiveConsent", () => {
  it("is false with no records", () => {
    expect(hasLiveConsent([], W)).toBe(false);
  });

  it("is true for an unrevoked grant on the channel", () => {
    expect(hasLiveConsent([{ channel: W, revokedAt: null }], W)).toBe(true);
  });

  it("is false when the only grant is revoked", () => {
    expect(hasLiveConsent([{ channel: W, revokedAt: new Date() }], W)).toBe(false);
  });

  it("does not let one channel satisfy another", () => {
    expect(hasLiveConsent([{ channel: S, revokedAt: null }], W)).toBe(false);
  });

  it("is true when a later grant follows a revocation (re-consent)", () => {
    expect(
      hasLiveConsent(
        [
          { channel: W, revokedAt: new Date("2026-07-01") },
          { channel: W, revokedAt: null },
        ],
        W,
      ),
    ).toBe(true);
  });

  it("is false when every grant for the channel is revoked", () => {
    expect(
      hasLiveConsent(
        [
          { channel: W, revokedAt: new Date("2026-07-01") },
          { channel: W, revokedAt: new Date("2026-07-20") },
        ],
        W,
      ),
    ).toBe(false);
  });
});
