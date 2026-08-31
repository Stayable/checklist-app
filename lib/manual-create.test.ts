import { describe, expect, it } from "vitest";
import {
  MAX_ROOMS_PER_CREATE,
  resolveRoomIds,
  nextManualLabelDefault,
  planRoomInstances,
  summarizeCreateResult,
  validateRoomSelection,
} from "./manual-create";

describe("nextManualLabelDefault", () => {
  it("formats '{name} — {Mon D, YYYY}' in ET", () => {
    // 2026-06-24 12:00 UTC is still Jun 24 in ET (EDT = UTC-4)
    const d = new Date("2026-06-24T12:00:00.000Z");
    expect(nextManualLabelDefault("Pool Safety Check", d)).toBe(
      "Pool Safety Check — Jun 24, 2026",
    );
  });
});

describe("planRoomInstances", () => {
  it("creates one entry per selected room, preserving order", () => {
    expect(
      planRoomInstances({ selectedRoomIds: ["r3", "r1", "r2"] }),
    ).toEqual({ create: ["r3", "r1", "r2"], duplicates: [] });
  });

  it("de-duplicates a repeated selection", () => {
    expect(
      planRoomInstances({ selectedRoomIds: ["r1", "r1", "r2"] }).create,
    ).toEqual(["r1", "r2"]);
  });

  it("skips rooms that already have a live instance today", () => {
    expect(
      planRoomInstances({
        selectedRoomIds: ["r1", "r2", "r3"],
        existingRoomIds: ["r2"],
      }),
    ).toEqual({ create: ["r1", "r3"], duplicates: ["r2"] });
  });

  it("creates duplicates when explicitly forced", () => {
    expect(
      planRoomInstances({
        selectedRoomIds: ["r1", "r2"],
        existingRoomIds: ["r1", "r2"],
        allowDuplicates: true,
      }),
    ).toEqual({ create: ["r1", "r2"], duplicates: [] });
  });

  it("returns an empty plan for an empty selection", () => {
    expect(planRoomInstances({ selectedRoomIds: [] })).toEqual({
      create: [],
      duplicates: [],
    });
  });

  it("counts a duplicate only once even if selected twice", () => {
    expect(
      planRoomInstances({
        selectedRoomIds: ["r1", "r1"],
        existingRoomIds: ["r1"],
      }),
    ).toEqual({ create: [], duplicates: ["r1"] });
  });
});

describe("validateRoomSelection", () => {
  it("requires at least one room for a per-room template", () => {
    expect(validateRoomSelection({ perRoom: true, count: 0 })).toMatch(
      /per-room/,
    );
  });

  it("accepts one or many rooms for a per-room template", () => {
    expect(validateRoomSelection({ perRoom: true, count: 1 })).toBeNull();
    expect(validateRoomSelection({ perRoom: true, count: 12 })).toBeNull();
  });

  it("allows zero rooms when the template is not per-room", () => {
    expect(validateRoomSelection({ perRoom: false, count: 0 })).toBeNull();
  });

  it("caps the batch size", () => {
    expect(
      validateRoomSelection({ perRoom: true, count: MAX_ROOMS_PER_CREATE }),
    ).toBeNull();
    expect(
      validateRoomSelection({ perRoom: true, count: MAX_ROOMS_PER_CREATE + 1 }),
    ).toMatch(/at most/);
  });
});

describe("summarizeCreateResult", () => {
  it("singularises one checklist", () => {
    expect(summarizeCreateResult({ created: 1 })).toBe("Created 1 checklist.");
  });

  it("pluralises many", () => {
    expect(summarizeCreateResult({ created: 8 })).toBe("Created 8 checklists.");
  });

  it("reports skipped duplicates", () => {
    expect(summarizeCreateResult({ created: 8, duplicates: 2 })).toBe(
      "Created 8 checklists. 2 rooms skipped — already had one today.",
    );
  });

  it("reports failures", () => {
    expect(summarizeCreateResult({ created: 3, duplicates: 1, failed: 2 })).toBe(
      "Created 3 checklists. 1 room skipped — already had one today. 2 failed.",
    );
  });
});

describe("resolveRoomIds", () => {
  it("uses roomIds when the multi-select client posts them", () => {
    expect(resolveRoomIds({ roomIds: ["a", "b"], roomId: null })).toEqual(["a", "b"]);
  });

  it("falls back to the legacy singular roomId", () => {
    expect(resolveRoomIds({ roomIds: [], roomId: "a" })).toEqual(["a"]);
  });

  it("prefers roomIds over a stale singular roomId", () => {
    // A new client must never have its selection overridden by a leftover field.
    expect(resolveRoomIds({ roomIds: ["a", "b"], roomId: "z" })).toEqual(["a", "b"]);
  });

  it("returns empty when neither is supplied", () => {
    expect(resolveRoomIds({})).toEqual([]);
    expect(resolveRoomIds({ roomIds: [], roomId: null })).toEqual([]);
  });

  it("does not alias the caller's array", () => {
    const input = ["a"];
    const out = resolveRoomIds({ roomIds: input });
    out.push("b");
    expect(input).toEqual(["a"]);
  });
});
