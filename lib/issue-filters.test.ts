import { describe, expect, it } from "vitest";
import { IssuePriority, IssueStatus } from "@prisma/client";
import {
  ISSUE_PRIORITY_LABEL,
  ISSUE_STATUS_FILTERS,
  ISSUE_STATUS_FILTER_LABEL,
  OPEN_STATUSES,
  issueStatusParam,
  issueStatusWhere,
  issueWhereFilters,
  parseIssueFilters,
} from "./issue-filters";

describe("chip set", () => {
  it("is exactly Open | Unassigned | Resolved, in that order", () => {
    expect(ISSUE_STATUS_FILTERS).toEqual(["OPEN", "UNASSIGNED", "RESOLVED"]);
    expect(ISSUE_STATUS_FILTERS.map((s) => ISSUE_STATUS_FILTER_LABEL[s])).toEqual([
      "Open",
      "Unassigned",
      "Resolved",
    ]);
  });

  it("has no two chips sharing a label — the bug W8 fixes", () => {
    const labels = ISSUE_STATUS_FILTERS.map((s) => ISSUE_STATUS_FILTER_LABEL[s]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels all four priorities, MEDIUM abbreviated", () => {
    expect(Object.values(IssuePriority).map((p) => ISSUE_PRIORITY_LABEL[p])).toEqual([
      "LOW",
      "MED",
      "HIGH",
      "URGENT",
    ]);
  });
});

describe("parseIssueFilters", () => {
  it("defaults to the open rollup when no status param is set", () => {
    expect(parseIssueFilters({})).toEqual({ status: "OPEN", priority: null });
  });

  it("accepts each chip value", () => {
    for (const s of ISSUE_STATUS_FILTERS) {
      expect(parseIssueFilters({ status: s }).status).toBe(s);
    }
  });

  it("falls back to the open rollup for statuses that lost their chip", () => {
    for (const s of [IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS, IssueStatus.WONT_FIX]) {
      expect(parseIssueFilters({ status: s }).status).toBe("OPEN");
    }
  });

  it("falls back to the open rollup for junk", () => {
    expect(parseIssueFilters({ status: "constructor" }).status).toBe("OPEN");
    expect(parseIssueFilters({ status: "" }).status).toBe("OPEN");
  });

  it("whitelists priority and ignores junk", () => {
    expect(parseIssueFilters({ priority: "URGENT" }).priority).toBe(IssuePriority.URGENT);
    expect(parseIssueFilters({ priority: "MED" }).priority).toBeNull();
  });

  it("rejects prototype keys — `x in Enum` used to let these through", () => {
    // Regression: the page validated with `rawPriority in IssuePriority`, which
    // walks the prototype chain, so these reached Prisma as bogus enum values.
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(parseIssueFilters({ priority: key }).priority).toBeNull();
      expect(parseIssueFilters({ status: key }).status).toBe("OPEN");
    }
  });

  it("parses status and priority independently", () => {
    expect(parseIssueFilters({ status: "UNASSIGNED", priority: "HIGH" })).toEqual({
      status: "UNASSIGNED",
      priority: IssuePriority.HIGH,
    });
  });
});

describe("issueStatusParam", () => {
  it("omits the default so the Open chip and a bare /issues are one page", () => {
    expect(issueStatusParam("OPEN")).toBeUndefined();
    expect(issueStatusParam("UNASSIGNED")).toBe("UNASSIGNED");
    expect(issueStatusParam("RESOLVED")).toBe("RESOLVED");
  });
});

describe("issueStatusWhere", () => {
  it("Open means the rollup, not IssueStatus.OPEN", () => {
    expect(issueStatusWhere("OPEN")).toEqual({ status: { in: OPEN_STATUSES } });
    expect(OPEN_STATUSES).toEqual([
      IssueStatus.OPEN,
      IssueStatus.ASSIGNED,
      IssueStatus.IN_PROGRESS,
    ]);
  });

  it("Unassigned narrows the same rollup by assignee", () => {
    expect(issueStatusWhere("UNASSIGNED")).toEqual({
      status: { in: OPEN_STATUSES },
      assignedUserId: null,
    });
  });

  it("Unassigned is a strict subset of Open — it never widens", () => {
    const open = issueStatusWhere("OPEN");
    const unassigned = issueStatusWhere("UNASSIGNED");
    expect(unassigned.status).toEqual(open.status);
    expect(unassigned.assignedUserId).toBeNull();
  });

  it("Resolved is the enum member alone", () => {
    expect(issueStatusWhere("RESOLVED")).toEqual({ status: IssueStatus.RESOLVED });
  });

  it("never constrains assignedUserId outside the Unassigned chip", () => {
    expect(issueStatusWhere("OPEN").assignedUserId).toBeUndefined();
    expect(issueStatusWhere("RESOLVED").assignedUserId).toBeUndefined();
  });

  it("no chip can surface WONT_FIX rows, but the enum value still exists", () => {
    // The reading path depends on it: existing rows render their status, and
    // both closeIssue's "already closed" guard and the presign route read it.
    expect(IssueStatus.WONT_FIX).toBe("WONT_FIX");
    for (const s of ISSUE_STATUS_FILTERS) {
      const where = issueStatusWhere(s);
      const statuses =
        typeof where.status === "string"
          ? [where.status]
          : ((where.status as { in: IssueStatus[] }).in ?? []);
      expect(statuses).not.toContain(IssueStatus.WONT_FIX);
    }
  });
});

describe("issueWhereFilters", () => {
  const scope = ["p1", "p2"];

  it("scopes every chip to the ids it was given", () => {
    for (const s of ISSUE_STATUS_FILTERS) {
      expect(issueWhereFilters({ status: s, priority: null }, scope).propertyId).toEqual({
        in: scope,
      });
    }
  });

  it("emits propertyId exactly once, so no spread can overwrite the scope", () => {
    const keys = Object.keys(
      issueWhereFilters({ status: "UNASSIGNED", priority: IssuePriority.HIGH }, scope),
    );
    expect(keys.filter((k) => k === "propertyId")).toHaveLength(1);
  });

  it("an empty scope matches nothing rather than everything", () => {
    expect(issueWhereFilters({ status: "OPEN", priority: null }, []).propertyId).toEqual({ in: [] });
  });

  it("omits priority when unset", () => {
    expect(issueWhereFilters({ status: "OPEN", priority: null }, scope)).toEqual({
      propertyId: { in: scope },
      status: { in: OPEN_STATUSES },
    });
  });

  it("composes Unassigned with priority the same way the other chips do", () => {
    expect(
      issueWhereFilters({ status: "UNASSIGNED", priority: IssuePriority.URGENT }, scope),
    ).toEqual({
      propertyId: { in: scope },
      status: { in: OPEN_STATUSES },
      assignedUserId: null,
      priority: IssuePriority.URGENT,
    });
  });

  it("composes priority with every chip", () => {
    for (const s of ISSUE_STATUS_FILTERS) {
      for (const p of Object.values(IssuePriority)) {
        expect(issueWhereFilters({ status: s, priority: p }, scope).priority).toBe(p);
      }
    }
  });
});
