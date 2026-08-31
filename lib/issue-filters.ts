import { IssuePriority, IssueStatus, Prisma } from "@prisma/client";

// Pure filter parsing for /issues (W8 — chip cleanup). Dependency-free (no
// Prisma client, no I/O) so it unit-tests without a DB, mirroring
// lib/network/ticket-filters.ts.

/**
 * The statuses the default view shows — "still needs attention". This rollup is
 * what the `Open` chip means, and it is deliberately NOT `IssueStatus.OPEN`.
 * Conflating the two is the bug W8 fixes: the page used to render a hardcoded
 * "Open" chip for this rollup and then loop `Object.values(IssueStatus)`,
 * producing a second chip also labelled "Open" that meant only the enum member.
 */
export const OPEN_STATUSES: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.ASSIGNED,
  IssueStatus.IN_PROGRESS,
];

/**
 * The three status chips, in render order.
 *
 * `UNASSIGNED` is a sentinel, deliberately NOT a member of `IssueStatus`. It
 * narrows the open rollup to rows nobody owns yet — "who has nothing on it"
 * is the question a manager actually asks, and it replaced the old `ASSIGNED`
 * chip for that reason. It lives on the same `?status=` param rather than a
 * second param because these three are one dimension: they are mutually
 * exclusive, and `?unassigned=1&status=RESOLVED` would be a combination with
 * no meaning (a resolved issue is not in the open rollup).
 *
 * `WONT_FIX` has no chip (W8) and no setter, but the enum value stays — see
 * lib/issue-filters.test.ts. Existing WONT_FIX rows still read and render.
 */
export const ISSUE_STATUS_FILTERS = ["OPEN", "UNASSIGNED", "RESOLVED"] as const;

export type IssueStatusFilter = (typeof ISSUE_STATUS_FILTERS)[number];

/** English-only manager surface (ADR-013) — no translation lookup. */
export const ISSUE_STATUS_FILTER_LABEL: Record<IssueStatusFilter, string> = {
  OPEN: "Open",
  UNASSIGNED: "Unassigned",
  RESOLVED: "Resolved",
};

/** Chip label for a priority. Only MEDIUM differs from its enum value. */
export const ISSUE_PRIORITY_LABEL: Record<IssuePriority, string> = {
  LOW: "LOW",
  MEDIUM: "MED",
  HIGH: "HIGH",
  URGENT: "URGENT",
};

export type IssueFilters = {
  /** Never null — an absent or unrecognised param falls back to the open rollup. */
  status: IssueStatusFilter;
  priority: IssuePriority | null;
};

export type IssueFilterParams = { status?: string; priority?: string };

function isStatusFilter(value: string): value is IssueStatusFilter {
  return (ISSUE_STATUS_FILTERS as readonly string[]).includes(value);
}

/**
 * ⚠ NOT `value in IssuePriority`, which the page used to do. The `in` operator
 * walks the prototype chain, so `?priority=toString` (or `constructor`, or
 * `valueOf`) passed that check and was cast straight into the Prisma `where` as
 * an enum value that does not exist — a 500 from a hand-typed URL. Membership
 * has to be tested against the values themselves.
 */
function isPriority(value: string): value is IssuePriority {
  return (Object.values(IssuePriority) as string[]).includes(value);
}

/**
 * Whitelists the raw search params. Anything unrecognised — including the enum
 * members that lost their chips (`ASSIGNED`, `IN_PROGRESS`, `WONT_FIX`) — falls
 * back to the open rollup rather than 404ing or matching zero rows, so a stale
 * bookmark lands somewhere useful.
 */
export function parseIssueFilters(params: IssueFilterParams): IssueFilters {
  return {
    status: params.status && isStatusFilter(params.status) ? params.status : "OPEN",
    priority: params.priority && isPriority(params.priority) ? params.priority : null,
  };
}

/**
 * The status param to put back into a link. `OPEN` is the default view, so it
 * is omitted — that keeps the canonical URL clean and means the Open chip and a
 * bare `/issues` are the same page.
 */
export function issueStatusParam(status: IssueStatusFilter): string | undefined {
  return status === "OPEN" ? undefined : status;
}

/**
 * The status/assignment clause for one chip.
 *
 *  - `OPEN`       → the rollup (OPEN + ASSIGNED + IN_PROGRESS).
 *  - `UNASSIGNED` → the same rollup, narrowed to rows with no assignee. A
 *                   narrowing, never a widening: it can only ever return a
 *                   subset of what `OPEN` returns.
 *  - `RESOLVED`   → that status alone.
 */
export function issueStatusWhere(
  status: IssueStatusFilter,
): Pick<Prisma.IssueWhereInput, "status" | "assignedUserId"> {
  switch (status) {
    case "UNASSIGNED":
      return { status: { in: OPEN_STATUSES }, assignedUserId: null };
    case "RESOLVED":
      return { status: IssueStatus.RESOLVED };
    case "OPEN":
      return { status: { in: OPEN_STATUSES } };
  }
}

/**
 * Builds the whole Prisma `where`, scope included.
 *
 * ⚠ `propertyId` is emitted here and nowhere else, once. The caller must not
 * spread a second `propertyId` over this result: in an object literal the later
 * key wins, so a filter written that way could silently REPLACE the scope and
 * expose another property's issues. A filter narrows what a reader may see; it
 * must never widen it. Same reasoning as lib/network/ticket-filters.ts.
 *
 * `scopeIds` comes straight from resolveScopedPropertyIds — this function does
 * not compute or relax it.
 */
export function issueWhereFilters(
  filters: IssueFilters,
  scopeIds: string[],
): Prisma.IssueWhereInput {
  return {
    propertyId: { in: scopeIds },
    ...issueStatusWhere(filters.status),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };
}
