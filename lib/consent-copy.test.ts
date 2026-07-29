import { describe, expect, it } from "vitest";
import { ConsentChannel } from "@prisma/client";
import { CONSENT_CHANNELS, POLICY_VERSION, consentCopy } from "./consent-copy";

describe("consent copy", () => {
  it("pins the policy version", () => {
    expect(POLICY_VERSION).toBe("2026-07-29.1");
  });

  it("grants WhatsApp and SMS, not email", () => {
    expect(CONSENT_CHANNELS).toEqual([ConsentChannel.WHATSAPP, ConsentChannel.SMS]);
  });

  // Each of these is a Twilio A2P requirement (docs/assets/TwilioConsentRequirements_*).
  // If a phrase is edited out, the registration answer becomes untrue.
  it.each([
    ["names SMS", /SMS/],
    ["names WhatsApp", /WhatsApp/],
    ["states frequency", /0–10 messages per week/],
    ["discloses rates", /Message and data rates may apply/],
    ["gives HELP", /Reply HELP/],
    ["gives STOP", /STOP to opt out/],
    ["states consent is optional", /Consent is optional/],
    ["links terms", /Terms and Conditions/],
    ["links privacy", /Privacy Policy/],
  ])("EN copy %s", (_label, pattern) => {
    expect(consentCopy("en")).toMatch(pattern);
  });

  it.each([
    ["names SMS", /SMS/],
    ["names WhatsApp", /WhatsApp/],
    ["discloses rates", /tarifas de mensajes y datos/],
    ["gives HELP", /HELP/],
    ["gives STOP", /STOP/],
    ["states consent is optional", /consentimiento es opcional/],
  ])("ES copy %s", (_label, pattern) => {
    expect(consentCopy("es")).toMatch(pattern);
  });

  it("falls back to EN for an unknown locale", () => {
    expect(consentCopy("de" as "en")).toBe(consentCopy("en"));
  });
});
