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
  canAccessMaintenance,
  canAccessProperty,
  isAdmin,
  canAccessNetwork,
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

  it("isManagerOrAbove is true for MANAGER, AGENT, CORPORATE, ADMIN only", () => {
    for (const r of [Role.MANAGER, Role.AGENT, Role.CORPORATE, Role.ADMIN]) {
      expect(isManagerOrAbove(r)).toBe(true);
    }
    for (const r of [Role.HK, Role.PA, Role.MT]) {
      expect(isManagerOrAbove(r)).toBe(false);
    }
  });

  // AGENT is checklist-only (added 2026-08-12 for RPM/GSA testing). These are
  // the tests that stop a later refactor from quietly handing it the contractor
  // calendar: /maintenance/* is guarded by canAccessMaintenance, so if this
  // drifts, real contractor data becomes visible to test accounts.
  // NARROWED 2026-08-13: MANAGER lost Maintenance when the first real property
  // managers were provisioned. The contractor calendar shows the WHOLE
  // portfolio — every contractor's name and phone number, and job mutations on
  // any property — so it is not something a property manager should reach by
  // virtue of managing one property.
  it("canAccessMaintenance is portfolio roles only", () => {
    for (const r of [Role.CORPORATE, Role.ADMIN]) {
      expect(canAccessMaintenance(r)).toBe(true);
    }
    for (const r of [Role.MANAGER, Role.AGENT, Role.HK, Role.PA, Role.MT, Role.NETWORK_TECH]) {
      expect(canAccessMaintenance(r)).toBe(false);
    }
  });

  it("maintenance access is a strict subset of manager-or-above", () => {
    // Anything that reaches Maintenance must also clear the checklist bar; the
    // reverse does not hold. MANAGER and AGENT are both on the wide side now.
    for (const r of ALL_ROLES) {
      if (canAccessMaintenance(r)) expect(isManagerOrAbove(r)).toBe(true);
    }
    const divergent = ALL_ROLES.filter((r) => isManagerOrAbove(r) !== canAccessMaintenance(r));
    expect(new Set(divergent)).toEqual(new Set([Role.MANAGER, Role.AGENT]));
  });

  it("AGENT gets no network, no admin, and is not field staff", () => {
    expect(canAccessNetwork(Role.AGENT)).toBe(false);
    expect(isAdmin(Role.AGENT)).toBe(false);
    expect(isPortfolioRole(Role.AGENT)).toBe(false);
    // Not field staff: it holds review/approve powers, so the phone-first
    // fill-only surfaces are not its home.
    expect(isFieldStaff(Role.AGENT)).toBe(false);
  });

  it("isFieldStaff is the exact complement of isManagerOrAbove", () => {
    for (const r of ALL_ROLES) {
      expect(isFieldStaff(r)).toBe(!isManagerOrAbove(r));
    }
  });

  it("every role is classified as exactly one of field-staff / manager-or-above", () => {
    for (const r of ALL_ROLES) {
      expect(isFieldStaff(r) !== isManagerOrAbove(r)).toBe(true);
    }
  });
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
