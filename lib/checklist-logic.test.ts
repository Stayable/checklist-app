import { describe, expect, it } from "vitest";
import { QuestionType } from "@prisma/client";
import {
  isVisible,
  validateAll,
  validateAnswer,
  type QuestionLike,
} from "./checklist-logic";

const q = (over: Partial<QuestionLike> & { id: string; type: QuestionType }): QuestionLike => ({
  required: true,
  options: null,
  photoMin: null,
  photoMax: null,
  conditional: null,
  ...over,
});

describe("isVisible", () => {
  it("shows questions with no conditional", () => {
    expect(isVisible(q({ id: "a", type: QuestionType.YESNO }), {})).toBe(true);
  });

  it("shows only when the controlling answer matches", () => {
    const dependent = q({
      id: "b",
      type: QuestionType.LONG_TEXT,
      conditional: { show_if: { question_id: "a", value: "Needs rework" } },
    });
    expect(isVisible(dependent, { a: "Needs rework" })).toBe(true);
    expect(isVisible(dependent, { a: "Excellent" })).toBe(false);
    expect(isVisible(dependent, {})).toBe(false);
  });

  it("supports array membership for MULTI controllers", () => {
    const dependent = q({
      id: "b",
      type: QuestionType.SHORT_TEXT,
      conditional: { show_if: { question_id: "a", value: "Towels" } },
    });
    expect(isVisible(dependent, { a: ["Coffee", "Towels"] })).toBe(true);
    expect(isVisible(dependent, { a: ["Coffee"] })).toBe(false);
  });
});

describe("validateAnswer", () => {
  it("flags required-but-blank", () => {
    expect(validateAnswer(q({ id: "a", type: QuestionType.SHORT_TEXT }), "")).toBe("required");
    expect(validateAnswer(q({ id: "a", type: QuestionType.MULTI }), [])).toBe("required");
    expect(validateAnswer(q({ id: "a", type: QuestionType.NUMBER }), undefined)).toBe("required");
  });

  it("passes optional-and-blank", () => {
    expect(validateAnswer(q({ id: "a", type: QuestionType.SHORT_TEXT, required: false }), "")).toBeNull();
  });

  it("validates NUMBER type", () => {
    expect(validateAnswer(q({ id: "a", type: QuestionType.NUMBER }), 5)).toBeNull();
    expect(validateAnswer(q({ id: "a", type: QuestionType.NUMBER }), "5" as unknown as number)).toBe("number");
  });

  it("validates SINGLE against options", () => {
    const opt = q({ id: "a", type: QuestionType.SINGLE, options: ["Pass", "Fail"] });
    expect(validateAnswer(opt, "Pass")).toBeNull();
    expect(validateAnswer(opt, "Maybe")).toBe("option");
  });

  it("validates MULTI membership", () => {
    const opt = q({ id: "a", type: QuestionType.MULTI, options: ["A", "B"] });
    expect(validateAnswer(opt, ["A", "B"])).toBeNull();
    expect(validateAnswer(opt, ["A", "Z"])).toBe("option");
  });

  it("validates PASSFAIL + YESNO", () => {
    expect(validateAnswer(q({ id: "a", type: QuestionType.PASSFAIL }), "PASS")).toBeNull();
    expect(validateAnswer(q({ id: "a", type: QuestionType.PASSFAIL }), "MAYBE")).toBe("passfail");
    expect(validateAnswer(q({ id: "a", type: QuestionType.YESNO }), true)).toBeNull();
    expect(validateAnswer(q({ id: "a", type: QuestionType.YESNO }), "yes" as unknown as boolean)).toBe("yesno");
  });

  it("enforces PHOTO min/max on the count", () => {
    const photo = q({ id: "a", type: QuestionType.PHOTO, photoMin: 1, photoMax: 3 });
    expect(validateAnswer(photo, { count: 0, pendingUpload: true })).toBe("required");
    expect(validateAnswer(photo, { count: 2, pendingUpload: true })).toBeNull();
    expect(validateAnswer(photo, { count: 4, pendingUpload: true })).toBe("photoMax");
  });

  it("never validates SECTION_DIVIDER", () => {
    expect(validateAnswer(q({ id: "a", type: QuestionType.SECTION_DIVIDER }), undefined)).toBeNull();
  });
});

describe("validateAll", () => {
  const questions: QuestionLike[] = [
    q({ id: "div", type: QuestionType.SECTION_DIVIDER, required: false }),
    q({ id: "rating", type: QuestionType.SINGLE, options: ["Good", "Needs rework"] }),
    q({
      id: "why",
      type: QuestionType.LONG_TEXT,
      conditional: { show_if: { question_id: "rating", value: "Needs rework" } },
    }),
  ];

  it("ignores dividers and hidden questions", () => {
    // rating answered "Good" → 'why' is hidden, so its blank doesn't count.
    expect(validateAll(questions, { rating: "Good" })).toEqual({});
  });

  it("requires a conditionally-shown question once visible", () => {
    expect(validateAll(questions, { rating: "Needs rework" })).toEqual({ why: "required" });
  });

  it("reports a missing top-level required answer", () => {
    expect(validateAll(questions, {})).toEqual({ rating: "required" });
  });
});
