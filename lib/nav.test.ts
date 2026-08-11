import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { canAccessMaintenance, canAccessNetwork, isAdmin, isManagerOrAbove } from "./roles";
import {
  isNavItemActive,
  mobileSectionsForRole,
  navItemsForRole,
  navSectionsForRole,
  sectionForPathname,
  shouldHideShell,
} from "./nav";

const ids = (role: Role) => navSectionsForRole(role).map((s) => s.id);

describe("navSectionsForRole", () => {
  it("field staff get Home alone", () => {
    for (const role of [Role.HK, Role.PA, Role.MT]) {
      expect(ids(role)).toEqual(["home"]);
    }
  });

  it("manager gets checklist + the unbuilt sections, no network or admin", () => {
    expect(ids(Role.MANAGER)).toEqual(["home", "checklist", "maintenance", "construction"]);
  });

  it("corporate adds network, still no admin", () => {
    expect(ids(Role.CORPORATE)).toEqual([
      "home",
      "checklist",
      "network",
      "maintenance",
      "construction",
    ]);
  });

  it("admin gets everything, admin last", () => {
    expect(ids(Role.ADMIN)).toEqual([
      "home",
      "checklist",
      "network",
      "maintenance",
      "construction",
      "admin",
    ]);
  });

  it("NETWORK_TECH gets Home + Network only — no checklist surfaces", () => {
    expect(ids(Role.NETWORK_TECH)).toEqual(["home", "network"]);
  });

  // The point of the AGENT role: the checklist app and nothing else.
  it("AGENT gets Home + Checklist only — no maintenance, construction, network or admin", () => {
    expect(ids(Role.AGENT)).toEqual(["home", "checklist"]);
  });

  // Maintenance stopped being a stub on 2026-08-11 (contractor scheduling,
  // ADR-030). Construction is the only unbuilt section left.
  it("marks construction unbuilt, and nothing else", () => {
    const unbuilt = navSectionsForRole(Role.ADMIN)
      .filter((s) => s.unbuilt)
      .map((s) => s.id);
    expect(unbuilt).toEqual(["construction"]);
  });

  it("gives maintenance its three children in order", () => {
    const maintenance = navSectionsForRole(Role.MANAGER).find((s) => s.id === "maintenance");
    expect(maintenance?.unbuilt).toBeUndefined();
    expect(maintenance?.children?.map((c) => c.href)).toEqual([
      "/maintenance/schedule",
      "/maintenance/daily",
      "/maintenance/contractors",
    ]);
  });

  it("every section is either a leaf with an href or a parent with children", () => {
    for (const s of navSectionsForRole(Role.ADMIN)) {
      expect(Boolean(s.href) !== Boolean(s.children)).toBe(true);
    }
  });

  it("gives every section a non-empty icon key", () => {
    for (const s of navSectionsForRole(Role.ADMIN)) {
      expect(s.icon.length).toBeGreaterThan(0);
    }
  });

  // Locks the mapping from predicate to section. nav.ts and rbac.ts share these
  // predicates via lib/roles.ts, so this catches a section being wired to the
  // wrong one rather than a divergent copy.
  it("section visibility follows the role predicates for every role", () => {
    for (const role of Object.values(Role)) {
      const visible = new Set(ids(role));
      expect(visible.has("checklist")).toBe(isManagerOrAbove(role));
      expect(visible.has("network")).toBe(canAccessNetwork(role));
      expect(visible.has("maintenance")).toBe(canAccessMaintenance(role));
      expect(visible.has("construction")).toBe(canAccessMaintenance(role));
      expect(visible.has("admin")).toBe(isAdmin(role));
      // Home is unconditional.
      expect(visible.has("home")).toBe(true);
    }
  });
});

