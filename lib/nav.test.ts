import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  navItemsForRole,
  isNavItemActive,
  shouldHideShell,
} from "./nav";

describe("navItemsForRole", () => {
  it("field staff get only Today", () => {
    for (const r of [Role.HK, Role.PA, Role.MT]) {
      const items = navItemsForRole(r);
      expect(items.map((i) => i.href)).toEqual(["/"]);
    }
  });

  it("manager gets the management surfaces, no admin or network group", () => {
    const hrefs = navItemsForRole(Role.MANAGER).map((i) => i.href);
    expect(hrefs).toEqual(["/", "/dashboard", "/review", "/issues", "/rules", "/templates", "/completed", "/reports/completeness"]);
    expect(navItemsForRole(Role.MANAGER).some((i) => i.group === "admin")).toBe(false);
    expect(navItemsForRole(Role.MANAGER).some((i) => i.group === "network")).toBe(false);
  });

  it("corporate gets the management surfaces plus the network group, no admin group", () => {
    const hrefs = navItemsForRole(Role.CORPORATE).map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/dashboard",
      "/review",
      "/issues",
      "/rules",
      "/templates",
      "/completed",
      "/reports/completeness",
      "/network",
      "/network/tickets",
    ]);
    expect(navItemsForRole(Role.CORPORATE).some((i) => i.group === "admin")).toBe(false);
  });

  it("admin gets management surfaces plus the admin and network groups", () => {
    const items = navItemsForRole(Role.ADMIN);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/dashboard",
      "/review",
      "/issues",
      "/rules",
      "/templates",
      "/completed",
      "/reports/completeness",
      "/admin/users",
      "/admin/sla",
      "/admin/properties",
      "/network",
      "/network/tickets",
    ]);
    expect(items.filter((i) => i.group === "admin")).toHaveLength(3);
    expect(items.filter((i) => i.group === "network")).toHaveLength(2);
  });

  it("NETWORK_TECH gets only the network group (no checklist nav at all)", () => {
    const items = navItemsForRole(Role.NETWORK_TECH);
    expect(items.map((i) => i.href)).toEqual(["/network", "/network/tickets"]);
    expect(items.every((i) => i.group === "network")).toBe(true);
  });

  it("MANAGER sees Templates", () => {
    expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/templates")).toBe(true);
  });

  it("ADMIN no longer points at /admin/templates", () => {
    expect(navItemsForRole(Role.ADMIN).some((n) => n.href === "/admin/templates")).toBe(false);
    expect(navItemsForRole(Role.ADMIN).some((n) => n.href === "/templates")).toBe(true);
  });

  it("field staff do NOT see Templates", () => {
    expect(navItemsForRole(Role.HK).some((n) => n.href === "/templates")).toBe(false);
  });

  it("MANAGER sees Completed", () => {
    expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/completed")).toBe(true);
  });

  it("field staff do NOT see Completed", () => {
    expect(navItemsForRole(Role.HK).some((n) => n.href === "/completed")).toBe(false);
  });

  it("MANAGER sees Reports", () => {
    expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/reports/completeness")).toBe(true);
  });

  it("field staff do NOT see Reports", () => {
    expect(navItemsForRole(Role.HK).some((n) => n.href === "/reports/completeness")).toBe(false);
  });

  it("MANAGER sees Dashboard", () => {
    expect(navItemsForRole(Role.MANAGER).some((n) => n.href === "/dashboard")).toBe(true);
  });

  it("ADMIN sees /templates exactly once", () => {
    const adminHrefs = navItemsForRole(Role.ADMIN).map((i) => i.href);
    expect(adminHrefs.filter((h) => h === "/templates")).toHaveLength(1);
  });
});

describe("isNavItemActive", () => {
  it("Today is active only on exact root", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/review")).toBe(false);
  });

  it("section items match by prefix", () => {
    expect(isNavItemActive("/review", "/review")).toBe(true);
    expect(isNavItemActive("/review", "/review/abc123")).toBe(true);
    expect(isNavItemActive("/issues", "/review/abc123")).toBe(false);
  });

  it("admin sub-items match their own prefix, not the whole /admin tree", () => {
    expect(isNavItemActive("/admin/users", "/admin/users")).toBe(true);
    expect(isNavItemActive("/admin/templates", "/admin/users")).toBe(false);
  });
});

describe("shouldHideShell", () => {
  it("hides on auth/standalone routes", () => {
    for (const p of ["/login", "/install", "/ios-spike", "/photo-test", "/checklists/abc"]) {
      expect(shouldHideShell(p)).toBe(true);
    }
  });

  it("shows on app routes", () => {
    for (const p of ["/", "/review", "/issues", "/rules", "/admin/users"]) {
      expect(shouldHideShell(p)).toBe(false);
    }
  });

  it("hides shell on the fill runtime", () => {
    expect(shouldHideShell("/checklists/abc-123")).toBe(true);
  });

  it("SHOWS shell on manual create", () => {
    expect(shouldHideShell("/checklists/new")).toBe(false);
  });
});
