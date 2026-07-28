import { describe, expect, it } from "vitest";
import {
  describeSpotipoConfig,
  isSpotipoConfiguredFor,
  resolveSpotipoConfig,
  spotipoEnvKeys,
  type SpotipoProperty,
} from "./spotipo-config";

function prop(over: Partial<SpotipoProperty> = {}): SpotipoProperty {
  return { shortCode: "KW", spotipoSiteId: null, spotipoApiKey: null, ...over };
}

describe("spotipoEnvKeys", () => {
  it("builds upper-cased names from the short code", () => {
    expect(spotipoEnvKeys("kw")).toEqual({
      siteId: "SPOTIPO_SITE_ID_KW",
      apiKey: "SPOTIPO_API_KEY_KW",
    });
  });
});

describe("resolveSpotipoConfig — precedence", () => {
  it("prefers a per-site env key over the account key and the database", () => {
    const cfg = resolveSpotipoConfig(prop({ spotipoApiKey: "db-key", spotipoSiteId: "db-site" }), {
      SPOTIPO_API_KEY_KW: "site-key",
      SPOTIPO_API_KEY: "account-key",
    });
    expect(cfg).toEqual({ siteId: "db-site", apiKey: "site-key" });
  });

  it("falls back to the account-wide key when no per-site key exists", () => {
    const cfg = resolveSpotipoConfig(prop({ spotipoSiteId: "db-site" }), {
      SPOTIPO_API_KEY: "account-key",
    });
    expect(cfg?.apiKey).toBe("account-key");
  });

  it("falls back to the database key when no env key exists at all", () => {
    const cfg = resolveSpotipoConfig(prop({ spotipoSiteId: "s", spotipoApiKey: "db-key" }), {});
    expect(cfg?.apiKey).toBe("db-key");
  });

  it("prefers a per-site env site id over the database column", () => {
    const cfg = resolveSpotipoConfig(prop({ spotipoSiteId: "db-site", spotipoApiKey: "k" }), {
      SPOTIPO_SITE_ID_KW: "env-site",
    });
    expect(cfg?.siteId).toBe("env-site");
  });

  it("reads each property's own env vars, not another property's", () => {
    const env = { SPOTIPO_SITE_ID_KW: "kw-site", SPOTIPO_API_KEY_KW: "kw-key" };
    expect(resolveSpotipoConfig(prop({ shortCode: "KW" }), env)).toEqual({
      siteId: "kw-site",
      apiKey: "kw-key",
    });
    expect(resolveSpotipoConfig(prop({ shortCode: "JW" }), env)).toBeNull();
  });
});

describe("resolveSpotipoConfig — unconfigured and half-configured", () => {
  it("is null with nothing set anywhere", () => {
    expect(resolveSpotipoConfig(prop(), {})).toBeNull();
  });

  it("is null with a key but no site id", () => {
    expect(resolveSpotipoConfig(prop(), { SPOTIPO_API_KEY: "k" })).toBeNull();
  });

  it("is null with a site id but no key — half-configured must not read as ready", () => {
    expect(resolveSpotipoConfig(prop({ spotipoSiteId: "s" }), {})).toBeNull();
  });

  it("treats empty and whitespace-only values as unset", () => {
    expect(
      resolveSpotipoConfig(prop({ spotipoSiteId: "   ", spotipoApiKey: "" }), {
        SPOTIPO_API_KEY: "   ",
      }),
    ).toBeNull();
  });

  it("trims surrounding whitespace from pasted values", () => {
    const cfg = resolveSpotipoConfig(prop(), {
      SPOTIPO_SITE_ID_KW: "  site-123  ",
      SPOTIPO_API_KEY: " key-abc\n",
    });
    expect(cfg).toEqual({ siteId: "site-123", apiKey: "key-abc" });
  });
});

describe("isSpotipoConfiguredFor", () => {
  it("mirrors resolve", () => {
    expect(isSpotipoConfiguredFor(prop(), {})).toBe(false);
    expect(
      isSpotipoConfiguredFor(prop(), { SPOTIPO_SITE_ID_KW: "s", SPOTIPO_API_KEY: "k" }),
    ).toBe(true);
  });
});

describe("describeSpotipoConfig", () => {
  it("reports where each value came from, without leaking the value", () => {
    const rows = describeSpotipoConfig(
      [prop({ shortCode: "KW" }), prop({ shortCode: "JW", spotipoSiteId: "db", spotipoApiKey: "dbk" })],
      { SPOTIPO_SITE_ID_KW: "s", SPOTIPO_API_KEY: "k" },
    );

    expect(rows[0]).toEqual({
      shortCode: "KW",
      configured: true,
      siteIdSource: "SPOTIPO_SITE_ID_KW",
      keySource: "SPOTIPO_API_KEY",
    });
    // JW has its own DB values, but the account-wide env key still outranks the
    // DB column — so the reported key source is the env var, not "database".
    expect(rows[1]).toEqual({
      shortCode: "JW",
      configured: true,
      siteIdSource: "database",
      keySource: "SPOTIPO_API_KEY",
    });
    // No secret should appear anywhere in the diagnostic output.
    expect(JSON.stringify(rows)).not.toContain("dbk");
  });

  it("reports the database as the source only when no env key exists", () => {
    const rows = describeSpotipoConfig(
      [prop({ shortCode: "JW", spotipoSiteId: "db", spotipoApiKey: "dbk" })],
      {},
    );
    expect(rows[0]).toEqual({
      shortCode: "JW",
      configured: true,
      siteIdSource: "database",
      keySource: "database",
    });
  });

  it("marks missing pieces as missing", () => {
    const rows = describeSpotipoConfig([prop({ shortCode: "LL" })], {});
    expect(rows[0]).toMatchObject({ configured: false, siteIdSource: "missing", keySource: "missing" });
  });
});
