import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@prisma/client";
import {
  buildChecklistDigest,
  buildChecklistDigestModel,
  checklistDigestDays,
  dateOnlyUtc,
  previousYMD,
  type ChecklistDigestInput,
  type ChecklistStatusCount,
  type DigestProperty,
} from "./checklist-digest";

// The eight active properties, as the digest sees them. Short codes are
// canonical across the platform (ADR-011), so the digest never renders a long
// name and these tests assert on the codes.
const PROPERTIES: DigestProperty[] = [
  { id: "p-jn", shortCode: "JN" },
  { id: "p-jw", shortCode: "JW" },
  { id: "p-ke", shortCode: "KE" },
  { id: "p-kw", shortCode: "KW" },
  { id: "p-ll", shortCode: "LL" },
  { id: "p-or", shortCode: "OR" },
  { id: "p-sa", shortCode: "SA" },
  { id: "p-dp", shortCode: "DP" },
];

const LINKS = {
  day: "https://ops.rentstayable.com/checklists?status=all&from=2026-09-08&to=2026-09-08",
  reviewQueue: "https://ops.rentstayable.com/review",
};

/** 13:05 UTC on 9 Sep 2026 = 9:05 AM EDT — the hour this digest actually runs. */
const NOW = new Date("2026-09-09T13:05:00Z");

const c = (propertyId: string, status: InstanceStatus, count: number): ChecklistStatusCount => ({
  propertyId,
  status,
  count,
});

function input(over: Partial<ChecklistDigestInput> = {}): ChecklistDigestInput {
  return {
    properties: PROPERTIES,
    yesterday: [],
    today: [],
    now: NOW,
    links: LINKS,
    ...over,
  };
}

// ── ET day boundaries ───────────────────────────────────────────────────────

describe("checklistDigestDays", () => {
  it("reports on the ET day, not the UTC day", () => {
    // 01:30 UTC on 9 Sep is still 9:30 PM on 8 Sep in Eastern. A UTC-derived
    // digest would grade 8 Sep as "yesterday" while it is still running.
    expect(checklistDigestDays(new Date("2026-09-09T01:30:00Z"))).toEqual({
      todayYMD: "2026-09-08",
      yesterdayYMD: "2026-09-07",
    });
  });

  it("uses the ET day at the 9 AM send time", () => {
    expect(checklistDigestDays(NOW)).toEqual({
      todayYMD: "2026-09-09",
      yesterdayYMD: "2026-09-08",
    });
  });

  it("steps the calendar across a month boundary", () => {
    expect(checklistDigestDays(new Date("2026-10-01T13:00:00Z")).yesterdayYMD).toBe("2026-09-30");
  });

  it("steps the calendar, not 24 hours, across a DST change", () => {
    // 1 Nov 2026 is 25 hours long in Eastern and 8 Mar is 23. Subtracting
    // 86_400_000 ms is wrong on one of them; stepping the calendar date is right
    // on both.
    expect(previousYMD("2026-11-02")).toBe("2026-11-01");
    expect(previousYMD("2026-03-09")).toBe("2026-03-08");
    expect(previousYMD("2026-01-01")).toBe("2025-12-31");
    expect(previousYMD("2028-03-01")).toBe("2028-02-29"); // leap year
  });

  it("matches a @db.Date column at UTC midnight, not at the ET instant", () => {
    // scheduledFor is `@db.Date`: Prisma stores it as UTC midnight. Filtering
    // with the ET day's true start (04:00/05:00Z) would match nothing.
    expect(dateOnlyUtc("2026-09-08").toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });
});

// ── Classification ──────────────────────────────────────────────────────────

describe("buildChecklistDigestModel — buckets", () => {
  it("counts SUBMITTED and REVIEWED as completed", () => {
    const m = buildChecklistDigestModel(
      input({
        yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 3), c("p-ll", InstanceStatus.REVIEWED, 2)],
      }),
    );
    expect(m.totals.completed).toBe(5);
    expect(m.totals.missed).toBe(0);
  });

  it("keeps FLAGGED out of completed — it owes a redo", () => {
    const m = buildChecklistDigestModel(
      input({
        yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 8), c("p-ll", InstanceStatus.FLAGGED, 2)],
      }),
    );
    expect(m.totals.completed).toBe(8);
    expect(m.totals.flagged).toBe(2);
    expect(m.totals.expected).toBe(10);
    expect(m.completionPct).toBe(80);
  });

  it("treats every unfinished status, including EXPIRED, as not completed", () => {
    const m = buildChecklistDigestModel(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SCHEDULED, 1),
          c("p-ll", InstanceStatus.ASSIGNED, 2),
          c("p-ll", InstanceStatus.IN_PROGRESS, 3),
          c("p-ll", InstanceStatus.EXPIRED, 4),
        ],
      }),
    );
    expect(m.totals.missed).toBe(10);
    expect(m.completionPct).toBe(0);
  });

  it("excludes INVALIDATED from the graded denominator", () => {
    // A stayover is work that ceased to exist. Grading a property down for it
    // would punish the correct behaviour.
    const m = buildChecklistDigestModel(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 4),
          c("p-ll", InstanceStatus.INVALIDATED, 6),
        ],
      }),
    );
    expect(m.totals.expected).toBe(4);
    expect(m.totals.voided).toBe(6);
    expect(m.completionPct).toBe(100);
  });

  it("counts today's load without invalidated instances", () => {
    const m = buildChecklistDigestModel(
      input({
        today: [
          c("p-ll", InstanceStatus.SCHEDULED, 12),
          c("p-ll", InstanceStatus.IN_PROGRESS, 1),
          c("p-ll", InstanceStatus.INVALIDATED, 5),
        ],
      }),
    );
    expect(m.totals.today).toBe(13);
  });
});

