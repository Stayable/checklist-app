import { describe, expect, it } from "vitest";
import { CompletionCheck, QuestionType } from "@prisma/client";
import { deriveCompletionCheck } from "./completion-check";

const q = (id: string, type: QuestionType) => ({ id, type });

describe("deriveCompletionCheck", () => {
  it("derives PASS with no responses", () => {
    expect(deriveCompletionCheck([], [])).toBe(CompletionCheck.PASS);
  });

  it("derives PASS when all pass/fail answers are PASS", () => {
    const questions = [q("a", QuestionType.PASSFAIL), q("b", QuestionType.PASSFAIL)];
    const responses = [
      { questionId: "a", answer: "PASS" },
      { questionId: "b", answer: "PASS" },
    ];
    expect(deriveCompletionCheck(responses, questions)).toBe(CompletionCheck.PASS);
  });

  it("derives FAIL when any pass/fail answer is FAIL", () => {
    const questions = [q("a", QuestionType.PASSFAIL), q("b", QuestionType.PASSFAIL)];
    const responses = [
      { questionId: "a", answer: "PASS" },
      { questionId: "b", answer: "FAIL" },
    ];
    expect(deriveCompletionCheck(responses, questions)).toBe(CompletionCheck.FAIL);
  });

  it("ignores FAIL-valued answers on non-pass/fail questions", () => {
    const questions = [q("a", QuestionType.SHORT_TEXT)];
    const responses = [{ questionId: "a", answer: "FAIL" }];
    expect(deriveCompletionCheck(responses, questions)).toBe(CompletionCheck.PASS);
  });

  it("ignores responses with no matching question", () => {
    const questions = [q("a", QuestionType.PASSFAIL)];
    const responses = [{ questionId: "orphan", answer: "FAIL" }];
    expect(deriveCompletionCheck(responses, questions)).toBe(CompletionCheck.PASS);
  });
});
