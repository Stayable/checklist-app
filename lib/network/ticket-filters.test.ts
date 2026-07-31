import { describe, expect, it } from "vitest";
import { DeviceType, TicketStatus, TicketType } from "@prisma/client";
import { etDayStartUtc, nextYMD } from "../datetime";
import {
  ALL_STATUSES,
  DEFAULT_SORT_DIR,
  DEFAULT_SORT_KEY,
  OPEN_STATUSES,
  parseTicketFilters,
  TICKET_SORT_KEYS,
  ticketOrderBy,
  ticketStatusWhere,
  ticketWhereFilters,
} from "./ticket-filters";

// /network/tickets filters + sort. Pure and DB-free, mirroring the
// wifi-range.test.ts / ticket-age.test.ts style for this directory.

describe("parseTicketFilters", () => {
  it("returns all-null for no params", () => {
    const f = parseTicketFilters({});
    expect(f).toEqual({
      status: null,
      ticketType: null,
      propertyId: null,
      deviceType: null,
      from: null,
      toExclusive: null,
    });
  });

  it("parses a valid device type and rejects junk", () => {
    expect(parseTicketFilters({ deviceType: "CAMERA" }).deviceType).toBe(DeviceType.CAMERA);
    expect(parseTicketFilters({ deviceType: "ROUTER" }).deviceType).toBeNull();
  });

  it("parses a valid status", () => {
    expect(parseTicketFilters({ status: "RESOLVED" }).status).toBe(TicketStatus.RESOLVED);
  });

  it("rejects a junk status (falls back to null, not a throw)", () => {
    expect(parseTicketFilters({ status: "not-a-status" }).status).toBeNull();
  });

  it("parses the ALL sentinel as its own value, distinct from null", () => {
    expect(parseTicketFilters({ status: "ALL" }).status).toBe(ALL_STATUSES);
    // The distinction is the whole point: null means "defaulted to open",
    // ALL means "the user asked for every status".
    expect(parseTicketFilters({}).status).not.toBe(ALL_STATUSES);
  });

  it("parses a valid ticket type", () => {
    expect(parseTicketFilters({ ticketType: "MASS_OUTAGE" }).ticketType).toBe(TicketType.MASS_OUTAGE);
  });

  it("rejects a junk ticket type", () => {
    expect(parseTicketFilters({ ticketType: "not-a-type" }).ticketType).toBeNull();
  });

  it("passes propertyId through unvalidated (pure fn has no DB access)", () => {
    expect(parseTicketFilters({ propertyId: "some-uuid" }).propertyId).toBe("some-uuid");
  });

  it("computes the ET day-start bound for `from`", () => {
    const f = parseTicketFilters({ from: "2026-07-15" });
    expect(f.from).toEqual(etDayStartUtc("2026-07-15"));
  });

  it("computes an exclusive `to` bound at the START of the NEXT ET day", () => {
    const f = parseTicketFilters({ to: "2026-07-15" });
    expect(f.toExclusive).toEqual(etDayStartUtc(nextYMD("2026-07-15")));
    // Sanity: that's later than the day's own start, not equal to it — an
    // inclusive same-day bound would silently drop the whole end day.
    expect(f.toExclusive!.getTime()).toBeGreaterThan(etDayStartUtc("2026-07-15").getTime());
  });

  it("leaves from/to null when not supplied (unbounded)", () => {
    const f = parseTicketFilters({ status: "OPEN" });
    expect(f.from).toBeNull();
    expect(f.toExclusive).toBeNull();
  });

  it("composes all filters together without one clobbering another", () => {
    const f = parseTicketFilters({
      status: "IN_PROGRESS",
      ticketType: "STANDARD",
      propertyId: "prop-1",
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(f.status).toBe(TicketStatus.IN_PROGRESS);
    expect(f.ticketType).toBe(TicketType.STANDARD);
    expect(f.propertyId).toBe("prop-1");
    expect(f.from).toEqual(etDayStartUtc("2026-07-01"));
    expect(f.toExclusive).toEqual(etDayStartUtc(nextYMD("2026-07-31")));
  });

  it("one invalid filter does not blank out the others", () => {
    const f = parseTicketFilters({ status: "bogus", ticketType: "STANDARD", propertyId: "prop-1" });
    expect(f.status).toBeNull();
    expect(f.ticketType).toBe(TicketType.STANDARD);
    expect(f.propertyId).toBe("prop-1");
  });
});

describe("ticketStatusWhere", () => {
  it("defaults an absent status to the open view", () => {
    expect(ticketStatusWhere(null)).toEqual({ in: OPEN_STATUSES });
  });

  it("narrows to one status when one is given", () => {
    expect(ticketStatusWhere(TicketStatus.CLOSED)).toBe(TicketStatus.CLOSED);
  });

  it("applies NO status constraint for ALL", () => {
    // undefined, not {} and not a list of every status: Prisma reads an
    // undefined field as "don't filter on this". Spelling every status out
    // instead would silently miss any status added to the enum later.
    expect(ticketStatusWhere(ALL_STATUSES)).toBeUndefined();
  });

  it("ALL really does include the terminal statuses the open view hides", () => {
    // Guards the actual regression risk: if ALL ever resolved to the open
    // default, "export everything" would quietly export open tickets only.
    const openOnly = ticketStatusWhere(null) as { in: TicketStatus[] };
    expect(openOnly.in).not.toContain(TicketStatus.CLOSED);
    expect(openOnly.in).not.toContain(TicketStatus.RESOLVED);
    expect(ticketStatusWhere(ALL_STATUSES)).not.toEqual(openOnly);
  });
});

describe("ticketWhereFilters", () => {
  const none = {
    status: null,
    ticketType: null,
    propertyId: null,
    deviceType: null,
    from: null,
    toExclusive: null,
  };

  it("carries only the default open-status clause when nothing else is set", () => {
    expect(ticketWhereFilters(none)).toEqual({ status: { in: OPEN_STATUSES } });
  });

  it("drops the status clause entirely for ALL", () => {
    const where = ticketWhereFilters({ ...none, status: ALL_STATUSES });
    expect(where.status).toBeUndefined();
  });

  it("includes only the openedAt bounds that are set", () => {
    const from = new Date("2026-07-01T04:00:00Z");
    expect(ticketWhereFilters({ ...none, from })).toEqual({
      status: { in: OPEN_STATUSES },
      openedAt: { gte: from },
    });
  });

  it("composes ticketType + propertyId + both date bounds", () => {
    const from = new Date("2026-07-01T04:00:00Z");
    const toExclusive = new Date("2026-08-01T04:00:00Z");
    const where = ticketWhereFilters({
      ...none,
      status: TicketStatus.RESOLVED,
      ticketType: TicketType.MASS_OUTAGE,
      propertyId: "prop-1",
      from,
      toExclusive,
    });
    expect(where).toEqual({
      status: TicketStatus.RESOLVED,
      ticketType: TicketType.MASS_OUTAGE,
      propertyId: "prop-1",
      openedAt: { gte: from, lt: toExclusive },
    });
  });

  it("filters on the linked device's type", () => {
    expect(ticketWhereFilters({ ...none, deviceType: DeviceType.CAMERA })).toEqual({
      status: { in: OPEN_STATUSES },
      device: { is: { type: DeviceType.CAMERA } },
    });
  });

  it("uses `is:` so device-less mass-outage parents are excluded, not matched", () => {
    const where = ticketWhereFilters({ ...none, deviceType: DeviceType.AP });
    // A bare { device: { type } } would still be a relation filter, but spelling
    // `is` out keeps the null-exclusion explicit for the next reader.
    expect(where.device).toEqual({ is: { type: DeviceType.AP } });
  });

  it("composes device type with the other filters", () => {
    const where = ticketWhereFilters({
      ...none,
      propertyId: "prop-1",
      deviceType: DeviceType.SWITCH,
    });
    expect(where).toEqual({
      status: { in: OPEN_STATUSES },
      propertyId: "prop-1",
      device: { is: { type: DeviceType.SWITCH } },
    });
  });

  it("ALL still honours the other filters — it widens status only", () => {
    const from = new Date("2026-07-01T04:00:00Z");
    const where = ticketWhereFilters({
      ...none,
      status: ALL_STATUSES,
      propertyId: "prop-1",
      from,
    });
    expect(where.status).toBeUndefined();
    expect(where.propertyId).toBe("prop-1");
    expect(where.openedAt).toEqual({ gte: from });
  });
});

describe("ticketOrderBy", () => {
  it("defaults to openedAt desc with no args (current baseline behavior)", () => {
    const r = ticketOrderBy(undefined, undefined);
    expect(r.sortKey).toBe(DEFAULT_SORT_KEY);
    expect(r.sortDir).toBe(DEFAULT_SORT_DIR);
    expect(r.orderBy).toEqual([{ openedAt: "desc" }, { id: "asc" }]);
  });

  it("rejects a junk sort key and falls back to the default", () => {
    const r = ticketOrderBy("dr0p table tickets;--", "asc");
    expect(r.sortKey).toBe(DEFAULT_SORT_KEY);
    expect(r.orderBy[0]).toEqual({ openedAt: "asc" });
  });

  it("rejects a junk direction and falls back to the default direction", () => {
    const r = ticketOrderBy("status", "sideways");
    expect(r.sortDir).toBe(DEFAULT_SORT_DIR);
    expect(r.orderBy[0]).toEqual({ status: "desc" });
  });

  it("clamps direction case-sensitively (only exact 'asc'/'desc' pass)", () => {
    expect(ticketOrderBy("status", "ASC").sortDir).toBe(DEFAULT_SORT_DIR);
    expect(ticketOrderBy("status", "").sortDir).toBe(DEFAULT_SORT_DIR);
  });

  it("honors every whitelisted sort key with a stable secondary", () => {
    for (const key of TICKET_SORT_KEYS) {
      const r = ticketOrderBy(key, "asc");
      expect(r.sortKey).toBe(key);
      expect(r.orderBy).toHaveLength(2);
      expect(r.orderBy[1]).toEqual({ id: "asc" });
    }
  });

  it("sorts by ticketNumber", () => {
    expect(ticketOrderBy("ticketNumber", "asc").orderBy[0]).toEqual({ ticketNumber: "asc" });
  });

  it("sorts by property short code via the relation", () => {
    expect(ticketOrderBy("property", "desc").orderBy[0]).toEqual({ property: { shortCode: "desc" } });
  });

  it("sorts by ticketType", () => {
    expect(ticketOrderBy("ticketType", "asc").orderBy[0]).toEqual({ ticketType: "asc" });
  });

  it("sorts by resolvedAt", () => {
    expect(ticketOrderBy("resolvedAt", "desc").orderBy[0]).toEqual({ resolvedAt: "desc" });
  });

  it("never produces more than one key in the primary sort term (no raw interpolation)", () => {
    // Every whitelisted key must map to an exact, known shape — guards against
    // a future change accidentally spreading a raw user string into orderBy.
    for (const key of TICKET_SORT_KEYS) {
      const r = ticketOrderBy(key, "asc");
      expect(Object.keys(r.orderBy[0]!)).toHaveLength(1);
    }
  });
});
