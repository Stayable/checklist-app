import { describe, expect, it } from "vitest";

import {
  applyTemplateFilter,
  canPublish,
  countMatching,
  isDraft,
  isReadyToPublish,
  lifecycleOf,
} from "./template-filters";

const PUB = new Date("2026-08-01T12:00:00Z");

const emptyDraft = { code: "HKC", questionCount: 0, active: false, publishedAt: null };
const filledDraft = { code: "PPA812", questionCount: 12, active: false, publishedAt: null };
const published = { code: "ARR", questionCount: 14, active: true, publishedAt: PUB };
const retired = { code: "HKR", questionCount: 9, active: false, publishedAt: PUB };

const ALL = [emptyDraft, filledDraft, published, retired];

describe("lifecycleOf", () => {
  it("separates a filled draft from a retired template", () => {
    // Both are active:false WITH questions. Only publishedAt tells them apart,
    // and the difference decides whether the row offers a Publish button.
    expect(lifecycleOf(filledDraft)).toBe("FILLED_DRAFT");
    expect(lifecycleOf(retired)).toBe("RETIRED");
  });

  it("calls a never-filled seeded template an empty draft", () => {
    expect(lifecycleOf(emptyDraft)).toBe("EMPTY_DRAFT");
  });

  it("calls an active published template published", () => {
    expect(lifecycleOf(published)).toBe("PUBLISHED");
  });

  it("does not treat gaining questions as being published", () => {
    // The whole point of Kyle's flow: filling a template must not publish it.
    const justFilled = { ...emptyDraft, questionCount: 20 };
    expect(lifecycleOf(justFilled)).toBe("FILLED_DRAFT");
    expect(lifecycleOf(justFilled)).not.toBe("PUBLISHED");
  });
});

describe("isDraft", () => {
  it("covers both unpublished states and neither published one", () => {
    expect(isDraft(emptyDraft)).toBe(true);
    expect(isDraft(filledDraft)).toBe(true);
    expect(isDraft(published)).toBe(false);
    expect(isDraft(retired)).toBe(false);
  });
});

describe("isReadyToPublish", () => {
  it("is true only for a filled, never-published template", () => {
    expect(isReadyToPublish(filledDraft)).toBe(true);
    expect(isReadyToPublish(emptyDraft)).toBe(false);
    expect(isReadyToPublish(published)).toBe(false);
    expect(isReadyToPublish(retired)).toBe(false);
  });
});

describe("canPublish", () => {
  it("refuses a template with no questions", () => {
    // Publishing one would give field staff a checklist they cannot fill.
    expect(canPublish(emptyDraft)).toBe(false);
  });

  it("allows a filled draft and a retired template to be published", () => {
    expect(canPublish(filledDraft)).toBe(true);
    expect(canPublish(retired)).toBe(true);
  });

  it("refuses one that is already active", () => {
    expect(canPublish(published)).toBe(false);
  });
});

describe("filters", () => {
  it("partitions the library without overlap or loss", () => {
    const buckets = (["NEEDS_QUESTIONS", "READY_TO_PUBLISH", "PUBLISHED"] as const).flatMap(
      (f) => applyTemplateFilter(ALL, f),
    );
    // Every row lands in exactly one bucket except retired, which lands in none
    // — it is history and deliberately absent from the working chips.
    expect(buckets).toHaveLength(3);
    expect(new Set(buckets.map((b) => b.code)).size).toBe(3);
    expect(buckets.map((b) => b.code)).not.toContain("HKR");
  });

  it("ALL returns everything, retired included", () => {
    expect(applyTemplateFilter(ALL, "ALL")).toHaveLength(4);
  });

  it("counts each chip", () => {
    expect(countMatching(ALL, "NEEDS_QUESTIONS")).toBe(1);
    expect(countMatching(ALL, "READY_TO_PUBLISH")).toBe(1);
    expect(countMatching(ALL, "PUBLISHED")).toBe(1);
  });

  it("accepts an ISO string publishedAt, as a server payload would carry", () => {
    const asString = { ...published, publishedAt: PUB.toISOString() };
    expect(lifecycleOf(asString)).toBe("PUBLISHED");
  });
});
