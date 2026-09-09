import { describe, expect, it } from "vitest";
import { QuestionType } from "@prisma/client";
import {
  buildNextVersionRows,
  questionSetChanged,
  type ExistingQuestion,
  type IncomingQuestion,
} from "./template-version";

function existing(over: Partial<ExistingQuestion> & { id: string; orderIndex: number }): ExistingQuestion {
  return {
    type: QuestionType.SHORT_TEXT,
    prompt: "Prompt",
    hint: null,
    required: true,
    options: null,
    photoMin: null,
    photoMax: null,
    failFlagsIssue: false,
    conditional: null,
    ...over,
  };
}

function incoming(over: Partial<IncomingQuestion> = {}): IncomingQuestion {
  return { type: QuestionType.SHORT_TEXT, prompt: "Prompt", required: true, ...over };
}

/** A PM PA checkpoint: same prompt three times, told apart only by `hint`. */
const CHECKPOINT_PROMPT = "CHECKPOINT 1: Take a photo of the pool deck";
const checkpointRows: ExistingQuestion[] = ["7:00pm", "10:00pm", "End of shift"].map(
  (hint, i) =>
    existing({
      id: `cp-${i}`,
      orderIndex: i,
      type: QuestionType.PHOTO,
      prompt: CHECKPOINT_PROMPT,
      hint,
      photoMax: 1,
    }),
);
const checkpointPayload: IncomingQuestion[] = checkpointRows.map((q) => ({
  id: q.id,
  type: q.type,
  prompt: q.prompt,
  required: q.required,
  photoMax: q.photoMax,
}));

describe("questionSetChanged", () => {
  it("is false for an untouched set", () => {
    expect(questionSetChanged(checkpointRows, checkpointPayload)).toBe(false);
  });

  it("catches a length change", () => {
    expect(questionSetChanged(checkpointRows, checkpointPayload.slice(0, 2))).toBe(true);
  });

  it("catches an edited prompt", () => {
    const next = structuredClone(checkpointPayload);
    next[1]!.prompt = "CHECKPOINT 1: photograph the pool deck";
    expect(questionSetChanged(checkpointRows, next)).toBe(true);
  });

  it("catches a reorder even though every row is still present", () => {
    const next = [checkpointPayload[1]!, checkpointPayload[0]!, checkpointPayload[2]!];
    expect(questionSetChanged(checkpointRows, next)).toBe(true);
  });

  it("catches a swap of one question for a brand-new one", () => {
    const next = structuredClone(checkpointPayload);
    next[2] = incoming({ prompt: "Something else" });
    expect(questionSetChanged(checkpointRows, next)).toBe(true);
  });

  // The regression that made this whole change necessary: the old comparison
  // ignored `hint`, so a hint-only edit fell through to "nothing changed",
  // skipped the write, and still reported "Saved".
  it("catches a hint-only edit", () => {
    const next = structuredClone(checkpointPayload);
    next[2]!.hint = "11:00pm";
    expect(questionSetChanged(checkpointRows, next)).toBe(true);
  });

  it("treats an absent hint as unchanged, not as a clear", () => {
    // checkpointPayload carries no `hint` at all, yet every row has one.
    expect(questionSetChanged(checkpointRows, checkpointPayload)).toBe(false);
  });

  it("normalizes photoMax so an unset PHOTO max matches the stored default of 1", () => {
    const rows = [existing({ id: "a", orderIndex: 0, type: QuestionType.PHOTO, photoMax: 1 })];
    const next = [incoming({ id: "a", type: QuestionType.PHOTO, photoMax: null })];
    expect(questionSetChanged(rows, next)).toBe(false);
  });

  it("ignores failFlagsIssue on a type that cannot use it", () => {
    const rows = [existing({ id: "a", orderIndex: 0, failFlagsIssue: false })];
    const next = [incoming({ id: "a", failFlagsIssue: true })]; // SHORT_TEXT
    expect(questionSetChanged(rows, next)).toBe(false);
  });

  it("compares on fields alone when the payload carries no ids", () => {
    const idless = checkpointPayload.map((q) => ({ ...q, id: undefined }));
    expect(questionSetChanged(checkpointRows, idless)).toBe(false);
  });
});

