import { CompletionCheck, QuestionType } from "@prisma/client";

// S1 (StayCheck v1.1) — Completion Check.
//
// The authoritative Pass/Fail is set MANUALLY by the manager at review (Q1).
// This pure helper derives a *hint* the review UI shows beside the manual
// control: FAIL if any PASSFAIL answer on the submission is "FAIL", otherwise
// PASS. It is deliberately simple — a suggestion, never enforcement.

type ResponseLike = { questionId: string; answer: unknown };
type QuestionLike = { id: string; type: QuestionType };

/**
 * Heuristic hint for the manager's completion check: any failed pass/fail
 * question fails the whole submission. Questions with no matching response are
 * ignored. Empty input derives PASS.
 */
export function deriveCompletionCheck(
  responses: ResponseLike[],
  questions: QuestionLike[],
): CompletionCheck {
  const passFailIds = new Set(
    questions.filter((q) => q.type === QuestionType.PASSFAIL).map((q) => q.id),
  );
  const anyFail = responses.some(
    (r) => passFailIds.has(r.questionId) && r.answer === "FAIL",
  );
  return anyFail ? CompletionCheck.FAIL : CompletionCheck.PASS;
}
