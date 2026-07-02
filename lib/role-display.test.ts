import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { displayRole, DISPLAY_ROLES, isDisplayRole } from "./role-display";

describe("displayRole", () => {
  it("maps field-staff roles to Staff", () => {
    expect(displayRole(Role.HK)).toBe("Staff");
    expect(displayRole(Role.PA)).toBe("Staff");
    expect(displayRole(Role.MT)).toBe("Staff");
  });
  it("maps MANAGER to Manager", () => {
    expect(displayRole(Role.MANAGER)).toBe("Manager");
  });
  it("maps CORPORATE and ADMIN to Admin", () => {
    expect(displayRole(Role.CORPORATE)).toBe("Admin");
    expect(displayRole(Role.ADMIN)).toBe("Admin");
  });
  it("covers every enum value (no unmapped role)", () => {
    for (const r of Object.values(Role)) {
      expect(DISPLAY_ROLES).toContain(displayRole(r));
    }
  });
});

describe("isDisplayRole", () => {
  it("accepts the three display groups", () => {
    expect(isDisplayRole("Staff")).toBe(true);
    expect(isDisplayRole("Manager")).toBe(true);
    expect(isDisplayRole("Admin")).toBe(true);
  });
  it("rejects raw enum values and junk", () => {
    expect(isDisplayRole("HK")).toBe(false);
    expect(isDisplayRole("staff")).toBe(false);
    expect(isDisplayRole("")).toBe(false);
  });
});
