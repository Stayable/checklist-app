import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_MS,
  generateInviteToken,
  hashInviteToken,
  inviteState,
  inviteTokenMatches,
  buildInviteUrl,
} from "./invite";

describe("invite tokens", () => {
  it("mints distinct, URL-safe, high-entropy tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it("hashes deterministically and does not echo the token", () => {
    const t = generateInviteToken();
    expect(hashInviteToken(t)).toBe(hashInviteToken(t));
    expect(hashInviteToken(t)).not.toContain(t);
    expect(hashInviteToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a correct token and rejects a wrong one", () => {
    const t = generateInviteToken();
    const h = hashInviteToken(t);
    expect(inviteTokenMatches(t, h)).toBe(true);
    expect(inviteTokenMatches(generateInviteToken(), h)).toBe(false);
  });

  it("rejects a malformed hash without throwing", () => {
    expect(inviteTokenMatches(generateInviteToken(), "not-a-hash")).toBe(false);
    expect(inviteTokenMatches(generateInviteToken(), "")).toBe(false);
  });

  it("has a 7-day TTL", () => {
    expect(INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("inviteState", () => {
  const now = new Date("2026-07-30T12:00:00Z");
  const future = new Date("2026-08-05T12:00:00Z");
  const past = new Date("2026-07-29T12:00:00Z");

  it("is valid when unexpired, unconsumed, unrevoked", () => {
    expect(inviteState({ expiresAt: future, consumedAt: null, revokedAt: null }, now)).toBe("valid");
  });

  it("is expired past expiresAt", () => {
    expect(inviteState({ expiresAt: past, consumedAt: null, revokedAt: null }, now)).toBe("expired");
  });

  it("is consumed once used", () => {
    expect(inviteState({ expiresAt: future, consumedAt: past, revokedAt: null }, now)).toBe("consumed");
  });

  it("is revoked when revoked", () => {
    expect(inviteState({ expiresAt: future, consumedAt: null, revokedAt: past }, now)).toBe("revoked");
  });

  it("reports revoked before consumed before expired when several apply", () => {
    expect(inviteState({ expiresAt: past, consumedAt: past, revokedAt: past }, now)).toBe("revoked");
    expect(inviteState({ expiresAt: past, consumedAt: past, revokedAt: null }, now)).toBe("consumed");
  });
});

describe("buildInviteUrl", () => {
  it("builds an absolute URL and strips a trailing slash on the base", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    expect(buildInviteUrl("abc")).toBe("https://example.com/invite/abc");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });

  it("falls back to the production origin when the env is unset", () => {
    const prev = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildInviteUrl("xyz")).toBe("https://ops.rentstayable.com/invite/xyz");
    process.env.NEXT_PUBLIC_APP_URL = prev;
  });
});
