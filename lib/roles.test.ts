import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  ROLE_ORDER,
  assignableRolesFor,
  canAdministerUser,
  canManageUsers,
  explainAssignability,
  isOnSiteAssignable,
  locationAffectsAssignment,
} from "./roles";

// The rest of lib/roles.ts is covered through lib/rbac.test.ts, which
// re-exports it. This file exists for isOnSiteAssignable, which answers a
// different question from every other predicate there — "does this person
// physically work at the property", not "what may this role see".

describe("isOnSiteAssignable", () => {
  it("field staff are on-site by role, whatever the flag says", () => {
    for (const role of [Role.HK, Role.PA, Role.MT]) {
      expect(isOnSiteAssignable(role, false)).toBe(true);
      // A stray `remote: true` on a housekeeper must not make a real employee
      // unassignable — the column exists to disambiguate MANAGER and nothing
      // else.
      expect(isOnSiteAssignable(role, true)).toBe(true);
    }
  });

  it("a MANAGER is on-site unless flagged remote", () => {
    // The 8 on-site Property Managers.
    expect(isOnSiteAssignable(Role.MANAGER, false)).toBe(true);
    // Erika, Ruby, Jeffrey.
    expect(isOnSiteAssignable(Role.MANAGER, true)).toBe(false);
  });

  it("portfolio and reviewer roles are never assignable, flag regardless", () => {
    // AGENT is night audit: they review other people's checklists, so handing
    // one to them is a category error, not a scoping question.
    //
    // NETWORK_TECH is here because isFieldStaff() answers TRUE for it — that
    // predicate is a negation of isManagerOrAbove, so IT/MSP staff fall into
    // it by accident. isOnSiteAssignable enumerates instead, which is the only
    // reason a network tech is not offered a housekeeping checklist.
    for (const role of [Role.CORPORATE, Role.ADMIN, Role.AGENT, Role.NETWORK_TECH]) {
      expect(isOnSiteAssignable(role, false)).toBe(false);
      expect(isOnSiteAssignable(role, true)).toBe(false);
    }
  });

  it("the override beats the role rule, for any role", () => {
    // Kyle's CORPORATE account, so he can assign himself a checklist and walk
    // it end to end without a second login.
    expect(isOnSiteAssignable(Role.CORPORATE, false, true)).toBe(true);
    for (const role of Object.values(Role)) {
      expect(isOnSiteAssignable(role, true, true)).toBe(true);
    }
  });

  it("defaults to off, so nothing is assignable by accident", () => {
    expect(isOnSiteAssignable(Role.CORPORATE, false)).toBe(false);
    expect(isOnSiteAssignable(Role.CORPORATE, false, false)).toBe(false);
  });

  it("covers every role in the enum, so a new one has to be considered here", () => {
    const decided = Object.values(Role).map((r) => [r, isOnSiteAssignable(r, false)] as const);
    expect(decided.length).toBe(Object.values(Role).length);
    // Exactly the four on-site-capable roles today.
    expect(decided.filter(([, ok]) => ok).map(([r]) => r).sort()).toEqual(
      [Role.HK, Role.MANAGER, Role.MT, Role.PA].sort(),
    );
  });
});

