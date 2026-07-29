import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

// rbac.ts pulls in @/lib/auth (NextAuth init) and next/navigation via its
// require-session helpers. We don't exercise those here, so stub them to keep the
// import graph clean, and mock the Prisma singleton for the property-scope helpers.
const mocks = vi.hoisted(() => ({
  upFindUnique: vi.fn(),
  upFindMany: vi.fn(),
  propFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    userProperty: { findUnique: mocks.upFindUnique, findMany: mocks.upFindMany },
    property: { findMany: mocks.propFindMany },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import {
  accessiblePropertyIds,
  canAccessNetwork,
  canAccessProperty,
  isAdmin,
  isFieldStaff,
  isManagerOrAbove,
  isPortfolioRole,
} from "./rbac";

const ALL_ROLES = Object.values(Role);

beforeEach(() => {
  mocks.upFindUnique.mockReset();
  mocks.upFindMany.mockReset();
  mocks.propFindMany.mockReset();
});

describe("role predicates", () => {
  it("isPortfolioRole is true only for CORPORATE and ADMIN", () => {
    expect(isPortfolioRole(Role.CORPORATE)).toBe(true);
    expect(isPortfolioRole(Role.ADMIN)).toBe(true);
    for (const r of [Role.HK, Role.PA, Role.MT, Role.MANAGER]) {
      expect(isPortfolioRole(r)).toBe(false);
    }
  });

  it("isAdmin is true only for ADMIN", () => {
    expect(isAdmin(Role.ADMIN)).toBe(true);
    for (const r of [Role.HK, Role.PA, Role.MT, Role.MANAGER, Role.CORPORATE]) {
      expect(isAdmin(r)).toBe(false);
    }
  });

  it("isManagerOrAbove is true for MANAGER, CORPORATE, ADMIN only", () => {
    for (const r of [Role.MANAGER, Role.CORPORATE, Role.ADMIN]) {
      expect(isManagerOrAbove(r)).toBe(true);
    }
    for (const r of [Role.HK, Role.PA, Role.MT]) {
      expect(isManagerOrAbove(r)).toBe(false);
    }
  });

  it("isFieldStaff is an allowlist of HK/PA/MT — NOT the complement of isManagerOrAbove", () => {
    for (const r of [Role.HK, Role.PA, Role.MT]) {
      expect(isFieldStaff(r)).toBe(true);
    }
    for (const r of [Role.MANAGER, Role.CORPORATE, Role.ADMIN, Role.NETWORK_TECH]) {
      expect(isFieldStaff(r)).toBe(false);
    }
  });

  // The previous version of this test asserted isFieldStaff was the exact
  // complement of isManagerOrAbove. That held only while every role was one or the
  // other. NETWORK_TECH is neither — it is IT/MSP staff gated by canAccessNetwork —
  // so the complement invariant is what made `!isManagerOrAbove` classify it as
  // field staff. Fail-open. The allowlist replaces both.
  it("NETWORK_TECH is neither field staff nor manager-or-above (fail-closed)", () => {
    expect(isFieldStaff(Role.NETWORK_TECH)).toBe(false);
    expect(isManagerOrAbove(Role.NETWORK_TECH)).toBe(false);
    expect(isPortfolioRole(Role.NETWORK_TECH)).toBe(false);
    expect(isAdmin(Role.NETWORK_TECH)).toBe(false);
    expect(canAccessNetwork(Role.NETWORK_TECH)).toBe(true);
  });

  it("field staff and manager-or-above never overlap", () => {
    for (const r of ALL_ROLES) {
      expect(isFieldStaff(r) && isManagerOrAbove(r)).toBe(false);
    }
  });
});

// Table-driven over EVERY Role. This is the guard that stops a future role from
// silently inheriting access: adding an enum member without adding a row here
// fails both `tsc` (missing Record<Role, …> key) and the exhaustiveness assertion.
const EXPECTED: Record<
  Role,
  { portfolio: boolean; admin: boolean; managerOrAbove: boolean; fieldStaff: boolean; network: boolean }
> = {
  [Role.HK]: { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true, network: false },
  [Role.PA]: { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true, network: false },
  [Role.MT]: { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: true, network: false },
  [Role.MANAGER]: { portfolio: false, admin: false, managerOrAbove: true, fieldStaff: false, network: false },
  [Role.CORPORATE]: { portfolio: true, admin: false, managerOrAbove: true, fieldStaff: false, network: true },
  [Role.ADMIN]: { portfolio: true, admin: true, managerOrAbove: true, fieldStaff: false, network: true },
  [Role.NETWORK_TECH]: { portfolio: false, admin: false, managerOrAbove: false, fieldStaff: false, network: true },
};

describe("role predicate matrix", () => {
  it("covers every Role in the enum", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ALL_ROLES].sort());
  });

  for (const [role, want] of Object.entries(EXPECTED) as [Role, (typeof EXPECTED)[Role]][]) {
    it(`classifies ${role} correctly`, () => {
      expect(isPortfolioRole(role)).toBe(want.portfolio);
      expect(isAdmin(role)).toBe(want.admin);
      expect(isManagerOrAbove(role)).toBe(want.managerOrAbove);
      expect(isFieldStaff(role)).toBe(want.fieldStaff);
      expect(canAccessNetwork(role)).toBe(want.network);
    });
  }
});

describe("canAccessProperty", () => {
  it("portfolio roles pass without touching the DB", async () => {
    for (const role of [Role.CORPORATE, Role.ADMIN]) {
      expect(await canAccessProperty({ id: "u1", role }, "prop-x")).toBe(true);
    }
    expect(mocks.upFindUnique).not.toHaveBeenCalled();
  });

  it("scoped role passes only with a user_properties membership row", async () => {
    mocks.upFindUnique.mockResolvedValueOnce({ userId: "u1" });
    expect(await canAccessProperty({ id: "u1", role: Role.MANAGER }, "prop-a")).toBe(true);

    mocks.upFindUnique.mockResolvedValueOnce(null);
    expect(await canAccessProperty({ id: "u1", role: Role.HK }, "prop-b")).toBe(false);

    expect(mocks.upFindUnique).toHaveBeenCalledWith({
      where: { userId_propertyId: { userId: "u1", propertyId: "prop-a" } },
      select: { userId: true },
    });
  });
});

describe("accessiblePropertyIds", () => {
  it("portfolio roles get every active property id", async () => {
    mocks.propFindMany.mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }]);
    const ids = await accessiblePropertyIds({ id: "u1", role: Role.ADMIN });
    expect(ids).toEqual(["p1", "p2"]);
    expect(mocks.propFindMany).toHaveBeenCalledWith({
      where: { active: true },
      select: { id: true },
    });
    expect(mocks.upFindMany).not.toHaveBeenCalled();
  });

  it("scoped roles get only their assigned property ids", async () => {
    mocks.upFindMany.mockResolvedValueOnce([{ propertyId: "p1" }, { propertyId: "p3" }]);
    const ids = await accessiblePropertyIds({ id: "u9", role: Role.PA });
    expect(ids).toEqual(["p1", "p3"]);
    expect(mocks.upFindMany).toHaveBeenCalledWith({
      where: { userId: "u9" },
      select: { propertyId: true },
    });
    expect(mocks.propFindMany).not.toHaveBeenCalled();
  });
});
