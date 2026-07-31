import { describe, expect, it } from "vitest";
import { ACTIVE_WINDOW_MIN, isActive, parseSpotipoStamp, tallyPage } from "./spotipo-active";

const NOW = new Date("2026-07-31T17:20:00.000Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString().slice(0, 19);

describe("parseSpotipoStamp", () => {
  it("treats a suffix-less stamp as UTC, not server-local", () => {
    // The whole bug this guards: `new Date("2026-07-31T17:16:43")` is parsed in
    // the server's zone. On a US-hosted lambda that is 4-5 hours off, every
    // guest looks stale and the active count silently reads zero.
    expect(parseSpotipoStamp("2026-07-31T17:16:43")?.toISOString()).toBe(
      "2026-07-31T17:16:43.000Z",
    );
  });

  it("respects an explicit zone when one is present", () => {
    expect(parseSpotipoStamp("2026-07-31T17:16:43Z")?.toISOString()).toBe(
      "2026-07-31T17:16:43.000Z",
    );
    expect(parseSpotipoStamp("2026-07-31T13:16:43-04:00")?.toISOString()).toBe(
      "2026-07-31T17:16:43.000Z",
    );
  });

  it("returns null for junk rather than an Invalid Date", () => {
    expect(parseSpotipoStamp("")).toBeNull();
    expect(parseSpotipoStamp("not-a-date")).toBeNull();
    expect(parseSpotipoStamp(null)).toBeNull();
    expect(parseSpotipoStamp(undefined)).toBeNull();
    expect(parseSpotipoStamp(1234)).toBeNull();
  });
});

describe("isActive", () => {
  it("counts a guest inside the window", () => {
    expect(isActive(ago(1), NOW)).toBe(true);
    expect(isActive(ago(ACTIVE_WINDOW_MIN), NOW)).toBe(true);
  });

  it("excludes a guest past the window", () => {
    expect(isActive(ago(ACTIVE_WINDOW_MIN + 1), NOW)).toBe(false);
    expect(isActive(ago(600), NOW)).toBe(false);
  });

  it("counts a stamp slightly in the future — clock skew is not absence", () => {
    const future = new Date(NOW.getTime() + 30_000).toISOString().slice(0, 19);
    expect(isActive(future, NOW)).toBe(true);
  });

  it("does not count an unparseable stamp", () => {
    expect(isActive("nope", NOW)).toBe(false);
    expect(isActive(undefined, NOW)).toBe(false);
  });
});

describe("tallyPage", () => {
  it("counts a full page of live guests and does not stop paging", () => {
    const items = Array.from({ length: 20 }, () => ({ last_seen_at: ago(1) }));
    expect(tallyPage(items, NOW)).toEqual({ active: 20, boundaryCrossed: false });
  });

  it("stops at the first stale record — the list is newest-first", () => {
    // The real shape at JW: page 3 held 14 live then older ones.
    const items = [
      ...Array.from({ length: 14 }, () => ({ last_seen_at: ago(1) })),
      ...Array.from({ length: 6 }, () => ({ last_seen_at: ago(87) })),
    ];
    expect(tallyPage(items, NOW)).toEqual({ active: 14, boundaryCrossed: true });
  });

  it("an all-stale page contributes nothing and ends paging", () => {
    const items = Array.from({ length: 20 }, () => ({ last_seen_at: ago(400) }));
    expect(tallyPage(items, NOW)).toEqual({ active: 0, boundaryCrossed: true });
  });

  it("handles an empty page", () => {
    expect(tallyPage([], NOW)).toEqual({ active: 0, boundaryCrossed: false });
  });

  it("honours a caller-supplied window", () => {
    const items = [{ last_seen_at: ago(10) }];
    expect(tallyPage(items, NOW, 5).active).toBe(0);
    expect(tallyPage(items, NOW, 15).active).toBe(1);
  });
});