describe("mobileSectionsForRole", () => {
  // Admin was desktop-only before the restructure; keeping it that way holds the
  // bar at five items so it never needs to scroll.
  it("drops admin", () => {
    expect(mobileSectionsForRole(Role.ADMIN).map((s) => s.id)).not.toContain("admin");
  });

  it("never exceeds five items for any role", () => {
    for (const role of Object.values(Role)) {
      expect(mobileSectionsForRole(role).length).toBeLessThanOrEqual(5);
    }
  });
});

describe("navItemsForRole", () => {
  it("flattens sections into reachable hrefs", () => {
    expect(navItemsForRole(Role.MANAGER).map((i) => i.href)).toEqual([
      "/",
      "/dashboard",
      "/review",
      "/issues",
      "/rules",
      "/templates",
      "/completed",
      "/reports/completeness",
      "/maintenance/schedule",
      "/maintenance/daily",
      "/maintenance/contractors",
      "/construction",
    ]);
  });

  it("field staff reach only the root", () => {
    expect(navItemsForRole(Role.HK).map((i) => i.href)).toEqual(["/"]);
  });
});

describe("sectionForPathname", () => {
  it("resolves the root to home", () => {
    expect(sectionForPathname("/")).toBe("home");
  });

  it("resolves checklist children", () => {
    expect(sectionForPathname("/review")).toBe("checklist");
    expect(sectionForPathname("/review/abc-123")).toBe("checklist");
    expect(sectionForPathname("/reports/completeness")).toBe("checklist");
  });

  it("resolves network children, including nested detail routes", () => {
    expect(sectionForPathname("/network")).toBe("network");
    expect(sectionForPathname("/network/tickets")).toBe("network");
    expect(sectionForPathname("/network/tickets/abc")).toBe("network");
    expect(sectionForPathname("/network/devices/abc")).toBe("network");
  });

  it("resolves admin and the unbuilt sections", () => {
    expect(sectionForPathname("/admin/users")).toBe("admin");
    expect(sectionForPathname("/construction")).toBe("construction");
  });

  it("resolves maintenance children and its non-nav job routes", () => {
    expect(sectionForPathname("/maintenance/schedule")).toBe("maintenance");
    expect(sectionForPathname("/maintenance/daily")).toBe("maintenance");
    expect(sectionForPathname("/maintenance/contractors")).toBe("maintenance");
    // /maintenance itself only redirects, and the job routes are reached from
    // the calendar rather than the rail — both are owned via basePath so the
    // section still reads active while you are on them.
    expect(sectionForPathname("/maintenance")).toBe("maintenance");
    expect(sectionForPathname("/maintenance/jobs/new")).toBe("maintenance");
    expect(sectionForPathname("/maintenance/jobs/abc-123")).toBe("maintenance");
  });

  it("returns null for routes outside the nav", () => {
    expect(sectionForPathname("/profile")).toBeNull();
    expect(sectionForPathname("/login")).toBeNull();
  });

  it("does not let the root swallow every path", () => {
    expect(sectionForPathname("/dashboard")).not.toBe("home");
  });
});

describe("isNavItemActive", () => {
  it("matches the root exactly", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/review")).toBe(false);
  });

  it("matches others by prefix on a path boundary", () => {
    expect(isNavItemActive("/network", "/network/tickets")).toBe(true);
    // Guards against /networkfoo matching /network.
    expect(isNavItemActive("/network", "/networkfoo")).toBe(false);
  });
});

describe("shouldHideShell", () => {
  it("hides on auth/standalone routes", () => {
    for (const p of ["/login", "/install", "/ios-spike", "/photo-test", "/checklists/abc"]) {
      expect(shouldHideShell(p)).toBe(true);
    }
  });

  it("shows on app routes", () => {
    for (const p of ["/", "/review", "/issues", "/rules", "/admin/users", "/maintenance"]) {
      expect(shouldHideShell(p)).toBe(false);
    }
  });

  it("SHOWS shell on manual create", () => {
    expect(shouldHideShell("/checklists/new")).toBe(false);
  });
});
