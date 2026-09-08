import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { isOnSiteAssignable } from "./roles";

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
