import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a webhook's HMAC-SHA256 signature.
 *
 * ASSUMED SCHEME (spec §3.3 — vendor's exact scheme is unconfirmed pending a
 * live controller capture): the `x-webhook-signature` header carries
 * `sha256=<hexdigest>` where `hexdigest = HMAC-SHA256(rawBody, secret)`. The
 * `sha256=` prefix is optional/stripped. This MUST be verified against a real
 * UniFi controller / Aruba Instant On portal delivery before go-live — if the
 * real scheme differs (different header name, different digest encoding,
 * timestamp+body signing, etc.), this function needs to change.
 *
 * Comparison is constant-time (`timingSafeEqual`) to avoid leaking signature
 * bytes via timing. Any malformed input (missing header/secret, non-hex
 * signature, wrong length) returns false rather than throwing.
 */
export function verifyHmacSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;

  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const providedBuf = Buffer.from(provided, "hex");
  const expectedBuf = Buffer.from(expected, "hex");

  // Buffer.from(str, "hex") silently truncates at the first invalid hex
  // character rather than throwing, so a malformed signature surfaces here
  // as a length mismatch — safe to reject without ever calling
  // timingSafeEqual on unequal-length buffers (which throws).
  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}
