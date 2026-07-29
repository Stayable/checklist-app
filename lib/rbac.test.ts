import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

// Mock @/lib/auth at file scope to avoid importing next-auth's transitive
// next/server dependency, which fails under vitest's node environment.
// lib/rbac.ts imports auth() for requireUser, but the pure predicates we test
// (isFieldStaff, isManagerOrAbove, etc.) don't depend on it, so a no-op stub
// is sufficient and safe. Without this mock, the test cannot import rbac.ts.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

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
