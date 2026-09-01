import { DeviceStatus, TicketStatus, TicketType } from "@prisma/client";
import { db } from "@/lib/db";
import { escalationLevel } from "./escalation";
import { type NetworkScope, scopeWhere } from "./scope";
import { uncoveredOfflineDevices } from "./reconcile";

// The numbers behind the /network dashboard (extracted 2026-08-01).
//
// Extracted from app/network/page.tsx because the 9 AM ET Teams digest posts the
// same two things — the overview cards and the status-by-property table — and
// two independent copies of these aggregates would drift. When they drift, the
// digest and the dashboard disagree about how many tickets are open, and nobody
// can tell which one is lying. One query set, two renderers.
//
// Portfolio-wide, no property scoping — matches the dashboard's own posture
// (see lib/rbac.ts canAccessNetwork; /network is CORPORATE/ADMIN/NETWORK_TECH).

export const OPEN_STATUSES: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];

/** Terminal states. Treated as one thing: a reader asking "what got fixed"
 * means both, and the RESOLVED/CLOSED split is internal bookkeeping. */
const DONE_STATUSES: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

export type NetworkOverviewCards = {
  openTickets: number;
  escalated: number;
  devicesOffline: number;
  /**
   * Offline devices that no open ticket names and that no open MASS_OUTAGE
   * ticket at their property covers (2026-08-31).
   *
   * This figure exists because "24 offline / 21 open tickets" was two peer
   * cards a reader had to subtract in their head — and the difference is not
   * one thing. Some of it is legitimate (the 5-7 minute gap before a ticket
   * timer fires, and devices rolled up under a mass outage); some of it was a
   * genuine bug class where a device stayed OFFLINE with nobody owning it.
   * Naming the number turns an inference into a work item.
   *
   * It is computed from the SAME predicate the reconciliation sweep works
   * from (`uncoveredOfflineDevices`), so the card and the reconciler's backlog
   * cannot disagree — if this is standing non-zero, the sweep is telling you
   * why in the poll outcome (`unarmable` / `deferred`).
   */
  devicesOfflineNoTicket: number;
  devicesUnknown: number;
  devicesTotal: number;
  propertiesWithIssues: number;
  resolvedInRange: number;
  avgResolutionMin: number | null;
};

export type NetworkPropertyRow = {
  id: string;
  shortCode: string;
  name: string;
  online: number;
  offline: number;
  unknown: number;
  total: number;
  open: number;
  resolved: number;
};

export type NetworkOpenTicket = {
  id: string;
  ticketNumber: string;
  ticketType: string;
  status: TicketStatus;
  openedAt: Date;
  propertyId: string;
  propertyShortCode: string;
  deviceName: string | null;
};

export type NetworkOverview = {
  cards: NetworkOverviewCards;
  properties: NetworkPropertyRow[];
  /** Returned so the dashboard's open-ticket table and the `escalated` card
   * come from one read rather than two that could disagree. */
  openTicketList: NetworkOpenTicket[];
};

/**
 * `rangeFrom` bounds the resolved/avg-resolution figures only. Open tickets and
 * device status are present-tense facts — filtering "what is broken right now"
 * by a historical window would be meaningless.
 *
 * `scope` narrows EVERY figure to a set of properties (2026-08-13, when
 * property managers gained network access). It defaults to `null` — unscoped —
 * so existing portfolio callers are unchanged, and every one of the ten
 * queries below carries it. A partially-scoped overview would be worse than an
 * unscoped one: cards that disagree with the table underneath them are read as
 * a bug in the data, not in the query.
 */
