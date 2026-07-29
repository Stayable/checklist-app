import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { isAdmin, isFieldStaff, isManagerOrAbove, isPortfolioRole } from "./rbac";

// Table-driven over EVERY Role value. This is the guard that stops a future role
// from silently inheriting access: adding an enum member without adding a row
// here fails the exhaustiveness test below.
const EXPECTED: Record<Role, {
  portfolio: boolean;
  admin: boolean;
  managerOrAbove: boolean;
  fieldStaff: boolean;
}> = {
  [Role.HK]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.PA]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.MT]:        { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true },
  [Role.MANAGER]:   { portfolio: false, admin: false, managerOrAbove: true,  fieldStaff: false },
  [Role.CORPORATE]: { portfolio: true,  admin: false, managerOrAbove: true,  fieldStaff: false },
  [Role.ADMIN]:     { portfolio: true,  admin: true,  managerOrAbove: true,  fieldStaff: false },
};

describe("rbac role predicates", () => {
  it("covers every Role in the enum", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(Role).sort());
  });

  for (const [role, want] of Object.entries(EXPECTED) as [Role, typeof EXPECTED[Role]][]) {
    it(`classifies ${role} correctly`, () => {
      expect(isPortfolioRole(role)).toBe(want.portfolio);
      expect(isAdmin(role)).toBe(want.admin);
      expect(isManagerOrAbove(role)).toBe(want.managerOrAbove);
      expect(isFieldStaff(role)).toBe(want.fieldStaff);
    });
  }

  it("treats fieldStaff and managerOrAbove as disjoint for current roles", () => {
    for (const role of Object.values(Role)) {
      expect(isFieldStaff(role) && isManagerOrAbove(role)).toBe(false);
    }
  });
});
