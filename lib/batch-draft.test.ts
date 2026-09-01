import { describe, expect, it } from "vitest";

import { MAX_INSTANCES_PER_CREATE } from "./batch-create";
import { MAX_ROOMS_PER_CREATE } from "./manual-create";
import {
  MAX_BATCHES_PER_DRAFT,
  deriveDraftName,
  draftDisplayName,
  estimateInstances,
  parseDraftBatches,
  subjectCount,
  ymdLabel,
} from "./batch-draft";

const TEMPLATE = "11111111-1111-4111-8111-111111111111";
const ROOM_A = "22222222-2222-4222-8222-222222222222";
const ROOM_B = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

function uuidN(n: number): string {
  return `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
}

describe("parseDraftBatches — round trip", () => {
  it("accepts a fully populated batch and returns it typed", () => {
    const result = parseDraftBatches([
      {
        templateId: TEMPLATE,
        roomIds: [ROOM_A, ROOM_B],
        assigneeIds: [],
        taskLabels: [],
        dates: ["2026-09-01", "2026-09-02"],
        assignedUserId: USER,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0]!.roomIds).toEqual([ROOM_A, ROOM_B]);
    expect(result.batches[0]!.dates).toEqual(["2026-09-01", "2026-09-02"]);
    expect(result.batches[0]!.assignedUserId).toBe(USER);
  });

  it("fills the optional subject lists so callers never see undefined", () => {
    const result = parseDraftBatches([
      { templateId: TEMPLATE, dates: ["2026-09-01"] },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batches[0]!.roomIds).toEqual([]);
    expect(result.batches[0]!.assigneeIds).toEqual([]);
    expect(result.batches[0]!.taskLabels).toEqual([]);
  });

  it("saves a half-composed batch — no dates, no subjects yet", () => {
    // The point of a draft. planBatches rejects both of these at Create, which
    // is the right place for it; refusing to SAVE them would mean the wizard
    // can only persist work that is already finished.
    const result = parseDraftBatches([{ templateId: TEMPLATE, dates: [] }]);
    expect(result.ok).toBe(true);
  });

  it("keeps per-batch assignee null when the batch is unassigned", () => {
    const result = parseDraftBatches([
      { templateId: TEMPLATE, dates: ["2026-09-01"], assignedUserId: null },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batches[0]!.assignedUserId).toBeNull();
  });
});

describe("parseDraftBatches — untrusted Json from an older wizard", () => {
  it("rejects rather than throws when the payload is not an array", () => {
    // The shape a single-batch wizard would have written.
    const result = parseDraftBatches({
      templateId: TEMPLATE,
      roomId: ROOM_A,
      dates: ["2026-09-01"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.error).toBe("string");
  });

  it("drops a legacy singular `roomId` instead of smuggling it through", () => {
    // app/checklists/new/actions.ts still accepts a singular `roomId`. A draft
    // written in that shape has no subject list at all, so it must not come back
    // looking like a valid empty-room batch that would create the wrong thing.
    const result = parseDraftBatches([
      { templateId: TEMPLATE, roomId: ROOM_A, dates: ["2026-09-01"] },
    ]);
    // Unknown keys are stripped, so this parses — and roomIds is [], not [ROOM_A].
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batches[0]!.roomIds).toEqual([]);
    expect("roomId" in result.batches[0]!).toBe(false);
  });

  it("rejects a batch with no templateId", () => {
    const result = parseDraftBatches([{ dates: ["2026-09-01"] }]);
    expect(result.ok).toBe(false);
  });

  it("rejects a roomIds that is a string rather than an array", () => {
    const result = parseDraftBatches([
      { templateId: TEMPLATE, roomIds: ROOM_A, dates: ["2026-09-01"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a date that is not an ET calendar day", () => {
    const result = parseDraftBatches([
      { templateId: TEMPLATE, dates: ["2026-09-01T00:00:00.000Z"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects null, undefined and an empty array", () => {
    expect(parseDraftBatches(null).ok).toBe(false);
    expect(parseDraftBatches(undefined).ok).toBe(false);
    expect(parseDraftBatches([]).ok).toBe(false);
  });

  it("rejects a JSON string instead of parsed Json", () => {
    expect(parseDraftBatches('[{"templateId":"x"}]').ok).toBe(false);
  });
});

describe("parseDraftBatches — caps", () => {
  it(`accepts exactly ${MAX_BATCHES_PER_DRAFT} batches and refuses one more`, () => {
    const batch = { templateId: TEMPLATE, dates: ["2026-09-01"] };
    const atCap = Array.from({ length: MAX_BATCHES_PER_DRAFT }, () => batch);
    expect(parseDraftBatches(atCap).ok).toBe(true);
    expect(parseDraftBatches([...atCap, batch]).ok).toBe(false);
  });

  it("refuses more rooms in one batch than a single create allows", () => {
    const rooms = Array.from({ length: MAX_ROOMS_PER_CREATE + 1 }, (_, i) =>
      uuidN(i),
    );
    const result = parseDraftBatches([
      { templateId: TEMPLATE, roomIds: rooms, dates: ["2026-09-01"] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("refuses a draft whose subjects × dates exceed the create limit", () => {
    // 200 rooms × 3 days = 600, over the 400 ceiling. Under the per-batch room
    // cap, so only the multiplied total catches it — the same trap planBatches
    // guards at Create.
    const rooms = Array.from({ length: MAX_ROOMS_PER_CREATE }, (_, i) => uuidN(i));
    const result = parseDraftBatches([
      {
        templateId: TEMPLATE,
        roomIds: rooms,
        dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain(String(MAX_INSTANCES_PER_CREATE));
  });

  it("counts across batches, not per batch", () => {
    // Two batches of 150 rooms are each legal alone; 300 together is under 400,
    // 450 is not.
    const make = (n: number) => ({
      templateId: TEMPLATE,
      roomIds: Array.from({ length: n }, (_, i) => uuidN(i)),
      dates: ["2026-09-01"],
    });
    expect(parseDraftBatches([make(150), make(150)]).ok).toBe(true);
    expect(parseDraftBatches([make(150), make(150), make(150)]).ok).toBe(false);
  });
});

describe("subjectCount / estimateInstances", () => {
  it("treats a batch with no subjects as one instance per date", () => {
    expect(subjectCount({})).toBe(1);
    expect(estimateInstances([{ dates: ["2026-09-01", "2026-09-02"] }])).toBe(2);
  });

  it("counts a dateless batch as one day so it is never free", () => {
    expect(estimateInstances([{ roomIds: [ROOM_A, ROOM_B], dates: [] }])).toBe(2);
  });

  it("multiplies subjects by dates and sums the batches", () => {
    expect(
      estimateInstances([
        { roomIds: [ROOM_A, ROOM_B], dates: ["2026-09-01", "2026-09-02"] },
        { taskLabels: ["Pool gate"], dates: ["2026-09-01"] },
      ]),
    ).toBe(5);
  });
});

describe("ymdLabel", () => {
  it("reads the digits and does not go through Date", () => {
    // `new Date("2026-09-01")` is UTC midnight, which renders as Aug 31 east of
    // Greenwich. These strings are already ET calendar days.
    expect(ymdLabel("2026-09-01")).toBe("Sep 1");
    expect(ymdLabel("2026-01-31")).toBe("Jan 31");
    expect(ymdLabel("2026-12-25")).toBe("Dec 25");
  });

  it("returns the input unchanged when it is not a calendar day", () => {
    expect(ymdLabel("not-a-date")).toBe("not-a-date");
    expect(ymdLabel("2026-13-01")).toBe("2026-13-01");
  });
});

describe("deriveDraftName / draftDisplayName", () => {
  it("names a single dated batch", () => {
    expect(deriveDraftName([{ dates: ["2026-09-01"] }])).toBe("1 batch · Sep 1");
  });

  it("pluralises batches and counts extra days", () => {
    expect(
      deriveDraftName([
        { dates: ["2026-09-01", "2026-09-02"] },
        { dates: ["2026-09-02"] },
      ]),
    ).toBe("2 batches · Sep 1 +1 more day");
  });

  it("uses the earliest day regardless of the order they were picked", () => {
    expect(deriveDraftName([{ dates: ["2026-09-03", "2026-09-01"] }])).toBe(
      "1 batch · Sep 1 +1 more day",
    );
  });

  it("says something when the draft has no dates yet", () => {
    expect(deriveDraftName([{ dates: [] }])).toBe("1 batch");
    expect(deriveDraftName([])).toBe("Empty draft");
  });

  it("prefers the author's own label, and ignores a whitespace one", () => {
    const batches = [{ dates: ["2026-09-01"] }];
    expect(draftDisplayName("Tomorrow's HK", batches)).toBe("Tomorrow's HK");
    expect(draftDisplayName("   ", batches)).toBe("1 batch · Sep 1");
    expect(draftDisplayName(null, batches)).toBe("1 batch · Sep 1");
  });
});

describe("dueTime survives the draft round-trip", () => {
  it("keeps a per-batch due time", () => {
    // The wizard sends dueTime and the create action accepts it. Until
    // BatchInput and this schema both named it, an unknown key was stripped on
    // read: the draft saved fine and came back silently without its due time.
    const r = parseDraftBatches([
      {
        templateId: "11111111-1111-4111-8111-111111111111",
        roomIds: [],
        assigneeIds: [],
        taskLabels: [],
        dates: ["2026-09-01"],
        dueTime: "17:00",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.batches[0]!.dueTime).toBe("17:00");
  });

  it("accepts a null due time and rejects a malformed one", () => {
    const base = {
      templateId: "11111111-1111-4111-8111-111111111111",
      dates: ["2026-09-01"],
    };
    expect(parseDraftBatches([{ ...base, dueTime: null }]).ok).toBe(true);
    expect(parseDraftBatches([{ ...base, dueTime: "25:00" }]).ok).toBe(false);
    expect(parseDraftBatches([{ ...base, dueTime: "5pm" }]).ok).toBe(false);
  });
});
