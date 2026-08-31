import { describe, expect, it } from "vitest";
import {
  applyTemplateFilter,
  countNeedsQuestions,
  isDraft,
} from "./template-filters";

const rows = [
  { code: "ARR", questionCount: 8 },
  { code: "HKC", questionCount: 0 },
  { code: "PPA812", questionCount: 0 },
  { code: "MNT", questionCount: 6 },
];

describe("isDraft", () => {
  it("is true only at zero questions", () => {
    expect(isDraft({ questionCount: 0 })).toBe(true);
    expect(isDraft({ questionCount: 1 })).toBe(false);
  });
});

describe("countNeedsQuestions", () => {
  it("counts the zero-question rows", () => {
    expect(countNeedsQuestions(rows)).toBe(2);
  });

  it("is 0 on an empty list, so the chip reads (0) rather than crashing", () => {
    expect(countNeedsQuestions([])).toBe(0);
  });
});

describe("applyTemplateFilter", () => {
  it("ALL returns every row", () => {
    expect(applyTemplateFilter(rows, "ALL").map((r) => r.code)).toEqual([
      "ARR",
      "HKC",
      "PPA812",
      "MNT",
    ]);
  });

  it("NEEDS_QUESTIONS returns only the drafts, in order", () => {
    expect(applyTemplateFilter(rows, "NEEDS_QUESTIONS").map((r) => r.code)).toEqual([
      "HKC",
      "PPA812",
    ]);
  });

  it("does not mutate the input", () => {
    const before = [...rows];
    applyTemplateFilter(rows, "NEEDS_QUESTIONS");
    expect(rows).toEqual(before);
  });
});