// ── The Reviewed column ─────────────────────────────────────────────────────

describe("Reviewed column", () => {
  it("counts REVIEWED as a SUBSET of Done, never as an addition to it", () => {
    // The wrong reading this guards: `Done 12 · Rev'd 3` must describe twelve
    // finished checklists of which three are signed off — not fifteen events.
    const m = buildChecklistDigestModel(
      input({
        yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 9), c("p-ll", InstanceStatus.REVIEWED, 3)],
      }),
    );
    expect(m.totals.completed).toBe(12);
    expect(m.totals.reviewed).toBe(3);
    expect(m.rows[0]!.reviewed).toBeLessThanOrEqual(m.rows[0]!.completed);
    // The denominator does not double-count either.
    expect(m.totals.expected).toBe(12);
  });

  it("can equal Done when the manager has worked the whole queue", () => {
    const m = buildChecklistDigestModel(
      input({ yesterday: [c("p-ll", InstanceStatus.REVIEWED, 12)] }),
    );
    expect(m.totals.completed).toBe(12);
    expect(m.totals.reviewed).toBe(12);
    expect(m.completionPct).toBe(100);
  });

  it("spells the subset relation out under the table, where it cannot be truncated", () => {
    const { text, card } = buildChecklistDigest(
      input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    expect(text).toContain("Reviewed is the part of Done a manager signed off (a subset, not an addition)");
    expect(JSON.stringify(card)).toContain("a subset, not an addition");
  });

  it("shows a dash, not 0, when nothing was due to review", () => {
    // "0 reviewed" would read as an untouched backlog when there was nothing
    // to review in the first place.
    const { card } = buildChecklistDigest(input({ today: [c("p-sa", InstanceStatus.SCHEDULED, 4)] }));
    expect(cellsOf(countRows(card)[1]!)).toEqual(["⚫ SA", "—", "—", "—", "4", "—"]);
  });

  it("never tints Rev'd — a low count at 9 AM means the manager has not started", () => {
    const { card } = buildChecklistDigest(
      input({
        yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 9), c("p-ll", InstanceStatus.REVIEWED, 3)],
      }),
    );
    const cells = countRows(card)[1]!.columns.map((col) => col.items[0]!);
    expect(cells[5]!.color).toBeUndefined();
  });
});

// ── What the second restructure removed ─────────────────────────────────────

describe("no per-property detail lines", () => {
  it("renders the counts table and nothing beneath each row", () => {
    // Kyle saw the named-misses version in Teams and asked for the table only.
    const { text, card } = buildChecklistDigest(
      input({
        yesterday: [
          c("p-ke", InstanceStatus.EXPIRED, 14),
          c("p-ke", InstanceStatus.SUBMITTED, 1),
          c("p-ll", InstanceStatus.FLAGGED, 2),
        ],
      }),
    );
    expect(text).not.toContain("↳");
    expect(text).not.toContain("Missed ·");
    expect(JSON.stringify(card)).not.toContain("↳");
    // Between the header row and the last property row there is nothing but
    // ColumnSets — no interleaved prose.
    const firstRow = card.findIndex((e) => e.type === "ColumnSet");
    const lastRow = card.map((e) => e.type).lastIndexOf("ColumnSet");
    for (const el of card.slice(firstRow, lastRow + 1)) expect(el.type).toBe("ColumnSet");
  });
});

// ── Empty states ────────────────────────────────────────────────────────────

