import { QuestionType } from "@prisma/client";

// Pure checklist runtime logic — conditional visibility + per-type answer
// validation. No React, no DB, no browser APIs, so it is unit-testable in
// isolation and shared by the filling UI and the submit server action.

// Answer value shapes per question type (stored as JSON in responses.answer):
//   SINGLE          string (chosen option)
//   MULTI           string[]
//   YESNO           boolean
//   PASSFAIL        "PASS" | "FAIL"
//   NUMBER          number
//   SHORT_TEXT      string
//   LONG_TEXT       string
//   PHOTO           { count: number; pendingUpload: boolean }  (R2 upload deferred)
//   SIGNATURE       string (data URL)  (R2 offload deferred)
//   DATE            string (yyyy-MM-dd)
//   SECTION_DIVIDER never answered (presentational)
export type AnswerValue =
  | string
  | string[]
  | boolean
  | number
  | { count: number; pendingUpload: boolean }
  | null
  | undefined;

export type AnswerMap = Record<string, AnswerValue>;

export type QuestionLike = {
  id: string;
  type: QuestionType;
  required: boolean;
  options?: string[] | null;
  photoMin?: number | null;
  photoMax?: number | null;
  // { show_if: { question_id, value } } — show only when the referenced
  // question's answer equals `value`.
  conditional?: { show_if?: { question_id: string; value: unknown } } | null;
};

/** SECTION_DIVIDER carries no answer and is never required/validated. */
export function isAnswerable(type: QuestionType): boolean {
  return type !== QuestionType.SECTION_DIVIDER;
}

/**
 * Whether a question should be shown given current answers. A question with no
 * conditional is always visible. A show_if condition is met when the referenced
 * answer strictly equals the configured value (with array membership support
 * for MULTI-type controllers).
 */
export function isVisible(question: QuestionLike, answers: AnswerMap): boolean {
  const cond = question.conditional?.show_if;
  if (!cond) return true;
  const controlling = answers[cond.question_id];
  if (Array.isArray(controlling)) return controlling.includes(cond.value as string);
  return controlling === cond.value;
}

function isBlank(value: AnswerValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  // A PHOTO answer with no captured photos counts as blank.
  if (typeof value === "object" && "count" in value) return value.count === 0;
  return false;
}

/**
 * Validate a single answer. Returns an error key (null if valid). Callers map
 * the key to a localized message. Only call for VISIBLE, ANSWERABLE questions.
 */
export function validateAnswer(question: QuestionLike, value: AnswerValue): string | null {
  if (!isAnswerable(question.type)) return null;

  const blank = isBlank(value);
  if (question.required && blank) return "required";
  if (blank) return null; // optional + empty is fine

  switch (question.type) {
    case QuestionType.NUMBER:
      if (typeof value !== "number" || Number.isNaN(value)) return "number";
      break;
    case QuestionType.SINGLE:
      if (typeof value !== "string" || !(question.options ?? []).includes(value)) return "option";
      break;
    case QuestionType.MULTI:
      if (!Array.isArray(value)) return "option";
      if (value.some((v) => !(question.options ?? []).includes(v))) return "option";
      break;
    case QuestionType.PASSFAIL:
      if (value !== "PASS" && value !== "FAIL") return "passfail";
      break;
    case QuestionType.YESNO:
      if (typeof value !== "boolean") return "yesno";
      break;
    case QuestionType.PHOTO: {
      const count = typeof value === "object" && value !== null && "count" in value ? value.count : 0;
      if (question.photoMin != null && count < question.photoMin) return "photoMin";
      if (question.photoMax != null && count > question.photoMax) return "photoMax";
      break;
    }
    default:
      break;
  }
  return null;
}

/**
 * Validate every visible, answerable question. Returns a map of question id →
 * error key for the invalid ones (empty map = valid submission).
 */
export function validateAll(
  questions: QuestionLike[],
  answers: AnswerMap,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    if (!isAnswerable(q.type)) continue;
    if (!isVisible(q, answers)) continue;
    const err = validateAnswer(q, answers[q.id]);
    if (err) errors[q.id] = err;
  }
  return errors;
}
