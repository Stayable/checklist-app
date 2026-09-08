import { beforeEach, describe, expect, it, vi } from "vitest";
import { OtpPurpose } from "@prisma/client";

// The action pulls in the Prisma singleton and Resend. Neither is exercised
// here — what is under test is the branching: who gets told what, which
// `purpose` is written and read, and when a code is spent.
const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  otpFindFirst: vi.fn(),
  otpCreate: vi.fn(),
  otpUpdate: vi.fn(),
  otpUpdateMany: vi.fn(),
  notifCreate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  sendReset: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    loginOtp: {
      findFirst: mocks.otpFindFirst,
      create: mocks.otpCreate,
      update: mocks.otpUpdate,
      updateMany: mocks.otpUpdateMany,
    },
    notificationLog: { create: mocks.notifCreate },
    auditLog: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/email", () => ({ sendPasswordResetEmail: mocks.sendReset }));

import { hashOtp } from "@/lib/otp";
import { requestPasswordReset, confirmPasswordReset } from "./actions";

const PEPPER = "test-secret";
const ACTIVE_USER = {
  id: "u1",
  email: "erika@rentstayable.com",
  locale: "en",
  active: true,
};

function liveCode(code: string, over: Record<string, unknown> = {}) {
  return {
    id: "otp1",
    userId: "u1",
    codeHash: hashOtp(code, PEPPER),
    purpose: OtpPurpose.PASSWORD_RESET,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    consumedAt: null,
    attempts: 0,
    createdAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
  process.env.AUTH_SECRET = PEPPER;
  mocks.transaction.mockResolvedValue([]);
  mocks.sendReset.mockResolvedValue({ ok: true });
  mocks.notifCreate.mockResolvedValue({});
});

describe("requestPasswordReset — enumeration resistance", () => {
  it("an unknown address returns the same shape as a real one, and sends nothing", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(requestPasswordReset("nobody@example.com")).resolves.toEqual({ ok: true });
    expect(mocks.sendReset).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("a DEACTIVATED account is indistinguishable from an unknown one", async () => {
    mocks.userFindUnique.mockResolvedValue({ ...ACTIVE_USER, active: false });
    await expect(requestPasswordReset(ACTIVE_USER.email)).resolves.toEqual({ ok: true });
    expect(mocks.sendReset).not.toHaveBeenCalled();
  });

  it("a real active account also returns bare ok — no extra field to compare", async () => {
    mocks.userFindUnique.mockResolvedValue(ACTIVE_USER);
    mocks.otpFindFirst.mockResolvedValue(null);
    await expect(requestPasswordReset(ACTIVE_USER.email)).resolves.toEqual({ ok: true });
    expect(mocks.sendReset).toHaveBeenCalledOnce();
  });

  it("a malformed address is reported, since a typo leaks nothing", async () => {
    await expect(requestPasswordReset("not-an-email")).resolves.toEqual({
      ok: false,
      error: "invalid_email",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});

describe("requestPasswordReset — issuing", () => {
  it("writes the code as PASSWORD_RESET and supersedes only reset codes", async () => {
    mocks.userFindUnique.mockResolvedValue(ACTIVE_USER);
    mocks.otpFindFirst.mockResolvedValue(null);

    await requestPasswordReset(ACTIVE_USER.email);

    expect(mocks.otpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purpose: OtpPurpose.PASSWORD_RESET, userId: "u1" }),
      }),
    );
    // The supersede must be scoped, or signing out a login code would kill a
    // reset in progress and vice versa.
    expect(mocks.otpUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: OtpPurpose.PASSWORD_RESET }),
      }),
    );
  });

  it("refuses to issue with no AUTH_SECRET rather than pepper-less hashing", async () => {
    process.env.AUTH_SECRET = "";
    mocks.userFindUnique.mockResolvedValue(ACTIVE_USER);
    await expect(requestPasswordReset(ACTIVE_USER.email)).resolves.toEqual({
      ok: false,
      error: "email_failed",
    });
    expect(mocks.otpCreate).not.toHaveBeenCalled();
  });

  it("a second request inside the cooldown is throttled, not silently dropped", async () => {
    mocks.userFindUnique.mockResolvedValue(ACTIVE_USER);
    mocks.otpFindFirst.mockResolvedValue({ id: "recent" });
    await expect(requestPasswordReset(ACTIVE_USER.email)).resolves.toEqual({
      ok: false,
      error: "throttled",
    });
    expect(mocks.sendReset).not.toHaveBeenCalled();
  });

  it("reports a send failure instead of pointing at an inbox that stays empty", async () => {
    mocks.userFindUnique.mockResolvedValue(ACTIVE_USER);
    mocks.otpFindFirst.mockResolvedValue(null);
    mocks.sendReset.mockResolvedValue({ ok: false, error: "email_not_configured" });
    await expect(requestPasswordReset(ACTIVE_USER.email)).resolves.toEqual({
      ok: false,
      error: "email_failed",
    });
    // Still logged, so a misconfigured Resend key is visible after the fact.
    expect(mocks.notifCreate).toHaveBeenCalledOnce();
  });

  it("uses the Spanish copy for an es user (ADR-013)", async () => {
    mocks.userFindUnique.mockResolvedValue({ ...ACTIVE_USER, locale: "es" });
    mocks.otpFindFirst.mockResolvedValue(null);
    await requestPasswordReset(ACTIVE_USER.email);
    expect(mocks.sendReset).toHaveBeenCalledWith(ACTIVE_USER.email, expect.any(String), "es");
  });
});

describe("confirmPasswordReset", () => {
  it("accepts the right code and sets the password", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));

    await expect(
      confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password"),
    ).resolves.toEqual({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });

  it("only ever looks for a PASSWORD_RESET code", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));
    await confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password");
    expect(mocks.otpFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: OtpPurpose.PASSWORD_RESET }),
      }),
    );
  });

  it("counts a wrong code against the row without spending it", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));

    await expect(
      confirmPasswordReset(ACTIVE_USER.email, "000000", "a-good-password"),
    ).resolves.toEqual({ ok: false, error: "code" });
    expect(mocks.otpUpdate).toHaveBeenCalledWith({
      where: { id: "otp1" },
      data: { attempts: { increment: 1 } },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses an expired code", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(
      liveCode("123456", { expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password"),
    ).resolves.toEqual({ ok: false, error: "code" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a burnt-out code even when the digits are right", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456", { attempts: 5 }));
    await expect(
      confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password"),
    ).resolves.toEqual({ ok: false, error: "code" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a weak password BEFORE spending the code", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));

    const res = await confirmPasswordReset(ACTIVE_USER.email, "123456", "short");
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ error: "weak" });
    // The code survives, so the user retries without a fresh email.
    expect(mocks.otpFindFirst).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("gives a deactivated account the same generic answer as a bad code", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: false });
    await expect(
      confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password"),
    ).resolves.toEqual({ ok: false, error: "code" });
  });

  it("clears the lockout and mustChangePassword on success", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));

    await confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password");

    // A successful reset that still left the account locked would be useless.
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mustChangePassword: false,
          lockedUntil: null,
          failedLoginAttempts: 0,
        }),
      }),
    );
  });

  it("records the reset as self-service in the audit log", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "u1", active: true });
    mocks.otpFindFirst.mockResolvedValue(liveCode("123456"));

    await confirmPasswordReset(ACTIVE_USER.email, "123456", "a-good-password");

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "self_password_reset",
          actorUserId: "u1",
          entityId: "u1",
        }),
      }),
    );
  });
});
