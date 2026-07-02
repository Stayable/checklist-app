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
};

export function displayRole(role: Role): DisplayRole {
  return MAP[role];
}

export function isDisplayRole(value: string): value is DisplayRole {
  return (DISPLAY_ROLES as readonly string[]).includes(value);
}
