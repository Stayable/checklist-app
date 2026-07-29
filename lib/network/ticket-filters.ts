import { Prisma, TicketStatus, TicketType } from "@prisma/client";
import { etDayStartUtc, nextYMD } from "../datetime";

// Pure filter/sort parsing for /network/tickets (Task: date/property/status/
// type filters + sortable columns). Kept dependency-free (no Prisma client, no
// I/O) like the rest of lib/network's decision helpers, so it unit-tests
// without a DB and can be called from both the page and its tests.

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type TicketFilters = {
  /** null = "not specified" — the page decides its own default (open tab). */
  status: TicketStatus | null;
  ticketType: TicketType | null;
  /** Not validated against the real Property table here (pure fn, no DB) — an
   * unknown id just matches zero rows, same posture as the existing assignee
   * filter on /completed. */
  propertyId: string | null;
  /** Inclusive lower bound on `openedAt`, from the ET day start of `from`. */
  from: Date | null;
  /** Exclusive upper bound on `openedAt` — the ET day start of the day AFTER
   * `to`, so the whole ET end-day is included (mirrors app/reports/issues). */
  toExclusive: Date | null;
};

export type TicketFilterParams = {
  status?: string;
  ticketType?: string;
  propertyId?: string;
  from?: string;
  to?: string;
};

export function parseTicketFilters(params: TicketFilterParams): TicketFilters {
  const status = params.status && params.status in TicketStatus ? (params.status as TicketStatus) : null;
  const ticketType =
    params.ticketType && params.ticketType in TicketType ? (params.ticketType as TicketType) : null;
  const propertyId = params.propertyId ? params.propertyId : null;

  // createdAt/openedAt are timestamptz — bound by ET day starts (honors
  // EDT/EST) so a ticket opened late-evening ET doesn't spill into the
  // adjacent UTC day. Same approach as app/reports/issues/page.tsx.
  const from = params.from ? etDayStartUtc(params.from) : null;
  const toExclusive = params.to ? etDayStartUtc(nextYMD(params.to)) : null;

  return { status, ticketType, propertyId, from, toExclusive };
}

/**
 * Builds the Prisma `where` fragment for the non-status filters (ticketType,
 * property, date range). Status is deliberately excluded — the page owns the
 * "no status param means open tab" default and composes it itself.
 */
export function ticketWhereFilters(
  filters: Pick<TicketFilters, "ticketType" | "propertyId" | "from" | "toExclusive">,
): Prisma.TicketWhereInput {
  return {
    ...(filters.ticketType ? { ticketType: filters.ticketType } : {}),
    ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
    ...(filters.from || filters.toExclusive
      ? {
          openedAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.toExclusive ? { lt: filters.toExclusive } : {}),
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const TICKET_SORT_KEYS = [
  "ticketNumber",
  "openedAt",
  "status",
  "property",
  "ticketType",
  "resolvedAt",
] as const;

export type TicketSortKey = (typeof TICKET_SORT_KEYS)[number];

export type SortDir = "asc" | "desc";

export const DEFAULT_SORT_KEY: TicketSortKey = "openedAt";
export const DEFAULT_SORT_DIR: SortDir = "desc";

export type TicketOrderBy = {
  sortKey: TicketSortKey;
  sortDir: SortDir;
  orderBy: Prisma.TicketOrderByWithRelationInput[];
};

function isTicketSortKey(value: string): value is TicketSortKey {
  return (TICKET_SORT_KEYS as readonly string[]).includes(value);
}

/**
 * Whitelists a raw sort key + direction from the URL and returns the matching
 * Prisma `orderBy`. Never interpolates the raw string into the query — an
 * unrecognised key falls back to the default (openedAt desc); an unrecognised
 * direction falls back to the default direction. Every branch appends a
 * stable `{ id: "asc" }` secondary so ties (e.g. two tickets opened in the
 * same instant) don't reorder between page loads.
 */
export function ticketOrderBy(sort?: string, dir?: string): TicketOrderBy {
  const sortKey = sort && isTicketSortKey(sort) ? sort : DEFAULT_SORT_KEY;
  const sortDir: SortDir = dir === "asc" || dir === "desc" ? dir : DEFAULT_SORT_DIR;

  const secondary: Prisma.TicketOrderByWithRelationInput = { id: "asc" };
  let primary: Prisma.TicketOrderByWithRelationInput;
  switch (sortKey) {
    case "ticketNumber":
      primary = { ticketNumber: sortDir };
      break;
    case "status":
      primary = { status: sortDir };
      break;
    case "property":
      primary = { property: { shortCode: sortDir } };
      break;
    case "ticketType":
      primary = { ticketType: sortDir };
      break;
    case "resolvedAt":
      primary = { resolvedAt: sortDir };
      break;
    case "openedAt":
      primary = { openedAt: sortDir };
      break;
  }

  return { sortKey, sortDir, orderBy: [primary, secondary] };
}
