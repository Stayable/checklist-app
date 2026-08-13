import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrl, appUrl, DEFAULT_APP_ORIGIN } from "./app-url";

const original = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = original;
});

describe("appBaseUrl", () => {
  it("falls back to the production origin when unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(appBaseUrl()).toBe(DEFAULT_APP_ORIGIN);
  });

  it("falls back when set to an empty or whitespace value", () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    expect(appBaseUrl()).toBe(DEFAULT_APP_ORIGIN);
  });

  it("uses the configured origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.example.com";
    expect(appBaseUrl()).toBe("https://staging.example.com");
  });

  it("strips a trailing slash so callers can append a path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ops.example.com/";
    expect(appUrl("/network")).toBe("https://ops.example.com/network");
  });

  it("adds a scheme to a bare host — without one the link is still relative", () => {
    process.env.NEXT_PUBLIC_APP_URL = "ops.example.com";
    expect(appBaseUrl()).toBe("https://ops.example.com");
  });
});

describe("appUrl", () => {
  it("is always absolute, whatever the env holds", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    for (const path of ["/network", "network", "/network/tickets/abc"]) {
      expect(appUrl(path)).toMatch(/^https:\/\//);
    }
  });

  it("tolerates a missing leading slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ops.example.com";
    expect(appUrl("network")).toBe("https://ops.example.com/network");
  });
});
