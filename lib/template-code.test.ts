import { describe, expect, it } from "vitest";
import { deriveTemplateCode } from "./template-code";

describe("deriveTemplateCode", () => {
  it("uses word initials, uppercased", () => {
    expect(deriveTemplateCode("Pool Safety Check", [])).toBe("PSC");
  });

  it("falls back to the longest word when too few initials", () => {
    expect(deriveTemplateCode("Roofing", [])).toBe("ROOFIN"); // truncated to 6
  });

  it("strips non-alphanumerics", () => {
    expect(deriveTemplateCode("HVAC / Service!", [])).toBe("HS");
  });

  it("appends a numeric suffix on collision, staying <= 8 chars", () => {
    expect(deriveTemplateCode("Pool Safety Check", ["PSC"])).toBe("PSC2");
    expect(deriveTemplateCode("Pool Safety Check", ["PSC", "PSC2"])).toBe("PSC3");
  });

  it("truncates the base to leave room for a dedup suffix", () => {
    // base would be ABCDEFGH (8); truncated to 6 so suffix fits
    expect(deriveTemplateCode("Aa Bb Cc Dd Ee Ff Gg Hh", [])).toBe("ABCDEF");
  });

  it("never exceeds 8 chars even with multi-digit suffixes", () => {
    const taken = Array.from({ length: 11 }, (_, i) =>
      i === 0 ? "ABCDEF" : `ABCDEF${i + 1}`,
    );
    const out = deriveTemplateCode("Aa Bb Cc Dd Ee Ff", taken);
    expect(out.length).toBeLessThanOrEqual(8);
    expect(taken).not.toContain(out);
  });

  it("falls back to a default base when title has no alphanumerics", () => {
    expect(deriveTemplateCode("!!!", [])).toBe("TMPL");
  });
});
