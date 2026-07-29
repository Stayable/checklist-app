// E.164 normalization for a US/Florida-based workforce. Deliberately dependency-free
// (no libphonenumber-js): the roster is US, and the accepted-input surface is small
// and fully enumerated in lib/phone.test.ts. Non-US numbers must be entered in full
// E.164 (leading `+` and country code) — surfaced in the invite form's helper text.

export type PhoneError = "empty" | "too_short" | "too_long" | "invalid_chars" | "unsupported";

export type PhoneResult = { ok: true; e164: string } | { ok: false; error: PhoneError };

// E.164 allows at most 15 digits; the shortest plausible international number is 8.
const MAX_E164_DIGITS = 15;
const MIN_E164_DIGITS = 8;

export function normalizePhone(input: string): PhoneResult {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, error: "empty" };

  const hadPlus = trimmed.startsWith("+");
  // Strip the punctuation people actually type; anything else is a hard reject so
  // that "407-CALL-NOW" never silently becomes a number.
  const stripped = (hadPlus ? trimmed.slice(1) : trimmed).replace(/[\s().\-–—]/g, "");
  if (!/^[0-9]+$/.test(stripped)) return { ok: false, error: "invalid_chars" };

  if (hadPlus) {
    if (stripped.length < MIN_E164_DIGITS) return { ok: false, error: "too_short" };
    if (stripped.length > MAX_E164_DIGITS) return { ok: false, error: "too_long" };
    return { ok: true, e164: `+${stripped}` };
  }

  // No `+` → assume US (NANP).
  if (stripped.length === 10) return { ok: true, e164: `+1${stripped}` };
  if (stripped.length === 11) {
    if (!stripped.startsWith("1")) return { ok: false, error: "unsupported" };
    return { ok: true, e164: `+${stripped}` };
  }
  if (stripped.length < 10) return { ok: false, error: "too_short" };
  return { ok: false, error: "unsupported" };
}

/** Human-readable form for UI. US numbers get (AAA) NNN-NNNN; others pass through. */
export function formatPhoneDisplay(e164: string): string {
  const m = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(e164);
  if (!m) return e164;
  return `(${m[1]}) ${m[2]}-${m[3]}`;
}
