import { describe, expect, it } from "vitest";
import {
  ATTEMPT_WINDOW_MS,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  isLocked,
  registerFailure,
  registerSuccess,
  type ThrottleState,
} from "./auth-throttle";

// ADR-008: 5 failed attempts within 15 min → 30-min lock. These tests inject
// `now` explicitly so the time-window logic is exercised without real clocks.

const FRESH: ThrottleState = {
  failedLoginAttempts: 0,
  lastFailedLoginAt: null,
  lockedUntil: null,
};

const T0 = new Date("2026-05-30T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("registerFailure", () => {
  it("counts consecutive in-window failures up to the cap", () => {
    let state = FRESH;
    // 4 failures, each 1 minute apart — all within the 15-min window.
    for (let i = 1; i <= MAX_FAILED_ATTEMPTS - 1; i++) {
      state = registerFailure(state, at(i * 60_000));
      expect(state.failedLoginAttempts).toBe(i);
      expect(state.lockedUntil).toBeNull();
    }
  });

  it("locks the account on the 5th in-window failure", () => {
    let state = FRESH;
    for (let i = 1; i <= MAX_FAILED_ATTEMPTS; i++) {
      state = registerFailure(state, at(i * 60_000));
    }
    // On the cap the counter clears and a lock is set 30 min out.
    expect(state.failedLoginAttempts).toBe(0);
    expect(state.lockedUntil).not.toBeNull();
    expect(state.lockedUntil!.getTime()).toBe(at(MAX_FAILED_ATTEMPTS * 60_000).getTime() + LOCKOUT_MS);
  });

  it("resets the counter to 1 when the prior failure is older than the window", () => {
    let state = registerFailure(FRESH, at(0));
    expect(state.failedLoginAttempts).toBe(1);
    // Next failure just past the 15-min window — should start a fresh count.
    state = registerFailure(state, at(ATTEMPT_WINDOW_MS + 1));
    expect(state.failedLoginAttempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });

  it("counts a failure exactly at the window boundary as in-window", () => {
    let state = registerFailure(FRESH, at(0));
    state = registerFailure(state, at(ATTEMPT_WINDOW_MS));
    expect(state.failedLoginAttempts).toBe(2);
  });

  it("does not lock if 5 failures straddle a window reset", () => {
    let state = FRESH;
    // 4 quick failures...
    for (let i = 0; i < 4; i++) state = registerFailure(state, at(i * 1000));
    expect(state.failedLoginAttempts).toBe(4);
    // ...then a 5th failure after the window lapsed — resets to 1, no lock.
    state = registerFailure(state, at(ATTEMPT_WINDOW_MS + 10_000));
    expect(state.failedLoginAttempts).toBe(1);
    expect(state.lockedUntil).toBeNull();
  });
});

describe("isLocked", () => {
  it("is true before the lock expires", () => {
    const lockedUntil = at(LOCKOUT_MS);
    expect(isLocked({ lockedUntil }, at(LOCKOUT_MS - 1))).toBe(true);
  });

  it("is false once the lock has expired (30 min unlock)", () => {
    const lockedUntil = at(LOCKOUT_MS);
    expect(isLocked({ lockedUntil }, at(LOCKOUT_MS))).toBe(false);
    expect(isLocked({ lockedUntil }, at(LOCKOUT_MS + 1))).toBe(false);
  });

  it("is false when there is no lock", () => {
    expect(isLocked({ lockedUntil: null }, T0)).toBe(false);
  });
});

describe("registerSuccess", () => {
  it("clears all throttle state", () => {
    const dirty: ThrottleState = {
      failedLoginAttempts: 4,
      lastFailedLoginAt: T0,
      lockedUntil: at(LOCKOUT_MS),
    };
    void dirty;
    expect(registerSuccess()).toEqual({
      failedLoginAttempts: 0,
      lastFailedLoginAt: null,
      lockedUntil: null,
    });
  });
});
