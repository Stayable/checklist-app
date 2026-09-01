import { describe, expect, it } from "vitest";

import {
  MAX_INSTANCES_PER_CREATE,
  batchSubjects,
  describePlan,
  expandBatch,
  planBatches,
  type BatchInput,
} from "./batch-create";
import { MAX_ROOMS_PER_CREATE } from "./manual-create";

const rooms = (...ids: string[]): BatchInput => ({
  templateId: "t1",
  roomIds: ids,
  dates: ["2026-09-01"],
});

describe("expandBatch", () => {
  it("multiplies subjects by dates", () => {
    // Kyle's worked example: rooms 201/203/205 on Sept 1 and 2 is 6 checklists.
    const out = expandBatch(
      { templateId: "t1", roomIds: ["201", "203", "205"], dates: ["2026-09-01", "2026-09-02"] },
      "ROOM",
      0,
    );
    expect(out).toHaveLength(6);
    expect(new Set(out.map((i) => i.roomId))).toEqual(new Set(["201", "203", "205"]));
    expect(new Set(out.map((i) => i.date))).toEqual(
      new Set(["2026-09-01", "2026-09-02"]),
    );
  });

  it("is date-major, so a day's work stays together", () => {
    const out = expandBatch(
      { templateId: "t1", roomIds: ["201", "203"], dates: ["2026-09-01", "2026-09-02"] },
      "ROOM",
      0,
    );
    expect(out.map((i) => i.date)).toEqual([
      "2026-09-01",
      "2026-09-01",
      "2026-09-02",
      "2026-09-02",
    ]);
  });

  it("produces exactly one row, with no subject, for a property-wide template", () => {
    const out = expandBatch({ templateId: "t1", dates: ["2026-09-01"] }, "NONE", 0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ roomId: null, assigneeId: null, taskLabel: null });
  });

  it("puts a per-assignee subject on assigneeId, not roomId", () => {
    const out = expandBatch(
      { templateId: "t1", assigneeIds: ["u1", "u2"], dates: ["2026-09-01"] },
      "ASSIGNEE",
      0,
    );
    expect(out).toHaveLength(2);
    expect(out.every((i) => i.roomId === null)).toBe(true);
    expect(out.map((i) => i.assigneeId)).toEqual(["u1", "u2"]);
  });

  it("puts a per-task subject on taskLabel", () => {
    const out = expandBatch(
      { templateId: "t1", taskLabels: ["Pool gate", "Jetting drain lines"], dates: ["2026-09-01"] },
      "TASK",
      0,
    );
    expect(out.map((i) => i.taskLabel)).toEqual(["Pool gate", "Jetting drain lines"]);
  });

  it("de-duplicates subjects and dates without reordering them", () => {
    const out = expandBatch(
      { templateId: "t1", roomIds: ["205", "201", "205"], dates: ["2026-09-01", "2026-09-01"] },
      "ROOM",
      0,
    );
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.roomId)).toEqual(["205", "201"]);
  });

  it("ignores subjects belonging to a different kind", () => {
    // A stale assigneeIds left over from switching the template must not leak.
    const out = expandBatch(
      { templateId: "t1", roomIds: ["201"], assigneeIds: ["u1"], dates: ["2026-09-01"] },
      "ROOM",
      0,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.assigneeId).toBeNull();
  });
});

describe("batchSubjects", () => {
  it("drops blank and whitespace-only task labels", () => {
    expect(
      batchSubjects({ templateId: "t", taskLabels: ["Pool gate", "  ", ""], dates: [] }, "TASK"),
    ).toEqual(["Pool gate"]);
  });
});

describe("planBatches", () => {
  it("concatenates every batch and tags each row with its batch", () => {
    const r = planBatches(
      [rooms("201", "203"), { templateId: "t2", dates: ["2026-09-01"] }],
      ["ROOM", "NONE"],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instances).toHaveLength(3);
    expect(r.instances.map((i) => i.batchIndex)).toEqual([0, 0, 1]);
  });

  it("rejects an empty submission", () => {
    expect(planBatches([], []).ok).toBe(false);
  });

  it("rejects a batch with no dates, naming the batch", () => {
    const r = planBatches([{ templateId: "t1", roomIds: ["201"], dates: [] }], ["ROOM"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.batchIndex).toBe(0);
  });

  it("rejects a batch with no subjects, naming the noun", () => {
    const r = planBatches(
      [{ templateId: "t1", roomIds: [], dates: ["2026-09-01"] }],
      ["ROOM"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("room");
  });

  it("names people for a per-assignee batch, not rooms", () => {
    const r = planBatches(
      [{ templateId: "t1", assigneeIds: [], dates: ["2026-09-01"] }],
      ["ASSIGNEE"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("person");
    expect(r.error).not.toContain("room");
  });

  it("does NOT require subjects for a property-wide batch", () => {
    const r = planBatches([{ templateId: "t1", dates: ["2026-09-01"] }], ["NONE"]);
    expect(r.ok).toBe(true);
  });

  it("allows a whole property in one batch", () => {
    // KE is 167 rooms; a cap below that blocks the real case.
    const ids = Array.from({ length: 167 }, (_, i) => `room-${i}`);
    const r = planBatches([{ templateId: "t1", roomIds: ids, dates: ["2026-09-01"] }], ["ROOM"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instances).toHaveLength(167);
  });

  it("caps subjects per batch", () => {
    const ids = Array.from({ length: MAX_ROOMS_PER_CREATE + 1 }, (_, i) => `room-${i}`);
    const r = planBatches([{ templateId: "t1", roomIds: ids, dates: ["2026-09-01"] }], ["ROOM"]);
    expect(r.ok).toBe(false);
  });

  it("caps the whole submission across batches, not just each one", () => {
    // Two batches each under the per-batch cap, together over the total.
    const ids = Array.from({ length: 150 }, (_, i) => `room-${i}`);
    const twoDays = ["2026-09-01", "2026-09-02"];
    const r = planBatches(
      [
        { templateId: "t1", roomIds: ids, dates: twoDays },
        { templateId: "t2", roomIds: ids, dates: twoDays },
      ],
      ["ROOM", "ROOM"],
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain(String(MAX_INSTANCES_PER_CREATE));
  });

  it("fails loudly when kinds and batches disagree instead of guessing", () => {
    const r = planBatches([rooms("201")], []);
    expect(r.ok).toBe(false);
  });
});

describe("describePlan", () => {
  it("counts one checklist without pluralising", () => {
    const r = planBatches([rooms("201")], ["ROOM"]);
    if (!r.ok) throw new Error("expected ok");
    expect(describePlan(r.instances)).toBe("1 checklist");
  });

  it("mentions templates and days only when there is more than one", () => {
    const r = planBatches(
      [{ templateId: "t1", roomIds: ["201"], dates: ["2026-09-01", "2026-09-02"] }],
      ["ROOM"],
    );
    if (!r.ok) throw new Error("expected ok");
    const text = describePlan(r.instances);
    expect(text).toContain("2 checklists");
    expect(text).toContain("2 days");
    expect(text).not.toContain("templates");
  });
});
