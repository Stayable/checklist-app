import { describe, expect, it } from "vitest";
import { resolveScopedPropertyIds } from "./property-scope";

describe("resolveScopedPropertyIds", () => {
  it("narrows to the active property when it is accessible", () => {
    expect(resolveScopedPropertyIds(["a", "b", "c"], "b")).toEqual(["b"]);
  });

  it("ignores an active id the user cannot access (returns all accessible)", () => {
    expect(resolveScopedPropertyIds(["a", "b"], "z")).toEqual(["a", "b"]);
  });

  it("returns all accessible when no active property is set", () => {
    expect(resolveScopedPropertyIds(["a", "b"], null)).toEqual(["a", "b"]);
  });

  it("handles the empty accessible set", () => {
    expect(resolveScopedPropertyIds([], "a")).toEqual([]);
  });
});
