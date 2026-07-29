import { describe, expect, it } from "vitest";
import {
  EMPTY_CHECKOUT_FLAGS,
  hasAnyCheckoutFlag,
  normalizeCheckoutFlags,
} from "./checkout-flags";

describe("normalizeCheckoutFlags", () => {
  it("clears the list when itemsToReplace is false", () => {
    const out = normalizeCheckoutFlags({
      ...EMPTY_CHECKOUT_FLAGS,
      itemsToReplace: false,
      itemsToReplaceList: "towels, remote",
    });
    expect(out.itemsToReplaceList).toBe("");
  });

  it("trims and keeps the list when itemsToReplace is true", () => {
    const out = normalizeCheckoutFlags({
      ...EMPTY_CHECKOUT_FLAGS,
      itemsToReplace: true,
      itemsToReplaceList: "  towels, remote  ",
    });
    expect(out.itemsToReplace).toBe(true);
    expect(out.itemsToReplaceList).toBe("towels, remote");
  });

  it("preserves the boolean flags", () => {
    const out = normalizeCheckoutFlags({
      notifyCorporate: true,
      returnDeposit: true,
      itemsToReplace: false,
      itemsToReplaceList: "",
      placeOOO: true,
    });
    expect(out.notifyCorporate).toBe(true);
    expect(out.returnDeposit).toBe(true);
    expect(out.placeOOO).toBe(true);
  });
});

describe("hasAnyCheckoutFlag", () => {
  it("is false when nothing is raised", () => {
    expect(hasAnyCheckoutFlag(EMPTY_CHECKOUT_FLAGS)).toBe(false);
  });

  it("is true when any boolean flag is raised", () => {
    expect(hasAnyCheckoutFlag({ ...EMPTY_CHECKOUT_FLAGS, placeOOO: true })).toBe(true);
  });
});
