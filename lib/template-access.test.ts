import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canManageTemplate, templateAppliesToProperty } from "./template-access";

const allProps = { allProperties: true, propertyIds: [] };
const llOnly = { allProperties: false, propertyIds: ["LL"] };
const llAndOr = { allProperties: false, propertyIds: ["LL", "OR"] };

describe("templateAppliesToProperty", () => {
  it("All-properties template applies everywhere", () => {
    expect(templateAppliesToProperty(allProps, "LL")).toBe(true);
    expect(templateAppliesToProperty(allProps, "OR")).toBe(true);
  });
  it("scoped template applies only to its listed properties", () => {
    expect(templateAppliesToProperty(llOnly, "LL")).toBe(true);
    expect(templateAppliesToProperty(llOnly, "OR")).toBe(false);
  });
});

describe("canManageTemplate", () => {
  it("ADMIN may manage anything", () => {
    expect(canManageTemplate(Role.ADMIN, ["LL"], allProps)).toBe(true);
    expect(canManageTemplate(Role.ADMIN, ["LL"], llAndOr)).toBe(true);
  });
  it("MANAGER may manage a template fully within their properties", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], llOnly)).toBe(true);
    expect(canManageTemplate(Role.MANAGER, ["LL", "OR"], llAndOr)).toBe(true);
  });
  it("MANAGER may NOT manage a template touching a property they lack", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], llAndOr)).toBe(false);
  });
  it("MANAGER may NOT manage an All-properties template", () => {
    expect(canManageTemplate(Role.MANAGER, ["LL"], allProps)).toBe(false);
  });
  it("MANAGER may NOT manage a template with no property association", () => {
    expect(
      canManageTemplate(Role.MANAGER, ["LL"], { allProperties: false, propertyIds: [] }),
    ).toBe(false);
  });
  it("CORPORATE is treated like MANAGER for the property-subset rule", () => {
    expect(canManageTemplate(Role.CORPORATE, ["LL", "OR"], llAndOr)).toBe(true);
    expect(canManageTemplate(Role.CORPORATE, ["LL"], allProps)).toBe(false);
  });
});

describe("canManageTemplate — AGENT", () => {
  const ownProps = ["p1", "p2"];

  it("manages a template fully inside its properties, like a MANAGER", () => {
    expect(
      canManageTemplate(Role.AGENT, ownProps, { allProperties: false, propertyIds: ["p1"] }),
    ).toBe(true);
  });

  it("cannot touch an all-properties template — those stay ADMIN-governed", () => {
    // This is what protects the 9 standardized templates from a test account.
    expect(
      canManageTemplate(Role.AGENT, ownProps, { allProperties: true, propertyIds: [] }),
    ).toBe(false);
  });

  it("cannot reach outside its own properties", () => {
    expect(
      canManageTemplate(Role.AGENT, ownProps, { allProperties: false, propertyIds: ["p1", "p9"] }),
    ).toBe(false);
  });
});
