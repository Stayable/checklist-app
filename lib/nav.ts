import { Role } from "@prisma/client";

// Single source of truth for app navigation (replaces BottomNav.managerTabs and
// the admin layout header). Pure + dependency-free so it unit-tests cleanly and
// can be imported from both server and client components.

export type NavItem = { href: string; label: string; group: "main" | "admin" };

const MAIN_MANAGER: NavItem[] = [
  { href: "/", label: "Today", group: "main" },
  { href: "/review", label: "Review", group: "main" },
  { href: "/issues", label: "Issues", group: "main" },
  { href: "/rules", label: "Rules", group: "main" },
];

const ADMIN_GROUP: NavItem[] = [
  { href: "/admin/users", label: "Users", group: "admin" },
  { href: "/templates", label: "Templates", group: "admin" },
  { href: "/admin/sla", label: "SLA", group: "admin" },
  { href: "/admin/properties", label: "Properties", group: "admin" },
];

/** Nav items for a role. Field staff have a single Today surface. */
export function navItemsForRole(role: Role): NavItem[] {
  if (role === Role.ADMIN) return [...MAIN_MANAGER, ...ADMIN_GROUP];
  if (role === Role.MANAGER || role === Role.CORPORATE) return MAIN_MANAGER;
  return [{ href: "/", label: "Today", group: "main" }];
}

/** Today (/) matches only the exact root; everything else matches by prefix. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Routes that render bare (no shell chrome): auth, standalone POCs, and the
// phone-first checklist fill runtime (reparented in a later plan).
export const SHELL_HIDE_PREFIXES = [
  "/login",
  "/install",
  "/ios-spike",
  "/photo-test",
  "/checklists",
];

// Routes under /checklists that render with the shell (management surfaces).
const SHELL_SHOW_EXACT = new Set(["/checklists/new"]);

export function shouldHideShell(pathname: string): boolean {
  if (SHELL_SHOW_EXACT.has(pathname)) return false;
  return SHELL_HIDE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}
