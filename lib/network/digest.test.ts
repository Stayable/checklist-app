import { describe, expect, it } from "vitest";
import { TicketStatus } from "@prisma/client";
import { buildDailyDigest, buildDailyDigestCard, digestTitle, type GuestLive } from "./digest";
import type {
  NetworkOpenTicket,
  NetworkOverview,
  NetworkPropertyRow,
} from "./overview.server";

// The 9 AM ET daily digest body. Pure, so no DB — the overview is handed in.

const DASHBOARD = "https://ops.rentstayable.com/network";

/**
 * `online` is DERIVED from total/offline/unknown unless given explicitly — an
 * earlier version of this helper let a caller set total:12 offline:1 while online
 * stayed 12, so the fixture described an impossible property and the assertions
 * built on it were meaningless.
 */
function property(over: Partial<NetworkPropertyRow> = {}): NetworkPropertyRow {
  const total = over.total ?? 12;
  const offline = over.offline ?? 0;
  const unknown = over.unknown ?? 0;
  return {
    id: "p1",
    shortCode: "KW",
    name: "Kissimmee West",
    open: 0,
    resolved: 0,
    ...over,
    total,
    offline,
    unknown,
    online: over.online ?? Math.max(0, total - offline - unknown),
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
      devicesOfflineNoTicket: 0,
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
  const twoSites = () =>
    overview({
      properties: [
        property({ shortCode: "KW", total: 12, offline: 1, open: 1, resolved: 5 }),
        property({ id: "p2", shortCode: "OR", total: 92, offline: 46, open: 2, resolved: 9 }),
      ],
    });

  it("includes a row per property with its counts", () => {
    const text = build(twoSites());
    expect(text).toMatch(/KW\s+11\/12\s+1\s+1\s+5/);
    expect(text).toMatch(/OR\s+46\/92\s+46\s+2\s+9/);
  });

  it("labels the resolved column with the range so the number isn't ambiguous", () => {
    expect(build(overview())).toContain("Fixed = last 30 days");
  });

  it("totals the portfolio, so nobody has to add the column up by hand", () => {
    const text = build(twoSites());
    expect(text).toMatch(/All\s+57\/104\s+47\s+3\s+14/);
  });

  it("orders worst-first, not alphabetically — a digest is read in a hurry", () => {
    const text = build(twoSites());
    expect(text.indexOf("OR")).toBeLessThan(text.indexOf("KW"));
  });

  it("puts a property we are BLIND to above one with known-down devices", () => {
    const text = build(
      overview({
        properties: [
          property({ shortCode: "OR", total: 92, offline: 46 }),
          property({ id: "p2", shortCode: "JN", total: 0 }),
        ],
      }),
    );
    // Being unable to see a site is worse than knowing 46 devices at another are
    // down — the same rule that made unreachable devices UNKNOWN, not OFFLINE.
    expect(text.indexOf("JN")).toBeLessThan(text.indexOf("OR"));
  });

  it("omits the Unverifiable column entirely when nothing is unverifiable", () => {
    expect(build(overview())).not.toContain("Unver.");
  });

  it("adds the Unverifiable column as soon as any property has one", () => {
    const text = build(overview({ properties: [property({ total: 12, unknown: 2 })] }));
    expect(text).toContain("Unver.");
  });
});

