import { describe, expect, it } from "vitest";
import { DEFAULT_RANGE, RANGE_OPTIONS, resolveRange } from "./wifi-range";

const NOW = new Date("2026-07-29T15:00:00.000Z");

describe("resolveRange", () => {
  it("defaults for undefined and for junk input", () => {
    expect(resolveRange(undefined, NOW).key).toBe(DEFAULT_RANGE);
    expect(resolveRange("not-a-range", NOW).key).toBe(DEFAULT_RANGE);
    expect(resolveRange("", NOW).key).toBe(DEFAULT_RANGE);
  });

  it("honours every offered option, with its label", () => {
    for (const o of RANGE_OPTIONS) {
      const r = resolveRange(o.key, NOW);
      expect(r.key).toBe(o.key);
      expect(r.label).toBe(o.label);
    }
  });

  it("always resolves to a window in the past", () => {
    for (const o of RANGE_OPTIONS) {
      expect(resolveRange(o.key, NOW).from.getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("month-to-date starts on the 1st at local midnight", () => {
    const r = resolveRange("mtd", NOW);
    expect(r.from.getDate()).toBe(1);
    expect(r.from.getHours()).toBe(0);
    expect(r.from.getMinutes()).toBe(0);
    expect(r.from.getSeconds()).toBe(0);
  });

  it("widens monotonically from 7d to 12m", () => {
    const spans = (["7d", "30d", "90d", "12m"] as const).map(
      (k) => NOW.getTime() - resolveRange(k, NOW).from.getTime(),
    );
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i]!).toBeGreaterThan(spans[i - 1]!);
    }
  });

  it("is pure — does not mutate the supplied clock", () => {
    const t = NOW.getTime();
    resolveRange("12m", NOW);
    expect(NOW.getTime()).toBe(t);
  });
});
