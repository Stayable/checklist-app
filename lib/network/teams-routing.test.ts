import { describe, expect, it } from "vitest";
import {
  describeTeamsRouting,
  GENERAL_TARGET,
  isAnyTeamsWebhookConfigured,
  resolveTeamsWebhook,
  teamsWebhookEnvKey,
} from "./teams-routing";

// Per-channel Teams routing (Kyle 2026-08-01). Env is injected rather than
// mutated on process.env, so precedence is testable without cross-test leakage
// — the pattern spotipo-config.test.ts already uses in this directory.

const GENERAL_URL = "https://example.invalid/general";
const KW_URL = "https://example.invalid/kw";
const LEGACY_URL = "https://example.invalid/legacy-test-channel";

describe("teamsWebhookEnvKey", () => {
  it("names the General var", () => {
    expect(teamsWebhookEnvKey(GENERAL_TARGET)).toBe("TEAMS_WEBHOOK_URL_GENERAL");
  });

  it("names a per-property var from the short code", () => {
    expect(teamsWebhookEnvKey("KW")).toBe("TEAMS_WEBHOOK_URL_KW");
  });

  it("upper-cases a lowercase short code so casing can't cause a silent miss", () => {
    expect(teamsWebhookEnvKey("kw")).toBe("TEAMS_WEBHOOK_URL_KW");
  });
});

describe("resolveTeamsWebhook — General", () => {
  it("resolves from TEAMS_WEBHOOK_URL_GENERAL", () => {
    const r = resolveTeamsWebhook(GENERAL_TARGET, { TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL });
    expect(r).toEqual({ url: GENERAL_URL, envKey: "TEAMS_WEBHOOK_URL_GENERAL", rerouted: false });
  });

  it("falls back to the legacy single-channel var", () => {
    const r = resolveTeamsWebhook(GENERAL_TARGET, { TEAMS_WEBHOOK_URL: LEGACY_URL });
    expect(r?.url).toBe(LEGACY_URL);
    expect(r?.envKey).toBe("TEAMS_WEBHOOK_URL");
  });

  it("prefers the explicit General var over the legacy one", () => {
    const r = resolveTeamsWebhook(GENERAL_TARGET, {
      TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL,
      TEAMS_WEBHOOK_URL: LEGACY_URL,
    });
    expect(r?.url).toBe(GENERAL_URL);
  });

  it("is null when nothing is configured", () => {
    expect(resolveTeamsWebhook(GENERAL_TARGET, {})).toBeNull();
  });

  it("treats whitespace-only as unset, not as a URL", () => {
    expect(resolveTeamsWebhook(GENERAL_TARGET, { TEAMS_WEBHOOK_URL_GENERAL: "   " })).toBeNull();
  });
});

describe("resolveTeamsWebhook — per property", () => {
  it("uses the property's own channel when set", () => {
    const r = resolveTeamsWebhook("KW", {
      TEAMS_WEBHOOK_URL_KW: KW_URL,
      TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL,
    });
    expect(r).toEqual({ url: KW_URL, envKey: "TEAMS_WEBHOOK_URL_KW", rerouted: false });
  });

  it("reroutes to General — flagged — when the property channel is missing", () => {
    const r = resolveTeamsWebhook("KE", { TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL });
    expect(r?.url).toBe(GENERAL_URL);
    // The flag is the point: a rerouted post is a config gap someone should
    // fix, not a normal delivery.
    expect(r?.rerouted).toBe(true);
  });

  it("does NOT route one property's traffic to another property's channel", () => {
    // The nightmare case: a missing KE var silently posting KE outages into
    // Kissimmee West's channel, where the wrong manager acts on them.
    const r = resolveTeamsWebhook("KE", { TEAMS_WEBHOOK_URL_KW: KW_URL });
    expect(r).toBeNull();
  });

  it("does NOT fall back to the legacy test channel for a property", () => {
    // Legacy is General-only on purpose. Otherwise every property's events
    // would land in the old "Network Tickets (test)" channel and look fine.
    const r = resolveTeamsWebhook("KE", { TEAMS_WEBHOOK_URL: LEGACY_URL });
    // It reaches General *because* legacy is General's fallback — but as a
    // flagged reroute, never as a clean per-property delivery.
    expect(r?.rerouted).toBe(true);
    expect(r?.envKey).toBe("TEAMS_WEBHOOK_URL");
  });

  it("is null when neither the property channel nor General exists", () => {
    expect(resolveTeamsWebhook("SA", {})).toBeNull();
  });
});

describe("isAnyTeamsWebhookConfigured", () => {
  it("is false on an empty env", () => {
    expect(isAnyTeamsWebhookConfigured({})).toBe(false);
  });

  it("is false when the only var is empty", () => {
    expect(isAnyTeamsWebhookConfigured({ TEAMS_WEBHOOK_URL_GENERAL: "" })).toBe(false);
  });

  it("is true for General, for legacy, and for a property-only setup", () => {
    expect(isAnyTeamsWebhookConfigured({ TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL })).toBe(true);
    expect(isAnyTeamsWebhookConfigured({ TEAMS_WEBHOOK_URL: LEGACY_URL })).toBe(true);
    expect(isAnyTeamsWebhookConfigured({ TEAMS_WEBHOOK_URL_KW: KW_URL })).toBe(true);
  });

  it("ignores unrelated env vars", () => {
    expect(isAnyTeamsWebhookConfigured({ SPOTIPO_API_KEY: "x", DATABASE_URL: "y" })).toBe(false);
  });
});

describe("describeTeamsRouting", () => {
  const codes = ["JN", "JW", "KE", "KW", "LL", "OR", "SA", "DP"];

  it("reports every target, General first", () => {
    const rows = describeTeamsRouting(codes, {});
    expect(rows).toHaveLength(9);
    expect(rows[0]?.target).toBe(GENERAL_TARGET);
    expect(rows.every((r) => !r.configured)).toBe(true);
  });

  it("distinguishes configured, rerouted and missing", () => {
    const rows = describeTeamsRouting(codes, {
      TEAMS_WEBHOOK_URL_GENERAL: GENERAL_URL,
      TEAMS_WEBHOOK_URL_KW: KW_URL,
    });
    const kw = rows.find((r) => r.target === "KW")!;
    const ke = rows.find((r) => r.target === "KE")!;
    expect(kw).toMatchObject({ configured: true, source: "TEAMS_WEBHOOK_URL_KW", rerouted: false });
    // KE resolves (so notifications aren't lost) but is flagged as rerouted,
    // which is what an ops view needs to show as "not really set up".
    expect(ke).toMatchObject({ configured: true, rerouted: true });
  });

  it("never leaks URL material", () => {
    const json = JSON.stringify(
      describeTeamsRouting(codes, { TEAMS_WEBHOOK_URL_KW: `${KW_URL}?sig=SECRET` }),
    );
    expect(json).not.toContain("SECRET");
    expect(json).not.toContain(KW_URL);
  });
});
