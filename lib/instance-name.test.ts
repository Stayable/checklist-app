import { describe, expect, it } from "vitest";

import { buildInstanceName, nameDateET, scopeTokenText } from "./instance-name";

// 2026-09-01 12:00 ET == 16:00 UTC (EDT, UTC-4).
const SEP_1 = new Date("2026-09-01T16:00:00Z");

describe("nameDateET", () => {
  it("renders six digits, not eight", () => {
    // D21: matches Title_PropertyID_MMDDYY and therefore the exported PDF name.
    expect(nameDateET(SEP_1)).toBe("090126");
  });

  it("formats in Eastern, not UTC", () => {
    // 2026-09-02 01:00 UTC is still 2026-09-01 21:00 in ET. A UTC-based format
    // would name this checklist for the wrong day — the exact off-by-one the
    // harness clock produces.
    const lateEvening = new Date("2026-09-02T01:00:00Z");
    expect(nameDateET(lateEvening)).toBe("090126");
  });

  it("pads single-digit months and days", () => {
    expect(nameDateET(new Date("2026-01-05T17:00:00Z"))).toBe("010526");
  });
});

describe("scopeTokenText", () => {
  it("returns the distinguishing text per kind", () => {
    expect(scopeTokenText({ kind: "ROOM", roomNumber: "201" })).toBe("201");
    expect(scopeTokenText({ kind: "ASSIGNEE", name: "Randy R." })).toBe("Randy R.");
    expect(scopeTokenText({ kind: "TASK", label: "Pool gate" })).toBe("Pool gate");
    expect(scopeTokenText({ kind: "NONE" })).toBeNull();
  });

  it("treats whitespace-only as nothing", () => {
    expect(scopeTokenText({ kind: "TASK", label: "   " })).toBeNull();
  });
});

describe("buildInstanceName", () => {
  it("names a per-room checklist", () => {
    expect(
      buildInstanceName({
        templateName: "Housekeeping Checklist",
        shortCode: "LL",
        token: { kind: "ROOM", roomNumber: "201" },
        date: SEP_1,
      }),
    ).toBe("Housekeeping Checklist LL 201 090126");
  });

  it("names a per-person checklist", () => {
    expect(
      buildInstanceName({
        templateName: "812 PM PA Checklist",
        shortCode: "JN",
        token: { kind: "ASSIGNEE", name: "Randy R." },
        date: SEP_1,
      }),
    ).toBe("812 PM PA Checklist JN Randy R. 090126");
  });

  it("names a per-task checklist", () => {
    expect(
      buildInstanceName({
        templateName: "Property Task Checklist",
        shortCode: "KE",
        token: { kind: "TASK", label: "Pool gate" },
        date: SEP_1,
      }),
    ).toBe("Property Task Checklist KE Pool gate 090126");
  });

  it("drops the token entirely for a property-wide checklist", () => {
    // Not "Roof PM Checklist SA  090126" — an empty segment must not leave a gap.
    const name = buildInstanceName({
      templateName: "Roof PM Checklist",
      shortCode: "SA",
      token: { kind: "NONE" },
      date: SEP_1,
    });
    expect(name).toBe("Roof PM Checklist SA 090126");
    expect(name).not.toContain("  ");
  });

  it("always carries the property short code", () => {
    // Room 201 exists at more than one property, and the PDF filename and any
    // exported list have no separate property column to disambiguate it.
    const ll = buildInstanceName({
      templateName: "Housekeeping Checklist",
      shortCode: "LL",
      token: { kind: "ROOM", roomNumber: "201" },
      date: SEP_1,
    });
    const jn = buildInstanceName({
      templateName: "Housekeeping Checklist",
      shortCode: "JN",
      token: { kind: "ROOM", roomNumber: "201" },
      date: SEP_1,
    });
    expect(ll).not.toBe(jn);
  });

  it("trims stray whitespace in the inputs", () => {
    expect(
      buildInstanceName({
        templateName: "  Arrival Checklist ",
        shortCode: " LL ",
        token: { kind: "ROOM", roomNumber: " 312 " },
        date: SEP_1,
      }),
    ).toBe("Arrival Checklist LL 312 090126");
  });
});