describe("a property with nothing to report", () => {
  it("drops it from the digest but still names it", () => {
    const m = buildChecklistDigestModel(
      input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    expect(m.rows.map((r) => r.shortCode)).toEqual(["LL"]);
    // Seven silent properties, named on one line so an absent property is never
    // confused with one that fell out of the query.
    expect(m.silentShortCodes).toEqual(["DP", "JN", "JW", "KE", "KW", "OR", "SA"]);
  });

  it("keeps a property that has only today's work", () => {
    const m = buildChecklistDigestModel(input({ today: [c("p-sa", InstanceStatus.SCHEDULED, 4)] }));
    expect(m.rows.map((r) => r.shortCode)).toEqual(["SA"]);
    expect(m.silentShortCodes).not.toContain("SA");
  });

  it("keeps a property whose only yesterday activity was invalidated, and explains it", () => {
    // Six stayovers is a fact about the day; hiding the property would make it
    // look as though nothing was ever scheduled there. And the row renders as
    // dashes, so without the explaining line it reads as a bug.
    const { model, text } = buildChecklistDigest(
      input({ yesterday: [c("p-dp", InstanceStatus.INVALIDATED, 6)] }),
    );
    expect(model.rows.map((r) => r.shortCode)).toEqual(["DP"]);
    expect(text).toContain(
      "Invalidated yesterday, not graded (stayover / duplicate / not needed): DP 6",
    );
  });

  it("says nothing about invalidations when there were none", () => {
    const { text } = buildChecklistDigest(
      input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    expect(text).not.toContain("Invalidated");
  });

  it("renders a nothing-due property with dashes, never with a green tick", () => {
    const { model, text } = buildChecklistDigest(
      input({ today: [c("p-sa", InstanceStatus.SCHEDULED, 4)] }),
    );
    expect(model.rows[0]!.expected).toBe(0);
    // ⚫ = "nothing was measured here", which must not read as 🟢 "measured and
    // passed". Same rule the network digest applies to an unmonitored fleet.
    expect(text).toContain("⚫ SA");
    expect(text).not.toContain("🟢 SA");
  });
});

describe("a portfolio with zero activity", () => {
  const built = () => buildChecklistDigest(input());

  it("says plainly that this is an empty state, not an all-clear", () => {
    const { text, card } = built();
    expect(text).toContain("This is an empty state, not an all-clear");
    expect(JSON.stringify(card)).toContain("This is an empty state, not an all-clear");
  });

  it("shows a dash for the completion rate rather than 0% or 100%", () => {
    // 0% would accuse everyone of missing everything; 100% would claim a perfect
    // day. Neither is true when nothing was scheduled.
    const { model, text } = built();
    expect(model.completionPct).toBeNull();
    expect(text).toContain("All properties — done — (—)");
  });

  it("renders no property blocks and names every property as silent", () => {
    const { model, text } = built();
    expect(model.rows).toEqual([]);
    expect(model.portfolioEmpty).toBe(true);
    expect(text).toContain("No property had anything scheduled.");
    expect(model.silentShortCodes).toHaveLength(8);
  });
});

// ── Layout ──────────────────────────────────────────────────────────────────

describe("layout", () => {
  it("opens on the properties — no portfolio summary above them", () => {
    // Kyle 2026-09-10: "focus on per property. No need summary on top."
    const { text } = buildChecklistDigest(
      input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    // Line 1 is the as-of stamp; line 2 must already be the property table head.
    expect(lines[1]).toMatch(/^Site\s/);
    const totalsAt = lines.findIndex((l) => l.startsWith("All properties —"));
    const firstPropertyAt = lines.findIndex((l) => /^[⚫🔴🟡🟢]/u.test(l));
    expect(firstPropertyAt).toBeGreaterThan(-1);
    expect(totalsAt).toBeGreaterThan(firstPropertyAt);
  });

  it("puts the one portfolio total at the bottom, and only there", () => {
    const { text, card } = buildChecklistDigest(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 9),
          c("p-ll", InstanceStatus.REVIEWED, 3),
          c("p-ll", InstanceStatus.FLAGGED, 1),
          c("p-or", InstanceStatus.EXPIRED, 1),
        ],
        today: [c("p-ll", InstanceStatus.SCHEDULED, 14)],
      }),
    );
    expect(text).toContain(
      "All properties — done 12/14 (86%) · reviewed 3 · flagged 1 · missed 1 · today 14",
    );
    // No "All" row inside the table — two renderings of one number is how they
    // start to disagree.
    for (const row of countRows(card)) expect(cellsOf(row)[0]).not.toBe("All");
  });

  it("orders properties worst-first", () => {
    const m = buildChecklistDigestModel(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 10), // clean
          c("p-kw", InstanceStatus.FLAGGED, 2),
          c("p-kw", InstanceStatus.SUBMITTED, 8),
          c("p-or", InstanceStatus.EXPIRED, 5),
          c("p-or", InstanceStatus.SUBMITTED, 1),
        ],
      }),
    );
    expect(m.rows.map((r) => r.shortCode)).toEqual(["OR", "KW", "LL"]);
  });

  it("fuses the glyph into the site cell so it cannot drift away from it", () => {
    const { card } = buildChecklistDigest(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 4),
          c("p-or", InstanceStatus.EXPIRED, 1),
          c("p-kw", InstanceStatus.FLAGGED, 1),
        ],
        today: [c("p-sa", InstanceStatus.SCHEDULED, 2)],
      }),
    );
    const sites = countRows(card)
      .slice(1, 5)
      .map((r) => cellsOf(r)[0]);
    // ⚫ SA (nothing measured) outranks 🟢 LL (measured, clean) — an unknown
    // needs a look before a confirmed pass does.
    expect(sites).toEqual(["🔴 OR", "🟡 KW", "⚫ SA", "🟢 LL"]);
    for (const s of sites) expect(s).toMatch(/^[⚫🔴🟡🟢] [A-Z]{2}$/u);
  });
});

