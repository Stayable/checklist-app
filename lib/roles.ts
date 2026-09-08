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

/**
 * Manager and above — the CHECKLIST review/management surfaces.
 *
 * AGENT is included: it exists so RPM/GSA testers get the full checklist
 * experience (review, approve, issues, dashboard, reports) without any of the
 * other sections. Including it here is what makes ~20 existing requireManager()
 * call sites work for AGENT with no edits — and is exactly why Maintenance
 * needed its own predicate below, since it also sat behind requireManager().
 */
export function isManagerOrAbove(role: Role): boolean {
  return role === Role.MANAGER || role === Role.AGENT || isPortfolioRole(role);
}

/**
 * MAINTENANCE section access (contractor scheduling; Construction stub).
 *
 * Split out from isManagerOrAbove on 2026-08-12 when AGENT arrived. Maintenance
 * was gated by requireManager(), so widening that predicate for checklist
 * testers would silently have handed them the contractor calendar, real
 * contractor names and the job mutations. Hiding the nav entry would not have
 * helped: a nav entry is not a guard, and every /maintenance route and action
 * checks this instead.
 *
 * ⚠ NARROWED 2026-08-13 to PORTFOLIO ROLES ONLY. MANAGER was removed when the
 * first real property managers were provisioned (8 PMs, 2 area managers, 3
 * remote PMs). The section holds every contractor's name and phone number and
 * lets a user reassign or close another property's jobs — contractor
 * scheduling is coordinated centrally, not per property, so a property manager
 * has no route to it. At the time of the change no MANAGER account existed, so
 * nothing lost access.
 *
 * If a property manager ever needs it, the honest fix is per-property scoping
 * of /maintenance (as Network got), not widening this predicate — the calendar
 * currently shows the whole portfolio to anyone who can open it.
 */
export function canAccessMaintenance(role: Role): boolean {
  return isPortfolioRole(role);
}

/** Field staff (HK, PA, MT) — phone-first fill surfaces; the PWA-install audience. */
/**
 * ⚠ Defined by NEGATION, so every role not named in isManagerOrAbove counts as
 * field staff — including NETWORK_TECH, which the schema explicitly calls "NOT
 * field staff". Harmless at its one call site (a phone-only PWA install nudge
 * in app/page.tsx) and left alone rather than narrowed unasked, but do not
 * build an authorization or assignment rule on it: a role added to the enum
 * silently joins this set. isOnSiteAssignable below enumerates instead.
 */
export function isFieldStaff(role: Role): boolean {
  return !isManagerOrAbove(role);
}

/**
 * Can real work at a property be handed to this person?
 *
 * The "Assign to" pool in the batch-create wizard (Kyle, 2026-09-09). Answers
 * "does this person physically work here", which is a different question from
 * every other predicate in this file — those are about what a role may SEE.
 *
 * In:  HK / PA / MT (field staff, on-site by definition) and the on-site
 *      Property Managers.
 * Out: the 3 Remote Property Managers, CORPORATE, ADMIN, and AGENT. AGENT is
 *      the night-audit reviewers — they review and flag other people's
 *      checklists, so assigning them one is a category error.
 *
 * `remote` is only consulted for MANAGER, the one role that spans both, and a
 * field-staff row is on-site whatever the column says — so a forgotten flag on
 * a new housekeeper cannot make them unassignable.
 *
 * The three field roles are listed explicitly rather than via isFieldStaff:
 * that predicate is a negation of isManagerOrAbove, so it answers true for
 * NETWORK_TECH and would answer true for any role added to the enum later.
 * A new role should have to be considered here deliberately — lib/roles.test.ts
 * asserts the full enum so adding one fails loudly.
 */
export function isOnSiteAssignable(role: Role, remote: boolean): boolean {
  if (role === Role.HK || role === Role.PA || role === Role.MT) return true;
  return role === Role.MANAGER && !remote;
}

/**
 * NETWORK section access (device monitoring + IT ticketing).
 *
 * NETWORK_TECH, ADMIN and CORPORATE see the FULL portfolio. MANAGER was added
 * 2026-08-13 (Kyle) and is **property-scoped** — a property manager sees their
 * own properties' devices, tickets and guest WiFi and nothing else.
 *
 * ⚠ THIS PREDICATE ONLY ANSWERS "may they open the section". It says nothing
 * about which rows they see, and the two must not be confused: before the
 * scoping landed, every network page showed the whole estate to anyone who
 * could open it. The row-level answer is lib/network/scope.server.ts
 * (networkScopeFor) and it is applied at every query site — the dashboard's ten
 * aggregates, the ticket list, the CSV export, all four detail pages, both
 * ticket mutations, and the WiFi summary API.
 *
 * AGENT is deliberately absent: checklist-only, per its own note above.
 */
export function canAccessNetwork(role: Role): boolean {
  return (
    role === Role.NETWORK_TECH ||
    role === Role.ADMIN ||
    role === Role.CORPORATE ||
    role === Role.MANAGER
  );
}
