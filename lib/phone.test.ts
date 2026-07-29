import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalizes a bare US 10-digit number", () => {
    expect(normalizePhone("4075551234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("strips US formatting punctuation", () => {
    expect(normalizePhone("(407) 555-1234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone("407.555.1234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone(" 407 555 1234 ")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts US 11-digit with a leading 1", () => {
    expect(normalizePhone("14075551234")).toEqual({ ok: true, e164: "+14075551234" });
    expect(normalizePhone("1 (407) 555-1234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts already-E.164 input", () => {
    expect(normalizePhone("+14075551234")).toEqual({ ok: true, e164: "+14075551234" });
  });

  it("accepts non-US E.164 input", () => {
    expect(normalizePhone("+525512345678")).toEqual({ ok: true, e164: "+525512345678" });
  });

  it("collapses every US spelling to one canonical value", () => {
    const forms = ["+1 407 555 1234", "(407) 555-1234", "4075551234", "1-407-555-1234"];
    const out = new Set(forms.map((f) => (normalizePhone(f) as { e164: string }).e164));
    expect(out).toEqual(new Set(["+14075551234"]));
  });

  it("rejects empty input", () => {
    expect(normalizePhone("")).toEqual({ ok: false, error: "empty" });
    expect(normalizePhone("   ")).toEqual({ ok: false, error: "empty" });
  });

  it("rejects letters", () => {
    expect(normalizePhone("407-CALL-NOW")).toEqual({ ok: false, error: "invalid_chars" });
  });

  it("rejects too-short and too-long numbers", () => {
    expect(normalizePhone("5551234")).toEqual({ ok: false, error: "too_short" });
    expect(normalizePhone("+1234567890123456789")).toEqual({ ok: false, error: "too_long" });
  });

  it("rejects a bare 11-digit number not starting with 1", () => {
    expect(normalizePhone("24075551234")).toEqual({ ok: false, error: "unsupported" });
  });
});

describe("formatPhoneDisplay", () => {
  it("formats US numbers readably", () => {
    expect(formatPhoneDisplay("+14075551234")).toBe("(407) 555-1234");
  });

  it("returns non-US E.164 unchanged", () => {
    expect(formatPhoneDisplay("+525512345678")).toBe("+525512345678");
  });
});
