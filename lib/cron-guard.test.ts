import { describe, expect, it } from "vitest";
import { etHourOf, isEtHour } from "./cron-guard";

// The whole point of the guard is that a FIXED offset is wrong for ~8 months a
// year, so every case here pins a real instant across the DST boundary.
describe("etHourOf", () => {
  it("reads 09:00 ET from 13:00 UTC during EDT (summer)", () => {
    expect(etHourOf(new Date("2026-07-15T13:00:00Z"))).toBe(9);
  });

  it("reads 08:00 ET from the SAME 13:00 UTC during EST (winter)", () => {
    // This is the drift the guard exists to reject.
    expect(etHourOf(new Date("2026-12-15T13:00:00Z"))).toBe(8);
  });

  it("reads 09:00 ET from 14:00 UTC during EST (winter)", () => {
    expect(etHourOf(new Date("2026-12-15T14:00:00Z"))).toBe(9);
  });

  it("handles midnight ET as 0, not 24", () => {
    expect(etHourOf(new Date("2026-07-15T04:00:00Z"))).toBe(0);
  });
});

describe("isEtHour — exactly one of two UTC entries is admitted", () => {
  const summer = ["2026-07-15T13:00:00Z", "2026-07-15T14:00:00Z"];
  const winter = ["2026-12-15T13:00:00Z", "2026-12-15T14:00:00Z"];

  it("admits exactly one entry for the 9 AM ET digest in summer", () => {
    const admitted = summer.filter((t) => isEtHour(9, new Date(t)));
    expect(admitted).toEqual(["2026-07-15T13:00:00Z"]);
  });

  it("admits exactly one entry for the 9 AM ET digest in winter", () => {
    const admitted = winter.filter((t) => isEtHour(9, new Date(t)));
    expect(admitted).toEqual(["2026-12-15T14:00:00Z"]);
  });

  it("admits exactly one entry for the 5 AM ET generator, both seasons", () => {
    const summerGen = ["2026-07-15T09:00:00Z", "2026-07-15T10:00:00Z"];
    const winterGen = ["2026-12-15T09:00:00Z", "2026-12-15T10:00:00Z"];
    expect(summerGen.filter((t) => isEtHour(5, new Date(t)))).toHaveLength(1);
    expect(winterGen.filter((t) => isEtHour(5, new Date(t)))).toHaveLength(1);
  });

  it("rejects the hour either side", () => {
    const at9 = new Date("2026-07-15T13:00:00Z");
    expect(isEtHour(8, at9)).toBe(false);
    expect(isEtHour(10, at9)).toBe(false);
  });
});