// ── The sample-mode banner ──────────────────────────────────────────────────

describe("banner", () => {
  const BANNER = "⚠️ SAMPLE — NOT REAL DATA. Every number below is fabricated.";

  it("renders FIRST in both renderings, above even the date stamp", () => {
    // A disclaimer below the numbers is a disclaimer nobody reads, and a Teams
    // post of invented figures that looks real is the hazard this exists for.
    const { text, card } = buildChecklistDigest(
      input({ banner: BANNER, yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    expect(text.split("\n")[0]).toBe(BANNER);
    expect(card[0]).toMatchObject({ type: "TextBlock", text: BANNER, color: "Attention" });
  });

  it("is absent from a real digest", () => {
    const { text, card } = buildChecklistDigest(
      input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] }),
    );
    expect(text).not.toContain("SAMPLE");
    expect(JSON.stringify(card)).not.toContain("SAMPLE");
    // The first element is the date stamp, not a blank left behind by the banner.
    expect(String((card[0] as Record<string, unknown>).text)).toContain("Yesterday Tue 8 Sep");
  });
});

// ── Card structure ──────────────────────────────────────────────────────────

type Card = Record<string, unknown>;
type Row = { columns: { width: string; items: Card[] }[] };

/** The counts rows: header, then one per property. Detail is TextBlocks. */
const countRows = (els: Card[]) => els.filter((e) => e.type === "ColumnSet") as unknown as Row[];
const cellsOf = (row: Row) => row.columns.map((col) => String(col.items[0]!.text ?? ""));

describe("buildChecklistDigestCard", () => {
  const populated = () =>
    buildChecklistDigest(
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 10),
          c("p-ll", InstanceStatus.REVIEWED, 2),
          c("p-ll", InstanceStatus.FLAGGED, 1),
          c("p-or", InstanceStatus.SUBMITTED, 3),
          c("p-or", InstanceStatus.EXPIRED, 7),
        ],
        today: [c("p-ll", InstanceStatus.SCHEDULED, 14), c("p-or", InstanceStatus.SCHEDULED, 9)],
      }),
    );

  it("keeps the counts as ColumnSets — header, then one per property", () => {
    expect(countRows(populated().card)).toHaveLength(3);
  });

  it("NEVER pads a counts cell with runs of spaces — a TextBlock collapses them", () => {
    for (const row of countRows(populated().card)) {
      for (const cell of cellsOf(row)) {
        expect(cell).not.toMatch(/ {2,}/);
        expect(cell).not.toMatch(/^-{2,}$/);
      }
    }
  });

  it("gives every counts row identical column widths, so they line up", () => {
    const shapes = new Set(
      countRows(populated().card).map((r) => r.columns.map((col) => col.width).join(",")),
    );
    expect(shapes.size).toBe(1);
    expect([...shapes][0]).not.toContain("auto");
  });

  it("lays out the header then the properties, worst-first", () => {
    const rows = countRows(populated().card);
    expect(cellsOf(rows[0]!)).toEqual(["Site", "Done", "Flag", "Missed", "Today", "Rev'd"]);
    expect(cellsOf(rows[1]!)).toEqual(["🔴 OR", "3/10", "0", "7", "9", "0"]);
    // Done 12 = 10 submitted + 2 reviewed; Rev'd 2 is INSIDE that 12.
    expect(cellsOf(rows[2]!)).toEqual(["🟡 LL", "12/13", "1", "0", "14", "2"]);
  });

  it("has NO totals row in the table — the portfolio figure is the bottom line", () => {
    // Two renderings of the same total is how they start to disagree, and Kyle
    // asked for the summary out of the way, not doubled.
    for (const row of countRows(populated().card)) {
      expect(cellsOf(row)[0]).not.toBe("All");
    }
    expect(populated().text).toContain("All properties — done 15/23");
  });

  it("tints only the cells that represent a problem", () => {
    const rows = countRows(populated().card);
    const or = rows[1]!.columns.map((col) => col.items[0]!);
    expect(or[3]!.color).toBe("Attention"); // Missed = 7
    expect(or[1]!.color).toBeUndefined(); // "3/10" done is not an alarm
    expect(or[4]!.color).toBeUndefined(); // today's load is neutral
    const ll = rows[2]!.columns.map((col) => col.items[0]!);
    expect(ll[2]!.color).toBe("Warning"); // Flag = 1
  });

  it("carries absolute links out to the app", () => {
    const json = JSON.stringify(populated().card);
    expect(json).toContain(LINKS.day);
    expect(json).toContain(LINKS.reviewQueue);
  });

  it("titles and stamps the digest in ET", () => {
    const { title, text } = populated();
    expect(title).toBe("Checklists — daily digest Wed 9 Sep 2026");
    // The dates must survive being derived from a `yyyy-MM-dd`: rendering a
    // UTC-midnight instant in Eastern would print each one a day early.
    expect(text).toContain("Yesterday Tue 8 Sep · today Wed 9 Sep · sent 9:05 AM ET");
  });
});

