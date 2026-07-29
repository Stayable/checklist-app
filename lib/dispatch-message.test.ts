import { describe, expect, it } from "vitest";
import { Trade } from "@prisma/client";
import {
  buildDispatchMessage,
  normalizePhoneForWa,
  telHref,
  waMeUrl,
  type DispatchMessageInput,
} from "./dispatch-message";

describe("normalizePhoneForWa", () => {
  it("strips punctuation and spaces", () => {
    expect(normalizePhoneForWa("+1 (555) 010-2030")).toBe("15550102030");
  });

  it("trims a 00 international prefix to E.164 digits", () => {
    expect(normalizePhoneForWa("0044 7700 900123")).toBe("447700900123");
  });

  it("returns null for null, empty and junk input", () => {
    expect(normalizePhoneForWa(null)).toBeNull();
    expect(normalizePhoneForWa(undefined)).toBeNull();
    expect(normalizePhoneForWa("")).toBeNull();
    expect(normalizePhoneForWa("n/a")).toBeNull();
  });

  it("returns null for a number too short to be routable", () => {
    expect(normalizePhoneForWa("5551234")).toBeNull();
  });
});

describe("telHref", () => {
  it("keeps a leading + for E.164", () => {
    expect(telHref("+1 555 010 2030")).toBe("tel:+15550102030");
  });

  it("omits + when the source had none", () => {
    expect(telHref("555 010 2030")).toBe("tel:5550102030");
  });

  it("returns null when there is no usable number", () => {
    expect(telHref(null)).toBeNull();
    expect(telHref("ask reception")).toBeNull();
  });
});

const BASE: DispatchMessageInput = {
  propertyName: "Kissimmee West",
  propertyShortCode: "KW",
  roomLabel: "Rm 212",
  trade: Trade.PLUMBING,
  problem: "Burst pipe under the sink, water on the floor",
  urgent: false,
  jobUrl: "https://ops.rentstayable.com/j/tok",
  contractorName: "Orlando",
};

describe("buildDispatchMessage", () => {
  it("includes property, room, trade, problem and the link in English", () => {
    const msg = buildDispatchMessage(BASE, "en");
    expect(msg).toContain("Hi Orlando,");
    expect(msg).toContain("Kissimmee West (KW)");
    expect(msg).toContain("Rm 212");
    expect(msg).toContain("Plumbing");
    expect(msg).toContain("Burst pipe under the sink");
    expect(msg).toContain("https://ops.rentstayable.com/j/tok");
  });

  it("writes Spanish for a Spanish-speaking contractor", () => {
    const msg = buildDispatchMessage(BASE, "es");
    expect(msg).toContain("Hola Orlando:");
    expect(msg).toContain("Ubicación: Rm 212");
    expect(msg).toContain("Problema:");
    expect(msg).toContain("¿Puede atenderlo?");
    expect(msg).not.toContain("Hi Orlando");
  });

  it("marks an urgent job at the very top, in the right language", () => {
    expect(buildDispatchMessage({ ...BASE, urgent: true }, "en").startsWith("*URGENT*")).toBe(true);
    expect(buildDispatchMessage({ ...BASE, urgent: true }, "es").startsWith("*URGENTE*")).toBe(true);
  });

  it("omits the location line entirely when there is no room label", () => {
    const msg = buildDispatchMessage({ ...BASE, roomLabel: null }, "en");
    expect(msg).not.toContain("Where:");
    expect(msg).toContain("Kissimmee West");
  });

  it("omits the details line when no link could be minted", () => {
    const msg = buildDispatchMessage({ ...BASE, jobUrl: null }, "en");
    expect(msg).not.toContain("Details and photos");
    expect(msg).toContain("Burst pipe");
  });

  it("passes the problem text through verbatim rather than summarising it", () => {
    const problem = "Guest reports NO hot water since 6am — 2nd floor, east wing only";
    const msg = buildDispatchMessage({ ...BASE, problem }, "en");
    expect(msg).toContain(problem);
  });

  it("falls back to English for an unexpected locale value", () => {
    const msg = buildDispatchMessage(BASE, "fr" as "en");
    expect(msg).toContain("Hi Orlando,");
  });
});

describe("waMeUrl", () => {
  it("builds a wa.me link with the message percent-encoded", () => {
    const url = waMeUrl("+1 555 010 2030", "Hola: ¿puede venir?")!;
    expect(url.startsWith("https://wa.me/15550102030?text=")).toBe(true);
    // Spaces and non-ASCII must be encoded or WhatsApp truncates the message.
    expect(url).not.toContain(" ");
    expect(url).toContain("%C2%BF"); // ¿
  });

  it("survives a message containing newlines and asterisks", () => {
    const url = waMeUrl("15550102030", "*URGENT*\nline two")!;
    expect(url).toContain("%0A");
    expect(url).toContain("*URGENT*".replace(/\*/g, "*"));
  });

  it("returns null when the contractor has no WhatsApp number", () => {
    expect(waMeUrl(null, "hi")).toBeNull();
    expect(waMeUrl("", "hi")).toBeNull();
    expect(waMeUrl("123", "hi")).toBeNull();
  });
});
