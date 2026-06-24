import { describe, expect, it } from "vitest";
import { nextManualLabelDefault } from "./manual-create";

describe("nextManualLabelDefault", () => {
  it("formats '{name} — {Mon D, YYYY}' in ET", () => {
    // 2026-06-24 12:00 UTC is still Jun 24 in ET (EDT = UTC-4)
    const d = new Date("2026-06-24T12:00:00.000Z");
    expect(nextManualLabelDefault("Pool Safety Check", d)).toBe(
      "Pool Safety Check — Jun 24, 2026",
    );
  });
});
