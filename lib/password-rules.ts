// Password RULES only — no node builtins, so this is safe to import from a
// client component.
//
// Split out of lib/password.ts on 2026-09-08: that module imports `crypto` for
// temp-password generation, and importing it from the /forgot-password client
// page dragged a crypto polyfill into the browser bundle (289 kB first load
// against /login's 159 kB). The generator stays server-only; the rules, which
// both sides need to agree on, live here.

/** Minimum length for a user-chosen password (admin set-password + self-service). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Returns an error message if the password is too weak, else null. Shared by the
 * admin "Set password" action, the self-service profile change and the password
 * reset flow so all of them enforce the same rule at the API boundary — and by
 * the reset form so the button disables on the same threshold the server uses.
 */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
