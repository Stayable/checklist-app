import { DeviceType, Prisma, TicketStatus, TicketType } from "@prisma/client";
import { etDayStartUtc, nextYMD } from "../datetime";
import { parseDeviceType } from "./device-type";

// Pure filter/sort parsing for /network/tickets (Task: date/property/status/
// type filters + sortable columns). Kept dependency-free (no Prisma client, no
// I/O) like the rest of lib/network's decision helpers, so it unit-tests
// without a DB and can be called from both the page and its tests.

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** The statuses the default (unfiltered) view shows — "still needs attention". */
export const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

/**
 * Sentinel for the "All" tab (Kyle 2026-08-01). Deliberately NOT a member of
 * TicketStatus and not `null` either, because those two already mean different
 * things here: `null` is "no status param supplied" and defaults to the open
 * view. Without a third value there is no way to ask for every status, which is
 * what an export-everything needs.
 */
export const ALL_STATUSES = "ALL" as const;

export type TicketStatusFilter = TicketStatus | typeof ALL_STATUSES | null;

export type TicketFilters = {
  /** null = "not specified" → defaults to the open view. `"ALL"` = no status
   * filter at all. See ticketStatusWhere. */
  status: TicketStatusFilter;
  ticketType: TicketType | null;
  /** Not validated against the real Property table here (pure fn, no DB) — an
   * unknown id just matches zero rows, same posture as the existing assignee
   * filter on /completed. */
  propertyId: string | null;
  /** Filters on the linked Device's type. Tickets with no device — mass-outage
   * parents — are excluded whenever this is set, which is the honest reading of
   * "show me camera tickets": a parent covering a whole property is not one. */
  deviceType: DeviceType | null;
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
  deviceType?: string;
  from?: string;
  to?: string;
};

export function parseTicketFilters(params: TicketFilterParams): TicketFilters {
  const status: TicketStatusFilter =
    params.status === ALL_STATUSES
      ? ALL_STATUSES
      : params.status && params.status in TicketStatus
        ? (params.status as TicketStatus)
        : null;
  const ticketType =
    params.ticketType && params.ticketType in TicketType ? (params.ticketType as TicketType) : null;
  const propertyId = params.propertyId ? params.propertyId : null;
  const deviceType = parseDeviceType(params.deviceType);

  // createdAt/openedAt are timestamptz — bound by ET day starts (honors
  // EDT/EST) so a ticket opened late-evening ET doesn't spill into the
  // adjacent UTC day. Same approach as app/reports/issues/page.tsx.
  const from = params.from ? etDayStartUtc(params.from) : null;
  const toExclusive = params.to ? etDayStartUtc(nextYMD(params.to)) : null;

  return { status, ticketType, propertyId, deviceType, from, toExclusive };
}

/**
 * The status clause for one parsed filter value.
 *
 *  - `"ALL"`  → `undefined`, i.e. no status constraint. Prisma treats an
 *               `undefined` field as "don't filter on this", which is exactly
 *               what the All tab means.
 *  - `null`   → the open view (OPEN + IN_PROGRESS), the default when no status
 *               param is present.
 *  - a status → that status alone.
 */
export function ticketStatusWhere(
  status: TicketStatusFilter,
): Prisma.TicketWhereInput["status"] {
  if (status === ALL_STATUSES) return undefined;
  if (status === null) return { in: OPEN_STATUSES };
  return status;
}

/**
 * Builds the whole Prisma `where` for a parsed filter set — status included.
 *
 * Status used to be excluded here so the page could own the "no param means
 * open" default, which meant the page and the CSV route each carried their own
 * copy of `filters.status ?? { in: OPEN_STATUSES }`. Adding a third status
 * state ("All") to two independent copies is how an export silently stops
 * matching the screen it was launched from, so the default now lives here, in
 * one tested place, and both call sites spread this verbatim.
 */
export function ticketWhereFilters(
  filters: Pick<
    TicketFilters,
    "status" | "ticketType" | "propertyId" | "deviceType" | "from" | "toExclusive"
  >,
): Prisma.TicketWhereInput {
  return {
    status: ticketStatusWhere(filters.status),
    ...(filters.ticketType ? { ticketType: filters.ticketType } : {}),
    ...(filters.propertyId ? { propertyId: filters.propertyId } : {}),
    // `is:` on an optional to-one relation matches only rows that HAVE a device,
    // so device-less mass-outage parents drop out — see the field comment above.
    ...(filters.deviceType ? { device: { is: { type: filters.deviceType } } } : {}),
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
