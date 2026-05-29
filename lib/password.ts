import { randomInt } from "crypto";

// Temporary-password generation for admin-initiated provisioning and one-click
// resets. Resend email delivery is deferred (CLAUDE.md), so v1 surfaces the
// temp password once to the admin, who conveys it out-of-band. The user is
// expected to change it on first login (enforcement is a later phase).

// Excludes ambiguous characters (0/O, 1/l/I) for read-aloud reliability.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** A 12-char random temp password from an unambiguous alphabet. */
export function generateTempPassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
