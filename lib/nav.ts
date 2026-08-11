import { Role } from "@prisma/client";
import { canAccessNetwork, isAdmin, isManagerOrAbove } from "./roles";

// Single source of truth for app navigation.
//
// Restructured 2026-08-03 from a flat 14-item list into SECTIONS (Kyle): the
// flat list put Users, Tickets and Templates at the same level, and the mobile
// bar crammed 11 of them into one row for ADMIN. Sections give both breakpoints
// the same shape — a collapsible rail on desktop, a tab bar + sheet on mobile.
//
// Pure and dependency-free apart from the RBAC predicates, so it unit-tests
// without a DOM and can be imported from server and client components alike.
// Icons are stored as lucide KEY STRINGS, not components: importing icon
// components here would drag JSX into a module the server imports.

export type NavItem = {
  href: string;
  label: string;
  /** Section this item belongs to; used for active-state and grouping. */
  section: SectionId;
};

export type SectionId =
  | "home"
  | "checklist"
  | "network"
  | "maintenance"
  | "construction"
  | "admin";

export type NavSection = {
  id: SectionId;
  label: string;
  /** lucide-react export name, resolved to a component in the client. */
  icon: string;
  /** Leaf sections navigate directly and render no chevron/flyout. */
  href?: string;
  children?: NavItem[];
  /**
   * Prefix owning routes that belong to the section but are not nav
   * destinations — e.g. /maintenance/jobs/[id], reached from the calendar
   * rather than the rail. Used ONLY by sectionForPathname, so those pages
   * still highlight their section. Deliberately not `href`: the section is a
   * parent, and the href/children XOR is what keeps the rail's leaf-vs-parent
   * rendering unambiguous.
   */
  basePath?: string;
  /**
   * Section exists in the nav but has nothing behind it yet. Renders a "Soon"
   * chip and a stub page. A nav entry that 404s is worse than no nav entry.
   */
  unbuilt?: true;
};

const CHECKLIST_CHILDREN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", section: "checklist" },
  { href: "/review", label: "Review", section: "checklist" },
  { href: "/issues", label: "Issues", section: "checklist" },
  { href: "/rules", label: "Rules", section: "checklist" },
  { href: "/templates", label: "Templates", section: "checklist" },
  { href: "/completed", label: "Completed", section: "checklist" },
  { href: "/reports/completeness", label: "Reports", section: "checklist" },
];

const NETWORK_CHILDREN: NavItem[] = [
  { href: "/network", label: "Overview", section: "network" },
  { href: "/network/tickets", label: "Tickets", section: "network" },
  { href: "/network/wifi", label: "WiFi", section: "network" },
];

const ADMIN_CHILDREN: NavItem[] = [
  { href: "/admin/users", label: "Users", section: "admin" },
  { href: "/admin/sla", label: "SLA", section: "admin" },
  { href: "/admin/properties", label: "Properties", section: "admin" },
];

// Home is `/` for every role (Kyle 2026-08-03). It currently renders the
// existing Today surface; the cross-app summary lands there later without a
// route change.
const HOME: NavSection = { id: "home", label: "Home", icon: "House", href: "/" };

const CHECKLIST: NavSection = {
  id: "checklist",
  label: "Checklist",
  icon: "SquareCheck",
  children: CHECKLIST_CHILDREN,
};

const NETWORK: NavSection = {
  id: "network",
  label: "Network",
  icon: "Network",
  children: NETWORK_CHILDREN,
};

// Maintenance became a real section on 2026-08-11 when contractor scheduling
// shipped (ADR-030). It stays a SECTION rather than becoming a seventh
// top-level one: the mobile bar is held at five items so it never scrolls
// (ADMIN sees six sections, less Admin on mobile = exactly five), and a
// seventh would make six. Ticketing adds siblings here when Track C lands.
const MAINTENANCE: NavSection = {
  id: "maintenance",
  label: "Maintenance",
  icon: "Wrench",
  basePath: "/maintenance",
  children: [
    { href: "/maintenance/schedule", label: "Schedule", section: "maintenance" },
    { href: "/maintenance/daily", label: "Daily", section: "maintenance" },
    { href: "/maintenance/contractors", label: "Contractors", section: "maintenance" },
  ],
};

const CONSTRUCTION: NavSection = {
  id: "construction",
  label: "Construction",
  icon: "HardHat",
  href: "/construction",
  unbuilt: true,
};

const ADMIN: NavSection = {
  id: "admin",
  label: "Admin",
  icon: "Settings",
  children: ADMIN_CHILDREN,
};

// Visibility comes from the SAME predicates authorization uses (lib/roles.ts,
// re-exported by lib/rbac.ts) — no second copy of the rules. This is display
// only: showing a section is not permission to see a property's rows, which
// every page still guards for itself.
/**
 * Sections visible to a role, in display order.
 *
 * Field staff get Home alone — one destination, so the chrome degrades to no
 * tab bar rather than a one-item bar that teaches nothing.
 */
export function navSectionsForRole(role: Role): NavSection[] {
  const sections: NavSection[] = [HOME];
  if (isManagerOrAbove(role)) sections.push(CHECKLIST);
  if (canAccessNetwork(role)) sections.push(NETWORK);
  if (isManagerOrAbove(role)) sections.push(MAINTENANCE, CONSTRUCTION);
  if (isAdmin(role)) sections.push(ADMIN);
  return sections;
}

/**
 * Sections for the mobile tab bar. Admin is desktop-only, as it was before the
 * restructure — which also keeps the bar at five items so it never scrolls.
 */
export function mobileSectionsForRole(role: Role): NavSection[] {
  return navSectionsForRole(role).filter((s) => s.id !== "admin");
}

/** Flat list of every reachable item, for tests and link auditing. */
export function navItemsForRole(role: Role): NavItem[] {
  return navSectionsForRole(role).flatMap((s) =>
    s.children ?? (s.href ? [{ href: s.href, label: s.label, section: s.id }] : []),
  );
}

/** Home (/) matches only the exact root; everything else matches by prefix. */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Which section owns a pathname — drives which rail section renders expanded
 * and which tab reads active. Longest href wins so `/network/tickets` resolves
 * to network rather than matching a shorter prefix elsewhere.
 */
export function sectionForPathname(pathname: string): SectionId | null {
  if (pathname === "/") return "home";

  let best: { section: SectionId; length: number } | null = null;
  for (const section of ALL_SECTIONS) {
    const hrefs = [
      ...(section.href && section.href !== "/" ? [section.href] : []),
      ...(section.basePath ? [section.basePath] : []),
      ...(section.children?.map((c) => c.href) ?? []),
    ];
    for (const href of hrefs) {
      if (!isNavItemActive(href, pathname)) continue;
      if (best === null || href.length > best.length) {
        best = { section: section.id, length: href.length };
      }
    }
  }
  return best?.section ?? null;
}

const ALL_SECTIONS: NavSection[] = [
  HOME,
  CHECKLIST,
  NETWORK,
  MAINTENANCE,
  CONSTRUCTION,
  ADMIN,
];

// Routes that render bare (no shell chrome): auth, standalone POCs, and the
// phone-first checklist fill runtime.
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
  return SHELL_HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Cookie holding the desktop rail's collapsed state, read server-side. */
export const NAV_COLLAPSED_COOKIE = "nav_collapsed";
