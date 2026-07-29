import { describe, expect, it } from "vitest";
import { ConsentChannel } from "@prisma/client";
import { consentDisplayState, hasLiveConsent } from "./consent";

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

describe("consentDisplayState", () => {
  const noInvite = null;
  const anInvite = { expiresAt: new Date("2026-08-05T00:00:00Z") };
  const consented = [{ channel: W, revokedAt: null }];
  const revoked = [{ channel: W, revokedAt: new Date("2026-07-01") }];

  it("is consented when a live WhatsApp grant exists", () => {
    expect(
      consentDisplayState({ consentRecords: consented, outstandingInvite: noInvite, hasEmail: true }),
    ).toEqual({ kind: "consented" });
  });

  it("consented wins even if an invite is also outstanding", () => {
    expect(
      consentDisplayState({ consentRecords: consented, outstandingInvite: anInvite, hasEmail: true }),
    ).toEqual({ kind: "consented" });
  });

  it("is invite_outstanding with the invite's expiry when not consented but an invite is in flight", () => {
    expect(
      consentDisplayState({ consentRecords: [], outstandingInvite: anInvite, hasEmail: true }),
    ).toEqual({ kind: "invite_outstanding", expiresAt: anInvite.expiresAt });
  });

  it("invite_outstanding wins over a revoked grant", () => {
    expect(
      consentDisplayState({ consentRecords: revoked, outstandingInvite: anInvite, hasEmail: true }),
    ).toEqual({ kind: "invite_outstanding", expiresAt: anInvite.expiresAt });
  });

  it("is not_consented with canInvite true when an email is reachable", () => {
    expect(
      consentDisplayState({ consentRecords: [], outstandingInvite: noInvite, hasEmail: true }),
    ).toEqual({ kind: "not_consented", canInvite: true });
  });

  it("is not_consented with canInvite false when there is no email to send to", () => {
    expect(
      consentDisplayState({ consentRecords: revoked, outstandingInvite: noInvite, hasEmail: false }),
    ).toEqual({ kind: "not_consented", canInvite: false });
  });
});
