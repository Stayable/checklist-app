import { Role } from "@prisma/client";

/**
 * 3-role display grouping (ADR-023). StayCheck's PRD speaks in three roles —
 * Staff / Manager / Admin — while the DB keeps the 6-value {@link Role} enum
 * (HK/PA/MT/MANAGER/CORPORATE/ADMIN) so RBAC and AM/PM-shift logic that need
 * PA distinct from HK stay intact. This maps DB role → display label; it is a
 * label only and must NOT be used for authorization (use lib/rbac.ts).
 */
export type DisplayRole = "Staff" | "Manager" | "Admin";

export const DISPLAY_ROLES = ["Staff", "Manager", "Admin"] as const;

const MAP: Record<Role, DisplayRole> = {
  [Role.HK]: "Staff",
  [Role.PA]: "Staff",
  [Role.MT]: "Staff",
  [Role.MANAGER]: "Manager",
  [Role.CORPORATE]: "Admin",
  [Role.ADMIN]: "Admin",
  // IT staff (NETWORK section). Folded into the "Admin" display bucket for
  // labels only — never used for authorization (see lib/rbac.ts).
  [Role.NETWORK_TECH]: "Admin",
  // Checklist-only management role. Labelled "Manager" because that is what its
  // powers look like inside the Checklist section; the narrower access is
  // enforced by lib/roles.ts, not by this label.
  [Role.AGENT]: "Manager",
};

export function displayRole(role: Role): DisplayRole {
  return MAP[role];
}

export function isDisplayRole(value: string): value is DisplayRole {
  return (DISPLAY_ROLES as readonly string[]).includes(value);
}
