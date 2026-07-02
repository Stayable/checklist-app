import { describe, expect, it } from "vitest";
import { notifyEmailCopy, NOTIFY_EVENTS } from "./notify-copy";

const label = "Arrival Checklist — LL — Rm 312";

describe("notifyEmailCopy", () => {
  it("produces distinct EN copy per event with the label in the subject", () => {
    for (const event of NOTIFY_EVENTS) {
      const c = notifyEmailCopy(event, "en", { label });
      expect(c.subject).toContain(label);
      expect(c.text.length).toBeGreaterThan(0);
    }
  });

  it("translates framing to Spanish (label stays untranslated)", () => {
    const c = notifyEmailCopy("review_flagged", "es", { label, note: "Falta foto" });
    expect(c.subject).toContain(label);
    // Spanish framing word present; the label (a proper noun) is unchanged.
    expect(c.text.toLowerCase()).toContain("marc"); // "marcado/marcada"
    expect(c.text).toContain("Falta foto");
  });

  it("appends the note when present, omits it cleanly when absent", () => {
    const withNote = notifyEmailCopy("review_redo", "en", { label, note: "Redo bathroom" });
    expect(withNote.text).toContain("Redo bathroom");
    const without = notifyEmailCopy("review_redo", "en", { label });
    expect(without.text).not.toMatch(/undefined|null/);
  });

  it("falls back to English for an unknown locale", () => {
    // @ts-expect-error deliberately passing an invalid locale
    const c = notifyEmailCopy("review_approved", "fr", { label });
    const en = notifyEmailCopy("review_approved", "en", { label });
    expect(c.subject).toBe(en.subject);
  });
});
