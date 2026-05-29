// Account lockout policy (ADR-008): 5 failed login attempts within a 15-minute
// window locks the account for 30 minutes. Pure functions so the decision logic
// is unit-testable in isolation from Auth.js and Prisma.

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 30 * 60 * 1000;

export type ThrottleState = {
  failedLoginAttempts: number;
  lastFailedLoginAt: Date | null;
  lockedUntil: Date | null;
};

/** True while the account is inside an active lockout window. */
export function isLocked(
  state: Pick<ThrottleState, "lockedUntil">,
  now: Date,
): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * Next throttle state after a FAILED attempt. The failure counter only
 * accumulates within ATTEMPT_WINDOW_MS of the previous failure; an older
 * failure resets the count to 1. On hitting the cap the account is locked and
 * the counter is cleared so the window starts fresh after the lock expires.
 */
export function registerFailure(state: ThrottleState, now: Date): ThrottleState {
  const withinWindow =
    state.lastFailedLoginAt !== null &&
    now.getTime() - state.lastFailedLoginAt.getTime() <= ATTEMPT_WINDOW_MS;
  const attempts = withinWindow ? state.failedLoginAttempts + 1 : 1;
  const locked = attempts >= MAX_FAILED_ATTEMPTS;
  return {
    failedLoginAttempts: locked ? 0 : attempts,
    lastFailedLoginAt: now,
    lockedUntil: locked ? new Date(now.getTime() + LOCKOUT_MS) : null,
  };
}

/** Cleared throttle state after a successful login. */
export function registerSuccess(): ThrottleState {
  return { failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null };
}