// User administration (2026-09-11). CORPORATE was let into Admin → Users with
// two limits; these are the limits. They are the only thing standing between a
// corporate account and ADMIN, so they are tested as a pair.
describe("user administration", () => {
  it("only ADMIN and CORPORATE may open Admin → Users", () => {
    expect(canManageUsers(Role.ADMIN)).toBe(true);
    expect(canManageUsers(Role.CORPORATE)).toBe(true);
    for (const role of [Role.HK, Role.PA, Role.MT, Role.MANAGER, Role.AGENT, Role.NETWORK_TECH]) {
      expect(canManageUsers(role)).toBe(false);
    }
  });

  it("CORPORATE may act on every role EXCEPT an ADMIN account", () => {
    for (const target of Object.values(Role)) {
      // The whole point: a corporate user must not be able to reset admin@'s
      // password and sign in as ADMIN.
      expect(canAdministerUser(Role.CORPORATE, target)).toBe(target !== Role.ADMIN);
    }
  });

  it("ADMIN may act on any account, including another ADMIN", () => {
    for (const target of Object.values(Role)) {
      expect(canAdministerUser(Role.ADMIN, target)).toBe(true);
    }
  });

  it("a role that cannot manage users cannot administer anyone", () => {
    for (const actor of [Role.HK, Role.PA, Role.MT, Role.MANAGER, Role.AGENT, Role.NETWORK_TECH]) {
      for (const target of Object.values(Role)) {
        expect(canAdministerUser(actor, target)).toBe(false);
      }
      expect(assignableRolesFor(actor)).toEqual([]);
    }
  });

  it("CORPORATE may grant every role except ADMIN; ADMIN may grant all", () => {
    const corp = assignableRolesFor(Role.CORPORATE);
    expect(corp).not.toContain(Role.ADMIN);
    expect(corp.length).toBe(Object.values(Role).length - 1);
    expect(assignableRolesFor(Role.ADMIN).length).toBe(Object.values(Role).length);
  });

  it("the picker list covers the whole enum, so a new role has to be placed", () => {
    // The old hard-coded list in UsersClient omitted AGENT and NETWORK_TECH,
    // so those rows had no option matching their own value.
    expect([...ROLE_ORDER].sort()).toEqual(Object.values(Role).sort());
  });

  it("Location only affects assignment for MANAGER", () => {
    expect(locationAffectsAssignment(Role.MANAGER)).toBe(true);
    for (const role of Object.values(Role).filter((r) => r !== Role.MANAGER)) {
      expect(locationAffectsAssignment(role)).toBe(false);
      // And the reason it is inert: isOnSiteAssignable ignores the flag for
      // every other role.
      expect(isOnSiteAssignable(role, true)).toBe(isOnSiteAssignable(role, false));
    }
  });
});

// explainAssignability (2026-09-12). The sentence the Users admin shows beside
// the Always-assignable switch. Pinned to isOnSiteAssignable so the prose
// cannot drift from the rule the batch wizard's pool query mirrors.
describe("explainAssignability", () => {
  const withProps = (role: Role, remote: boolean, override: boolean) =>
    explainAssignability(role, remote, override, true);

  it("agrees with isOnSiteAssignable whenever the user holds properties", () => {
    for (const role of Object.values(Role)) {
      for (const remote of [true, false]) {
        for (const override of [true, false]) {
          expect(withProps(role, remote, override).assignable).toBe(
            isOnSiteAssignable(role, remote, override),
          );
        }
      }
    }
  });

  it("holding no properties beats an eligible role — the trap the script documents", () => {
    // A CORPORATE account with the override on but no user_properties rows is
    // invisible in every pool, because the query requires both.
    const r = explainAssignability(Role.CORPORATE, false, true, false);
    expect(r.assignable).toBe(false);
    expect(r.reason).toMatch(/holds no properties/i);

    // Same for a housekeeper who is eligible purely by role.
    expect(explainAssignability(Role.HK, false, false, false).assignable).toBe(false);
  });

  it("names the remote-manager case specifically, since it is the common one", () => {
    expect(withProps(Role.MANAGER, true, false).reason).toMatch(/Remote managers/i);
    expect(withProps(Role.MANAGER, false, false).reason).toBe("Assignable by role.");
  });

  it("distinguishes assignable-by-override from assignable-by-role", () => {
    // Erika: CORPORATE, remote, override on.
    expect(withProps(Role.CORPORATE, true, true)).toEqual({
      assignable: true,
      reason: "Assignable by override, not by role.",
    });
    // A housekeeper needs no override and should not be described as having one.
    expect(withProps(Role.HK, false, false).reason).toBe("Assignable by role.");
  });
});