describe("buildNextVersionRows", () => {
  it("stamps every row with the new version and a dense orderIndex", () => {
    const rows = buildNextVersionRows(checkpointRows, checkpointPayload, 4);
    expect(rows.map((r) => r.version)).toEqual([4, 4, 4]);
    expect(rows.map((r) => r.orderIndex)).toEqual([0, 1, 2]);
  });

  // The silent data loss: the old INSERT never wrote `hint`, so one save wiped
  // 105 checkpoint labels across 7 PM PA templates.
  it("carries hint forward when the builder never sent one", () => {
    const rows = buildNextVersionRows(checkpointRows, checkpointPayload, 2);
    expect(rows.map((r) => r.hint)).toEqual(["7:00pm", "10:00pm", "End of shift"]);
  });

  it("carries hint with the question through a reorder, not by position", () => {
    const reordered = [checkpointPayload[2]!, checkpointPayload[0]!, checkpointPayload[1]!];
    const rows = buildNextVersionRows(checkpointRows, reordered, 2);
    expect(rows.map((r) => r.hint)).toEqual(["End of shift", "7:00pm", "10:00pm"]);
  });

  it("carries options, conditional and photoMin the builder cannot see", () => {
    const prior = [
      existing({
        id: "a",
        orderIndex: 0,
        type: QuestionType.SINGLE,
        options: ["Yes", "No", "N/A"],
        conditional: { show_if: { question_id: "b", value: "Yes" } },
        photoMin: 2,
      }),
    ];
    const [row] = buildNextVersionRows(
      prior,
      [incoming({ id: "a", type: QuestionType.SINGLE, prompt: "Renamed" })],
      7,
    );
    expect(row!.prompt).toBe("Renamed");
    expect(row!.options).toEqual(["Yes", "No", "N/A"]);
    expect(row!.conditional).toEqual({ show_if: { question_id: "b", value: "Yes" } });
    expect(row!.photoMin).toBe(2);
  });

  it("gives a brand-new question nulls rather than a neighbour's hint", () => {
    const next = [...checkpointPayload, incoming({ prompt: "New question" })];
    const rows = buildNextVersionRows(checkpointRows, next, 2);
    expect(rows[3]!.hint).toBeNull();
    expect(rows[3]!.options).toBeNull();
  });

  it("lets an explicitly submitted hint override the carried one", () => {
    const next = structuredClone(checkpointPayload);
    next[0]!.hint = "6:00pm";
    const rows = buildNextVersionRows(checkpointRows, next, 2);
    expect(rows[0]!.hint).toBe("6:00pm");
  });

  it("treats an explicit empty-string hint as a clear", () => {
    const next = structuredClone(checkpointPayload);
    next[0]!.hint = "";
    expect(buildNextVersionRows(checkpointRows, next, 2)[0]!.hint).toBeNull();
  });

  it("normalizes photoMax and failFlagsIssue by type", () => {
    const rows = buildNextVersionRows(
      [],
      [
        incoming({ type: QuestionType.PHOTO }),
        incoming({ type: QuestionType.PASSFAIL, failFlagsIssue: true }),
        incoming({ type: QuestionType.LONG_TEXT, photoMax: 5, failFlagsIssue: true }),
      ],
      1,
    );
    expect(rows[0]!.photoMax).toBe(1);
    expect(rows[1]!.photoMax).toBeNull();
    expect(rows[1]!.failFlagsIssue).toBe(true);
    expect(rows[2]!.photoMax).toBeNull();
    expect(rows[2]!.failFlagsIssue).toBe(false);
  });
});