// ── Card and text must never disagree ───────────────────────────────────────

/**
 * Re-read the padded plain-text table back into cells, so it can be compared to
 * the card's ColumnSets. Splitting on two-or-more spaces is exactly the padding
 * the card must never contain, which is why only this side needs the parser.
 */
function textRows(text: string): string[][] {
  const rows: string[][] = [];
  let started = false;
  for (const line of text.split("\n")) {
    if (/^Site\s/.test(line)) started = true;
    if (!started) continue;
    if (line.trim() === "") break; // the table ends at the first blank line
    if (/^[-\s]+$/.test(line)) continue; // rule row — text-only decoration
    rows.push(line.split(/ {2,}/).map((cell) => cell.trim()));
  }
  return rows;
}

describe("card and text fallback agree", () => {
  const scenarios: Array<[string, ChecklistDigestInput]> = [
    ["zero activity anywhere", input()],
    ["one property only", input({ yesterday: [c("p-ll", InstanceStatus.SUBMITTED, 2)] })],
    [
      "mixed portfolio with reviews and invalidations",
      input({
        yesterday: [
          c("p-ll", InstanceStatus.SUBMITTED, 12),
          c("p-ll", InstanceStatus.FLAGGED, 1),
          c("p-or", InstanceStatus.REVIEWED, 3),
          c("p-or", InstanceStatus.EXPIRED, 5),
          c("p-ke", InstanceStatus.INVALIDATED, 4),
          c("p-ke", InstanceStatus.IN_PROGRESS, 2),
          c("p-dp", InstanceStatus.ASSIGNED, 1),
        ],
        today: [
          c("p-ll", InstanceStatus.SCHEDULED, 14),
          c("p-or", InstanceStatus.SCHEDULED, 9),
          c("p-jn", InstanceStatus.SCHEDULED, 6),
        ],
      }),
    ],
    ["a sample-mode banner above everything", input({ banner: "⚠️ SAMPLE — NOT REAL DATA." })],
  ];

  for (const [name, params] of scenarios) {
    it(`reports the same counts rows in both renderings — ${name}`, () => {
      // A chat client shows the card and a log reader sees the text; the two
      // disagreeing about a number is worse than either being wrong alone.
      const { card, text } = buildChecklistDigest(params);
      expect(textRows(text)).toEqual(countRows(card).map(cellsOf));
    });

    it(`carries the Reviewed column in both renderings — ${name}`, () => {
      const { card, text } = buildChecklistDigest(params);
      for (const row of [...textRows(text), ...countRows(card).map(cellsOf)]) {
        expect(row).toHaveLength(6);
      }
    });

    it(`reports the same portfolio total in both renderings — ${name}`, () => {
      const { card, text } = buildChecklistDigest(params);
      const line = text.split("\n").find((l) => l.startsWith("All properties —"))!;
      expect(JSON.stringify(card)).toContain(JSON.stringify(line).slice(1, -1));
    });
  }
});