export async function loadNetworkOverview(params: {
  now: Date;
  rangeFrom: Date;
  /** Property ids this reader may see; null = the whole estate. */
  scope?: NetworkScope;
}): Promise<NetworkOverview> {
  const { now, rangeFrom, scope = null } = params;
  const inScope = scopeWhere(scope);

  // Resolved-in-range needs the updatedAt fallback: a ticket closed by hand
  // without a resolvedAt stamp would otherwise be invisible in every count here.
  const resolvedInRangeWhere = {
    ...inScope,
    status: { in: DONE_STATUSES },
    OR: [
      { resolvedAt: { gte: rangeFrom } },
      { resolvedAt: null, updatedAt: { gte: rangeFrom } },
    ],
  };

  const [
    openTickets,
    offlineDevices,
    devicesUnknown,
    devicesTotal,
    resolvedDurations,
    resolvedCountInRange,
    properties,
    deviceCounts,
    openTicketCounts,
    resolvedCounts,
  ] = await Promise.all([
    db.ticket.findMany({
      where: { ...inScope, status: { in: OPEN_STATUSES } },
      orderBy: { openedAt: "asc" },
      select: {
        id: true,
        ticketNumber: true,
        ticketType: true,
        status: true,
        openedAt: true,
        propertyId: true,
        property: { select: { shortCode: true } },
        // `deviceId` (not just the device's name) so the offline set can be
        // diffed against what is actually ticketed without a second query.
        deviceId: true,
        device: { select: { name: true } },
      },
    }),
    // findMany, not count: the ids are needed for `devicesOfflineNoTicket` and
    // the row count is the same figure `devicesOffline` always was. Only
    // offline rows come back — a handful out of the estate — so this is the
    // same read, not a heavier one.
    db.device.findMany({
      where: { ...inScope, currentStatus: DeviceStatus.OFFLINE },
      select: { id: true, propertyId: true, updatedAt: true, suppressedAt: true },
    }),
    // N4: devices whose console can't be reached are UNKNOWN, not OFFLINE, so
    // they must be counted separately — an unmonitored fleet must never render
    // as a healthy one.
    db.device.count({ where: { ...inScope, currentStatus: DeviceStatus.UNKNOWN } }),
    db.device.count({ where: inScope }),
    db.ticket.findMany({
      where: {
        ...inScope,
        status: TicketStatus.RESOLVED,
        resolvedAt: { gte: rangeFrom },
        downDurationMin: { not: null },
      },
      select: { downDurationMin: true },
    }),
    db.ticket.count({ where: resolvedInRangeWhere }),

    // Grouped aggregates rather than a query per property: 8 properties today,
    // but this is the page every new property lands on and N+1 here would
    // degrade quietly as the portfolio grows.
    db.property.findMany({
      where: { active: true, ...(scope === null ? {} : { id: { in: scope } }) },
      select: { id: true, shortCode: true, name: true },
      orderBy: { shortCode: "asc" },
    }),
    db.device.groupBy({ by: ["propertyId", "currentStatus"], where: inScope, _count: true }),
    db.ticket.groupBy({
      by: ["propertyId"],
      where: { ...inScope, status: { in: OPEN_STATUSES } },
      _count: true,
    }),
    db.ticket.groupBy({ by: ["propertyId"], where: resolvedInRangeWhere, _count: true }),
  ]);

  const countFor = (propertyId: string, status: DeviceStatus) =>
    deviceCounts.find((d) => d.propertyId === propertyId && d.currentStatus === status)?._count ?? 0;

  // A property with no devices still appears — "no devices registered" is
  // exactly the fact a coverage gap needs to show.
  const propertyRows: NetworkPropertyRow[] = properties.map((p) => {
    const online = countFor(p.id, DeviceStatus.ONLINE);
    const offline = countFor(p.id, DeviceStatus.OFFLINE);
    const unknown = countFor(p.id, DeviceStatus.UNKNOWN);
    return {
      ...p,
      online,
      offline,
      unknown,
      total: online + offline + unknown,
      open: openTicketCounts.find((t) => t.propertyId === p.id)?._count ?? 0,
      resolved: resolvedCounts.find((t) => t.propertyId === p.id)?._count ?? 0,
    };
  });

  // Same predicate as the reconciliation sweep, deliberately — see the doc on
  // `devicesOfflineNoTicket`. No extra query: both inputs come out of the reads
  // already issued above.
  const offlineNoTicket = uncoveredOfflineDevices({
    devices: offlineDevices.map((d) => ({
      deviceId: d.id,
      propertyId: d.propertyId,
      status: "OFFLINE" as const,
      openProblemEventId: null, // not needed for coverage, only for arming
      offlineSince: d.updatedAt,
      // A device acknowledged as won't-fix is not a gap anyone should act on,
      // so it must not inflate the card the reconciler's backlog is read from.
      suppressed: d.suppressedAt != null,
    })),
    deviceIdsWithOpenTicket: openTickets
      .map((t) => t.deviceId)
      .filter((id): id is string => id !== null),
    propertyIdsWithOpenMassOutage: openTickets
      .filter((t) => t.ticketType === TicketType.MASS_OUTAGE)
      .map((t) => t.propertyId),
  });

  const avgResolutionMin =
    resolvedDurations.length === 0
      ? null
      : Math.round(
          resolvedDurations.reduce((sum, t) => sum + (t.downDurationMin ?? 0), 0) /
            resolvedDurations.length,
        );

  return {
    cards: {
      openTickets: openTickets.length,
      escalated: openTickets.filter(
        (t) => escalationLevel({ openedAt: t.openedAt, now, status: t.status }) === "ESCALATED",
      ).length,
      devicesOffline: offlineDevices.length,
      devicesOfflineNoTicket: offlineNoTicket.length,
      devicesUnknown,
      devicesTotal,
      propertiesWithIssues: new Set(openTickets.map((t) => t.propertyId)).size,
      resolvedInRange: resolvedCountInRange,
      avgResolutionMin,
    },
    properties: propertyRows,
    openTicketList: openTickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      ticketType: t.ticketType,
      status: t.status,
      openedAt: t.openedAt,
      propertyId: t.propertyId,
      propertyShortCode: t.property.shortCode,
      deviceName: t.device?.name ?? null,
    })),
  };
}