describe("buildDailyDigest — realtime framing", () => {
  it("stamps when the figures were read, in ET", () => {
    const text = build(overview());
    expect(text).toContain("Live as of 1 Aug 9:00 AM ET");
  });

  it("says which figures are live and which are windowed", () => {
    // Without this a reader scrolling back three days cannot tell whether they
    // are looking at current state or history.
    const text = build(overview());
    expect(text).toContain("device status and open tickets are current");
    expect(text).toContain("“Fixed” is a range");
  });

  it("reports devices UP as a ratio, not just an offline count", () => {
    const text = build(
      overview({ cards: { devicesTotal: 596, devicesOffline: 34, devicesUnknown: 0 } }),
    );
    expect(text).toContain("Devices up now: 562 of 596");
  });

  it("excludes unverifiable devices from the up count — they are not confirmed up", () => {
    const text = build(
      overview({ cards: { devicesTotal: 100, devicesOffline: 10, devicesUnknown: 5 } }),
    );
    expect(text).toContain("Devices up now: 85 of 100");
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

// ── Card rendering ──────────────────────────────────────────────────────────
// Teams renders the Adaptive Card, not the `text` field (confirmed live
// 2026-08-01 from the flow's own attribution footer). And a TextBlock collapses
// runs of spaces, so the padded text table arrived squashed. These tests pin the
// property that fixes it: the table must be STRUCTURE, never padding.

const buildCard = (o: NetworkOverview) =>
  buildDailyDigestCard({
    overview: o,
    now: new Date("2026-08-01T13:00:00Z"),
    rangeLabel: "Last 30 days",
    dashboardUrl: DASHBOARD,
  });

type Card = Record<string, unknown>;
type Row = { columns: { width: string; items: Card[] }[] };

/**
 * The table is ROW-major: one ColumnSet per row (header, each property, totals).
 * A column-major version shipped first and visibly failed — emoji render taller
 * than text, so a dedicated glyph column accumulated height and the dots slid out
 * of line with their properties. These helpers read the row-major shape.
 */
const tableRowsOf = (els: Card[]) => els.filter((e) => e.type === "ColumnSet") as unknown as Row[];
const cellsOf = (row: Row) => row.columns.map((c) => String(c.items[0]!.text ?? ""));

describe("buildDailyDigestCard", () => {
  const twoProps = () =>
    overview({
      properties: [
        property({ shortCode: "KW", total: 12, offline: 1, unknown: 0, open: 1, resolved: 5 }),
        property({ id: "p2", shortCode: "OR", total: 92, offline: 46, unknown: 0, open: 2, resolved: 9 }),
      ],
    });

  it("renders the table as ColumnSets, not a text block", () => {
    // header + 2 properties + totals
    expect(tableRowsOf(buildCard(twoProps()))).toHaveLength(4);
  });

  it("NEVER pads cells with runs of spaces — that is the bug this replaced", () => {
    for (const row of tableRowsOf(buildCard(twoProps()))) {
      for (const cell of cellsOf(row)) {
        expect(cell).not.toMatch(/ {2,}/);
        // Nor a dashed rule row, which only exists to fake a border in text.
        expect(cell).not.toMatch(/^-{2,}$/);
      }
    }
  });

  it("gives every row identical column widths, so the columns line up", () => {
    // The actual alignment guarantee. Fixed weights, never "auto" — auto sizes
    // each row from its own content, so "105/118" and "0" would land on
    // different boundaries and the table would read ragged.
    const rows = tableRowsOf(buildCard(twoProps()));
    const shapes = new Set(rows.map((r) => r.columns.map((c) => c.width).join(",")));
    expect(shapes.size).toBe(1);
    expect([...shapes][0]).not.toContain("auto");
  });

  it("lays out header, properties worst-first, then totals", () => {
    const rows = tableRowsOf(buildCard(twoProps()));
    // Site · Up · Down · Open · Fixed — no Unverifiable column, since neither
    // fixture has unverifiable devices, and no separate glyph column.
    expect(cellsOf(rows[0]!)).toEqual(["Site", "Up", "Down", "Open", "Fixed"]);
    expect(cellsOf(rows[1]!)[0]).toBe("🔴 OR"); // 46 down, so first
    expect(cellsOf(rows[2]!)[0]).toBe("🔴 KW");
    expect(cellsOf(rows[3]!)).toEqual(["All", "57/104", "47", "3", "14"]);
  });

  it("fuses the glyph into the Site cell so it cannot drift away from it", () => {
    const rows = tableRowsOf(
      buildCard(
        overview({
          properties: [
            property({ shortCode: "KW", total: 12 }), // all healthy
            property({ id: "p2", shortCode: "OR", total: 92, offline: 46 }), // down
            property({ id: "p3", shortCode: "JN", total: 0 }), // blind
            property({ id: "p4", shortCode: "SA", total: 40, unknown: 3 }), // unverifiable
          ],
        }),
      ),
    );
    // Blind first, then down, then unverifiable, then healthy.
    expect(rows.slice(1, 5).map((r) => cellsOf(r)[0])).toEqual([
      "⚫ JN",
      "🔴 OR",
      "🟡 SA",
      "🟢 KW",
    ]);
  });

  it("puts each glyph in the SAME cell as its code, never a separate column", () => {
    // The regression this replaced: a lone glyph column drifting vertically.
    for (const row of tableRowsOf(buildCard(twoProps()))) {
      const cells = cellsOf(row);
      for (const [i, cell] of cells.entries()) {
        const isGlyph = /[⚫🔴🟡🟢]/u.test(cell);
        if (isGlyph) {
          expect(i).toBe(0); // only ever the Site cell
          expect(cell).toMatch(/^[⚫🔴🟡🟢] \w+$/u); // glyph AND code together
        }
      }
    }
  });

  it("tints only the cells that represent a problem", () => {
    const rows = tableRowsOf(buildCard(twoProps()));
    const or = rows[1]!.columns.map((c) => c.items[0]!);
    expect(or[2]!.color).toBe("Attention"); // Down = 46
    // "Fixed 9" is good news and must NOT be red just because it is non-zero.
    expect(or[4]!.color).toBeUndefined();
  });

  it("keeps every row the same width, so nothing can shear", () => {
    const rows = tableRowsOf(buildCard(twoProps()));
    expect(new Set(rows.map((r) => r.columns.length)).size).toBe(1);
  });

  it("puts the overview numbers in a FactSet", () => {
    const els = buildCard(overview({ cards: { openTickets: 7, escalated: 2 } }));
    const facts = els.find((e) => e.type === "FactSet") as
      | { facts: { title: string; value: string }[] }
      | undefined;
    expect(facts).toBeDefined();
    expect(facts!.facts).toEqual(
      expect.arrayContaining([
        { title: "Open tickets", value: "7" },
        { title: "Escalated", value: "2" },
      ]),
    );
  });

  it("agrees with the text version on every table number", () => {
    // The two renderings share the cell helpers; this is the regression guard
    // that says they still do. A card that disagrees with the logged body would
    // make the audit trail useless.
    const o = twoProps();
    const text = build(o);
    for (const row of tableRowsOf(buildCard(o))) {
      for (const cell of cellsOf(row)) expect(text).toContain(cell);
    }
  });

  it("carries the unmonitored warning as an Attention-coloured block, before any figures", () => {
    const els = buildCard(overview({ cards: { devicesTotal: 0 } })) as Card[];
    const warn = els.find((e) => typeof e.text === "string" && String(e.text).includes("not an all-clear"));
    expect(warn).toBeDefined();
    expect(warn!.color).toBe("Attention");
    // The invariant that matters is that it precedes every comforting zero, not
    // that it is literally element 0 — the as-of stamp sits above it as a
    // subtitle.
    const firstFactSet = els.findIndex((e) => e.type === "FactSet");
    expect(els.indexOf(warn!)).toBeLessThan(firstFactSet);
  });

  it("separates live figures from windowed ones with their own headings", () => {
    const els = buildCard(overview()) as Card[];
    const labels = els.filter((e) => e.type === "TextBlock").map((e) => String(e.text));
    expect(labels).toContain("Right now");
    expect(labels).toContain("Last 30 days");
    // Live first: the ordering tells the reader which is which before they read
    // a single label.
    expect(labels.indexOf("Right now")).toBeLessThan(labels.indexOf("Last 30 days"));
  });

  it("stamps the reading time on the card too", () => {
    expect(JSON.stringify(buildCard(overview()))).toContain("Live as of 1 Aug 9:00 AM ET");
  });

  it("survives a portfolio with no active properties", () => {
    const els = buildCard(overview({ properties: [] }));
    expect(tableRowsOf(els)).toHaveLength(0);
    expect(JSON.stringify(els)).toContain("No active properties");
  });

  it("links the dashboard as markdown, which a TextBlock does render", () => {
    expect(JSON.stringify(buildCard(overview()))).toContain(`[Dashboard](${DASHBOARD})`);
  });
});

// ── Live guest figures (Kyle 2026-08-01, "add realtime values") ─────────────
// Passed in rather than loaded by the overview, so the dashboard never grows a
// Spotipo dependency and the digest degrades on its own.

const guests = (m: Record<string, [number | null, boolean?, boolean?]>) =>
  Object.fromEntries(
    Object.entries(m).map(([id, [onlineNow, truncated = false, configured = true]]) => [
      id,
      { onlineNow, truncated, configured },
    ]),
  );

const buildG = (o: NetworkOverview, g?: Record<string, GuestLive>) =>
  buildDailyDigest({
    overview: o,
    now: new Date("2026-08-01T13:00:00Z"),
    rangeLabel: "Last 30 days",
    dashboardUrl: DASHBOARD,
    guests: g,
  });

describe("buildDailyDigest — guests online", () => {
  const sites = () =>
    overview({
      properties: [
        property({ id: "a", shortCode: "LL", total: 118, offline: 13 }),
        property({ id: "b", shortCode: "KW", total: 12 }),
      ],
    });

  it("omits the column and the fact entirely when no guest data is supplied", () => {
    const text = buildG(sites());
    expect(text).not.toContain("Guests");
  });

  it("adds a Guests column and a portfolio total when data is supplied", () => {
    const text = buildG(sites(), guests({ a: [22], b: [14] }));
    expect(text).toContain("Guests");
    expect(text).toContain("Guests online now: 36");
    expect(text).toMatch(/LL\s+105\/118\s+13\s+22/);
  });

  it("shows a dash, never a zero, for a site that could not be read", () => {
    // A 0 would claim nobody is on that guest network. "—" says we didn't get an
    // answer, which is the truth and prompts a different reaction.
    const text = buildG(sites(), guests({ a: [null], b: [14] }));
    expect(text).toMatch(/LL\s+105\/118\s+13\s+—/);
  });

  it("shows a dash for an unconfigured site too", () => {
    const text = buildG(sites(), guests({ a: [5, false, false], b: [14] }));
    expect(text).toMatch(/LL\s+105\/118\s+13\s+—/);
  });

  it("marks the total partial when any site is missing from it", () => {
    // A total that silently omits sites reads as the whole portfolio.
    const text = buildG(sites(), guests({ a: [null], b: [14] }));
    expect(text).toContain("Guests online now: 14 (partial)");
  });

  it("does not mark the total partial when every site reported", () => {
    const text = buildG(sites(), guests({ a: [22], b: [14] }));
    expect(text).toContain("Guests online now: 36");
    expect(text).not.toContain("(partial)");
  });

  it("carries the '+' through when a site's page-walk was truncated", () => {
    // The real figure is higher than counted; dropping the marker would state a
    // precise number we know to be low.
    const text = buildG(sites(), guests({ a: [22, true], b: [14] }));
    expect(text).toContain("Guests online now: 36+");
  });

  it("adds the Guests column to the card too, in the right position", () => {
    const rows = tableRowsOf(
      buildDailyDigestCard({
        overview: sites(),
        now: new Date("2026-08-01T13:00:00Z"),
        rangeLabel: "Last 30 days",
        dashboardUrl: DASHBOARD,
        guests: guests({ a: [22], b: [14] }),
      }),
    );
    // Site · Up · Down · Guests · Open · Fixed
    expect(cellsOf(rows[0]!)).toEqual(["Site", "Up", "Down", "Guests", "Open", "Fixed"]);
    // LL is worst (13 down) so it leads; then KW; then the All row.
    expect(rows.slice(1).map((r) => cellsOf(r)[3])).toEqual(["22", "14", "36"]);
  });

  it("puts Guests online in the card's Right-now facts, not the windowed ones", () => {
    const els = buildDailyDigestCard({
      overview: sites(),
      now: new Date("2026-08-01T13:00:00Z"),
      rangeLabel: "Last 30 days",
      dashboardUrl: DASHBOARD,
      guests: guests({ a: [22], b: [14] }),
    }) as Card[];
    const factSets = els.filter((e) => e.type === "FactSet") as unknown as {
      facts: { title: string }[];
    }[];
    expect(factSets[0]!.facts.map((f) => f.title)).toContain("Guests online");
    expect(factSets[1]!.facts.map((f) => f.title)).not.toContain("Guests online");
  });
});
