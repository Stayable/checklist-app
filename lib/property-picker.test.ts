import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { resolveScopedPropertyIds } from "./property-scope";
import {
  ALL_PROPERTIES_VALUE,
  allPropertiesLabel,
  propertyPickerOptions,
  shouldShowPropertyPicker,
  type PickerPropertyLike,
} from "./property-picker";

const ALL_ROLES = Object.values(Role);
const PORTFOLIO_ROLES: Role[] = [Role.CORPORATE, Role.ADMIN];

const LL: PickerPropertyLike = { id: "id-ll", shortCode: "LL", name: "Lakeland" };
const OR: PickerPropertyLike = { id: "id-or", shortCode: "OR", name: "Orlando OBT" };
const JW: PickerPropertyLike = { id: "id-jw", shortCode: "JW", name: "Jacksonville West" };

describe("allPropertiesLabel", () => {
  it("says 'All properties' for portfolio roles", () => {
    for (const role of PORTFOLIO_ROLES) {
      expect(allPropertiesLabel(role, 8)).toBe("All properties (8)");
    }
  });

  it("says 'All my properties' for every scoped role", () => {
    for (const role of ALL_ROLES.filter((r) => !PORTFOLIO_ROLES.includes(r))) {
      expect(allPropertiesLabel(role, 2)).toBe("All my properties (2)");
    }
  });

  it("counts the user's OWN reach, never the portfolio", () => {
    // The whole point of the feature: a 2-property manager must not be told
    // there are 8. If this ever reads "(8)" the label is lying about scope.
    expect(allPropertiesLabel(Role.MANAGER, 2)).toBe("All my properties (2)");
    expect(allPropertiesLabel(Role.MANAGER, 2)).not.toContain("8");
  });
});

describe("propertyPickerOptions", () => {
  it("puts the all-scope entry first and preserves property order", () => {
    const options = propertyPickerOptions([JW, LL, OR], Role.MANAGER);
    expect(options.map((o) => o.label)).toEqual([
      "All my properties (3)",
      "JW — Jacksonville West",
      "LL — Lakeland",
      "OR — Orlando OBT",
    ]);
  });

  it("gives the all-scope entry the empty value so a null cookie selects it", () => {
    const options = propertyPickerOptions([LL, OR], Role.MANAGER);
    expect(options[0].value).toBe(ALL_PROPERTIES_VALUE);
    expect(ALL_PROPERTIES_VALUE).toBe("");
    // `<select value={current ?? ALL_PROPERTIES_VALUE}>` — no active property
    // must land on the all-scope option, not on a property.
    const current: string | null = null;
    expect(current ?? ALL_PROPERTIES_VALUE).toBe(options[0].value);
  });

  it("never collides the all-scope value with a real property id", () => {
    const options = propertyPickerOptions([LL, OR, JW], Role.ADMIN);
    const propertyValues = options.slice(1).map((o) => o.value);
    expect(propertyValues).not.toContain(ALL_PROPERTIES_VALUE);
    expect(new Set(options.map((o) => o.value)).size).toBe(options.length);
  });

  it("labels the portfolio option by the full active portfolio", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      id: `id-${i}`,
      shortCode: `P${i}`,
      name: `Property ${i}`,
    }));
    expect(propertyPickerOptions(eight, Role.CORPORATE)[0].label).toBe("All properties (8)");
  });
});

describe("shouldShowPropertyPicker", () => {
  it("hides the picker for a single-property user", () => {
    // Regression guard: adding the all-scope entry must not resurrect a picker
    // for users who have exactly one property.
    expect(shouldShowPropertyPicker(1)).toBe(false);
  });

  it("hides the picker when the user has no properties", () => {
    expect(shouldShowPropertyPicker(0)).toBe(false);
  });

  it("shows the picker at two or more", () => {
    expect(shouldShowPropertyPicker(2)).toBe(true);
    expect(shouldShowPropertyPicker(8)).toBe(true);
  });
});

describe("clearing the cookie resolves to the full accessible set", () => {
  // The all-scope entry deletes the cookie. getCurrentPropertyId then returns
  // null for anyone with 2+ properties (its length-1 pin does not apply), and
  // resolveScopedPropertyIds falls through. This pins the end-to-end meaning of
  // the selection without needing a next/headers mock.
  it("a 2-property manager gets both properties back", () => {
    expect(resolveScopedPropertyIds(["id-ll", "id-or"], null)).toEqual(["id-ll", "id-or"]);
  });

  it("a portfolio role gets all eight back", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `id-${i}`);
    expect(resolveScopedPropertyIds(eight, null)).toEqual(eight);
  });

  it("the empty option value must never be treated as an active property", () => {
    // If ALL_PROPERTIES_VALUE were ever written to the cookie as a sentinel,
    // this is the check that would have to reject it. It does — but the picker
    // deletes the cookie instead, so the sentinel never reaches the server.
    expect(resolveScopedPropertyIds(["id-ll", "id-or"], ALL_PROPERTIES_VALUE)).toEqual([
      "id-ll",
      "id-or",
    ]);
  });
});
