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
export function isOnSiteAssignable(
  role: Role,
  remote: boolean,
  alwaysAssignable = false,
): boolean {
  // Explicit per-row escape hatch, checked first because its whole purpose is
  // to beat the role rule. Set on exactly one account today (Kyle's, so he can
  // assign himself a checklist and walk it end to end); see the column comment
  // in schema.prisma before setting it on a second.
  if (alwaysAssignable) return true;
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

/**
 * USER ADMINISTRATION — may this role open Admin → Users at all?
 *
 * Widened from ADMIN to ADMIN + CORPORATE on 2026-09-11 (Kyle) so corporate
 * staff can change a user's role without going through the single admin@
 * account. It is deliberately NOT isPortfolioRole() even though the membership
 * is identical today: the two answer different questions, and a future
 * portfolio role that should not provision accounts must not inherit this by
 * accident.
 *
 * ⚠ This only answers "may they open the section". WHICH users they may act on
 * is canAdministerUser below, and every action re-checks it server-side —
 * a hidden button is not a guard.
 */
export function canManageUsers(role: Role): boolean {
  return role === Role.ADMIN || role === Role.CORPORATE;
}

/**
 * May `actorRole` act on an account currently holding `targetRole`?
 *
 * The escalation floor. CORPORATE gets the full user surface — create,
 * deactivate, delete, reset/set password, properties, role, location — but
 * **never on an ADMIN account**. Without this a CORPORATE user could reset the
 * admin@ password and sign in as ADMIN, which would make the whole distinction
 * decorative. Pair it with assignableRolesFor: one stops them reaching an
 * existing admin, the other stops them minting a new one.
 */
export function canAdministerUser(actorRole: Role, targetRole: Role): boolean {
  if (!canManageUsers(actorRole)) return false;
  if (isAdmin(actorRole)) return true;
  return !isAdmin(targetRole);
}

/**
 * Every role, in the order the Users table and role picker show them: field
 * staff, then on-property management, then the two portfolio roles last.
 *
 * The picker previously hard-coded six of the eight in UsersClient, so an
 * AGENT or NETWORK_TECH row had no option matching its own value — the reason
 * this list moved next to the enum it mirrors.
 */
export const ROLE_ORDER: readonly Role[] = [
  Role.HK,
  Role.PA,
  Role.MT,
  Role.MANAGER,
  Role.AGENT,
  Role.NETWORK_TECH,
  Role.CORPORATE,
  Role.ADMIN,
];

/** Roles `actorRole` may GRANT. CORPORATE may not mint an ADMIN. */
export function assignableRolesFor(actorRole: Role): Role[] {
  if (!canManageUsers(actorRole)) return [];
  if (isAdmin(actorRole)) return [...ROLE_ORDER];
  return ROLE_ORDER.filter((r) => r !== Role.ADMIN);
}

/**
 * Does a row's Location actually CHANGE anything for this role?
 *
 * Location is recorded for everyone — it is a fact about the person, and the
 * Users table shows it on every row. But it only feeds a decision for MANAGER,
 * the one role that spans both the 8 on-site Property Managers and the 3 Remote
 * ones; nothing else in the schema tells those apart (see the column comment in
 * schema.prisma), and isOnSiteAssignable consults `remote` for MANAGER alone.
 *
 * Used to caption the control — "drives the Assign to pool" vs "recorded only"
 * — so nobody flips a housekeeper to Remote expecting work to stop reaching
 * them. It must NOT be used to hide the field: a hidden field is a fact you
 * cannot correct.
 */
export function locationAffectsAssignment(role: Role): boolean {
  return role === Role.MANAGER;
}

/**
 * Why is this person assignable, or why not — the sentence the Users admin
 * shows next to the Assignable toggle.
 *
 * Pure, and derived from the SAME predicate the batch wizard's pool uses, so
 * the explanation cannot drift from the behaviour it describes. That drift is
 * a live risk here: the rule exists TWICE, as isOnSiteAssignable and as its
 * SQL mirror in app/checklists/new/page.tsx, and a third prose copy in JSX
 * would have been a third thing to keep in step.
 *
 * `hasProperties` is the half people miss. The pool query requires a
 * user_properties row at the active property AND an eligible role — so a
 * CORPORATE account with the override set but no property rows is still
 * invisible everywhere, which is exactly the trap scripts/set-test-assignee.ts
 * was written to document.
 */
export function explainAssignability(
  role: Role,
  remote: boolean,
  alwaysAssignable: boolean,
  hasProperties: boolean,
): { assignable: boolean; reason: string } {
  const eligible = isOnSiteAssignable(role, remote, alwaysAssignable);

  if (eligible && !hasProperties) {
    return {
      assignable: false,
      reason:
        "Eligible by role, but holds no properties — the pool also requires a property assignment, so this account appears nowhere.",
    };
  }
  if (!eligible) {
    if (role === Role.MANAGER && remote) {
      return {
        assignable: false,
        reason: "Remote managers are not offered room-level work. Turn on Assignable to override.",
      };
    }
    return {
      assignable: false,
      reason: `${role} is not offered checklists. Turn on Assignable to override.`,
    };
  }
  if (alwaysAssignable) {
    return {
      assignable: true,
      reason: "Assignable by override, not by role.",
    };
  }
  return { assignable: true, reason: "Assignable by role." };
}
