import { Role } from "@prisma/client";

// Pure role predicates (ADR-013). Extracted from lib/rbac.ts on 2026-08-03 so
// that modules which must NOT pull in server-only code can still ask "does this
// role see X?" — lib/nav.ts is imported by client components, and rbac.ts brings
// `auth` and `next/navigation` with it.
//
// rbac.ts re-exports everything here, so every existing import site is unchanged
// and rbac remains the place you look for authorization.
//
// These answer VISIBILITY. They are not a substitute for a page guard: knowing a
// role may see a section says nothing about whether this user may see this
// property's rows.

/** CORPORATE and ADMIN see every property; everyone else is scoped. */
export function isPortfolioRole(role: Role): boolean {
  return role === Role.CORPORATE || role === Role.ADMIN;
}

export function isAdmin(role: Role): boolean {
  return role === Role.ADMIN;
}

/** Manager and above (manager, corporate, admin) — review/management surfaces. */
export function isManagerOrAbove(role: Role): boolean {
  return role === Role.MANAGER || isPortfolioRole(role);
}

/** Field staff (HK, PA, MT) — phone-first fill surfaces; the PWA-install audience. */
export function isFieldStaff(role: Role): boolean {
  return !isManagerOrAbove(role);
}

/**
 * NETWORK section access (device monitoring + IT ticketing). Simpler than the
 * checklist RBAC model: NETWORK_TECH (dedicated IT/MSP role), ADMIN, and
 * CORPORATE all see the FULL portfolio — there is no per-property
 * user_properties scoping for network. MANAGER is not granted network access
 * in v1.
 */
export function canAccessNetwork(role: Role): boolean {
  return role === Role.NETWORK_TECH || role === Role.ADMIN || role === Role.CORPORATE;
}
