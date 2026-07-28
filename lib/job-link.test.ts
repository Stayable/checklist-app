import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  JOB_LINK_TTL_SECONDS,
  createJobLinkToken,
  jobLinkUrl,
  verifyJobLinkToken,
} from "./job-link";

const JOB = "6f3f4d6e-0f38-4a3f-8f6a-6b1e6f0f1a2b";
const NOW = new Date("2026-07-28T12:00:00.000Z");
const ORIGINAL_SECRET = process.env.AUTH_SECRET;
const ORIGINAL_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-root-secret-value";
  process.env.NEXT_PUBLIC_APP_URL = "https://ops.rentstayable.com";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_URL;
});

describe("round trip", () => {
  it("verifies a freshly minted token and returns the job id", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    expect(verifyJobLinkToken(token, NOW)).toEqual({ ok: true, jobId: JOB });
  });

  it("is still valid one second before expiry", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const justBefore = new Date(NOW.getTime() + (JOB_LINK_TTL_SECONDS - 1) * 1000);
    expect(verifyJobLinkToken(token, justBefore).ok).toBe(true);
  });

  it("is expired exactly at the TTL boundary", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const atExpiry = new Date(NOW.getTime() + JOB_LINK_TTL_SECONDS * 1000);
    expect(verifyJobLinkToken(token, atExpiry)).toEqual({ ok: false, reason: "expired" });
  });

  it("is expired well after the TTL", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(verifyJobLinkToken(token, later).ok).toBe(false);
  });

  it("stays valid on repeated views — read-only links are deliberately reusable", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    for (let i = 0; i < 5; i++) {
      expect(verifyJobLinkToken(token, NOW).ok).toBe(true);
    }
  });
});

describe("tampering", () => {
  it("rejects a token whose job id was swapped", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const [, expiry, sig] = token.split(".");
    const forged = `another-job-id.${expiry}.${sig}`;
    expect(verifyJobLinkToken(forged, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a token whose expiry was pushed out", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const [jobId, expiry, sig] = token.split(".");
    const extended = `${jobId}.${Number(expiry) + 999_999}.${sig}`;
    expect(verifyJobLinkToken(extended, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a garbage signature of the right shape", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    const [jobId, expiry] = token.split(".");
    expect(verifyJobLinkToken(`${jobId}.${expiry}.notasignature`, NOW).ok).toBe(false);
  });

  it("rejects malformed tokens rather than throwing", () => {
    for (const bad of ["", "a", "a.b", "a.b.c.d", "...", `${JOB}.notanumber.sig`]) {
      const res = verifyJobLinkToken(bad, NOW);
      expect(res.ok).toBe(false);
    }
  });

  it("rejects a negative or zero expiry", () => {
    expect(verifyJobLinkToken(`${JOB}.0.sig`, NOW).ok).toBe(false);
    expect(verifyJobLinkToken(`${JOB}.-5.sig`, NOW).ok).toBe(false);
  });

  it("does not accept a token signed with a different root secret", () => {
    const token = createJobLinkToken(JOB, NOW)!;
    process.env.AUTH_SECRET = "a-completely-different-secret";
    expect(verifyJobLinkToken(token, NOW)).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("fail-closed configuration", () => {
  it("mints nothing when AUTH_SECRET is unset", () => {
    delete process.env.AUTH_SECRET;
    expect(createJobLinkToken(JOB, NOW)).toBeNull();
  });

  it("mints nothing when AUTH_SECRET is empty", () => {
    process.env.AUTH_SECRET = "";
    expect(createJobLinkToken(JOB, NOW)).toBeNull();
  });

  it("verifies nothing when AUTH_SECRET is unset — never falls back to a constant key", () => {
    delete process.env.AUTH_SECRET;
    expect(verifyJobLinkToken(`${JOB}.9999999999.sig`, NOW)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("jobLinkUrl", () => {
  it("builds an absolute /j/ URL", () => {
    const url = jobLinkUrl(JOB, NOW)!;
    expect(url.startsWith("https://ops.rentstayable.com/j/")).toBe(true);
  });

  it("round-trips through verification", () => {
    const url = jobLinkUrl(JOB, NOW)!;
    const token = url.split("/j/")[1]!;
    expect(verifyJobLinkToken(token, NOW)).toEqual({ ok: true, jobId: JOB });
  });

  it("tolerates a trailing slash on the configured app URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://ops.rentstayable.com/";
    expect(jobLinkUrl(JOB, NOW)).toContain("rentstayable.com/j/");
    expect(jobLinkUrl(JOB, NOW)).not.toContain("//j/");
  });

  it("returns null with no app URL configured, rather than a relative link", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(jobLinkUrl(JOB, NOW)).toBeNull();
  });
});
