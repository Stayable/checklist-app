import { describe, expect, it } from "vitest";
import { TicketStatus } from "@prisma/client";
import { buildDailyDigest, digestTitle } from "./digest";
import type {
  NetworkOpenTicket,
  NetworkOverview,
  NetworkPropertyRow,
} from "./overview.server";

// The 9 AM ET daily digest body. Pure, so no DB — the overview is handed in.

const DASHBOARD = "https://ops.rentstayable.com/network";

function property(over: Partial<NetworkPropertyRow> = {}): NetworkPropertyRow {
  return {
    id: "p1",
    shortCode: "KW",
    name: "Kissimmee West",
    online: 12,
    offline: 0,
    unknown: 0,
    total: 12,
    open: 0,
    resolved: 0,
    ...over,
  };
}

function ticket(over: Partial<NetworkOpenTicket> = {}): NetworkOpenTicket {
  return {
    id: "t1",
    ticketNumber: "TKT-20260801-001",
    ticketType: "STANDARD",
    status: TicketStatus.OPEN,
    openedAt: new Date("2026-08-01T12:30:00Z"),
    propertyId: "p1",
    propertyShortCode: "KW",
    deviceName: "SW-Lobby",
    ...over,
  };
}

/** Cards are individually overridable — most tests care about one number. */
type OverviewOverrides = {
  cards?: Partial<NetworkOverview["cards"]>;
  properties?: NetworkPropertyRow[];
  openTicketList?: NetworkOpenTicket[];
};

function overview(over: OverviewOverrides = {}): NetworkOverview {
  return {
    cards: {
      openTickets: 0,
      escalated: 0,
      devicesOffline: 0,
      devicesUnknown: 0,
      devicesTotal: 640,
      propertiesWithIssues: 0,
      resolvedInRange: 0,
      avgResolutionMin: null,
      ...over.cards,
    },
    properties: over.properties ?? [property()],
    openTicketList: over.openTicketList ?? [],
  };
}

const build = (o: NetworkOverview) =>
  buildDailyDigest({
    overview: o,
    now: new Date("2026-08-01T13:00:00Z"),
    rangeLabel: "Last 30 days",
    dashboardUrl: DASHBOARD,
  });

describe("digestTitle", () => {
  it("dates the digest in ET, not UTC", () => {
    // 00:30 UTC on the 2nd is still the evening of the 1st in ET. A UTC-dated
    // title would label the morning digest with the wrong day twice a day.
    expect(digestTitle(new Date("2026-08-02T00:30:00Z"))).toContain("1 Aug 2026");
  });
});

describe("buildDailyDigest — overview cards", () => {
  it("reports every card Kyle asked for", () => {
    const text = build(
      overview({
        cards: {
          openTickets: 7,
          escalated: 2,
          devicesOffline: 13,
          devicesUnknown: 4,
          devicesTotal: 640,
          propertiesWithIssues: 3,
          resolvedInRange: 41,
          avgResolutionMin: 18,
        },
      }),
    );
    expect(text).toContain("Open tickets: 7");
    expect(text).toContain("Escalated: 2");
    expect(text).toContain("Devices offline: 13");
    expect(text).toContain("Unverifiable (console unreachable): 4");
    expect(text).toContain("Properties with issues: 3");
    expect(text).toContain("Resolved · Last 30 days: 41");
    expect(text).toContain("Avg resolution · Last 30 days: 18 min");
  });

  it("renders a null average as an em dash, not 0", () => {
    // 0 min would claim every ticket was fixed instantly; the truth is "no
    // resolved tickets with a duration in this window".
    const text = build(overview({ cards: { avgResolutionMin: null } }));
    expect(text).toContain("Avg resolution · Last 30 days: —");
    expect(text).not.toContain("Avg resolution · Last 30 days: 0");
  });

  it("links to the dashboard", () => {
    expect(build(overview())).toContain(DASHBOARD);
  });
});

describe("buildDailyDigest — honesty about blind spots", () => {
  it("leads with a warning when nothing is monitored at all", () => {
    const text = build(overview({ cards: { devicesTotal: 0 } }));
    expect(text).toContain("not an all-clear");
    // Must be the FIRST thing read, before any comforting zero.
    expect(text.indexOf("not an all-clear")).toBeLessThan(text.indexOf("Open tickets"));
  });

  it("does not cry wolf when devices ARE monitored", () => {
    expect(build(overview())).not.toContain("not an all-clear");
  });

  it("calls out unverifiable devices separately from offline ones", () => {
    const text = build(overview({ cards: { devicesUnknown: 4 } }));
    expect(text).toContain("could not be verified");
    expect(text).toContain("not confirmed up");
  });

  it("says a property with no devices is unmonitored rather than printing 0", () => {
    const text = build(
      overview({ properties: [property({ shortCode: "JN", total: 0, online: 0 })] }),
    );
    // A bare 0 in the devices column reads as "nothing wrong here".
    expect(text).toMatch(/JN\s+none/);
  });
});

describe("buildDailyDigest — status by property", () => {
  it("includes a row per property with its counts", () => {
    const text = build(
      overview({
        properties: [
          property({ shortCode: "KW", total: 12, offline: 1, unknown: 0, open: 1, resolved: 5 }),
          property({ id: "p2", shortCode: "OR", total: 92, offline: 46, unknown: 0, open: 2, resolved: 9 }),
        ],
      }),
    );
    expect(text).toMatch(/KW\s+12\s+1\s+0\s+1\s+5/);
    expect(text).toMatch(/OR\s+92\s+46\s+0\s+2\s+9/);
  });

  it("labels the resolved column with the range so the number isn't ambiguous", () => {
    expect(build(overview())).toContain("Fixed = last 30 days");
  });
});

describe("buildDailyDigest — oldest open", () => {
  it("names the oldest open tickets, so the digest is actionable", () => {
    const text = build(
      overview({
        cards: { openTickets: 1 },
        openTicketList: [ticket({ ticketNumber: "TKT-20260801-009", deviceName: "AP-Rm122" })],
      }),
    );
    expect(text).toContain("TKT-20260801-009");
    expect(text).toContain("AP-Rm122");
  });

  it("describes a device-less mass-outage parent as property-wide", () => {
    const text = build(overview({ openTicketList: [ticket({ deviceName: null })] }));
    expect(text).toContain("property-wide");
  });

  it("caps the list at 5 and says how many more there are", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      ticket({ id: `t${i}`, ticketNumber: `TKT-20260801-00${i}` }),
    );
    const text = build(overview({ openTicketList: many }));
    expect(text).toContain("…and 3 more open.");
    // The 6th onward must not be listed individually.
    expect(text).not.toContain("TKT-20260801-006");
  });

  it("omits the 'more' line when everything fits", () => {
    const text = build(overview({ openTicketList: [ticket()] }));
    expect(text).not.toContain("more open.");
  });

  it("says so plainly when there is nothing open", () => {
    expect(build(overview())).toContain("No open tickets.");
  });

  it("stamps open-since times in ET", () => {
    // 01:30 UTC is 21:30 the previous ET day — a UTC render would put this
    // ticket on the wrong date in the digest.
    const text = build(
      overview({ openTicketList: [ticket({ openedAt: new Date("2026-08-02T01:30:00Z") })] }),
    );
    expect(text).toContain("1 Aug 21:30 ET");
  });
});
