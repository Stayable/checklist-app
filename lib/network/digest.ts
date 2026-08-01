import { formatDateInET } from "../datetime";
import type { CardElement } from "./teams-webhook";
import type { NetworkOverview } from "./overview.server";

// The 9 AM ET daily network digest body (Kyle 2026-08-01).
//
// "Every 9am Est send The Overview Cards (Open Tickets, Escalated, etc.) and the
// Status by Property Table" — to the General channel.
//
// Pure: takes an already-loaded overview and returns text. No I/O, no DB, so the
// wording is unit-testable and the cron route stays a thin shell. Tone follows
// ADR-010: terse and factual, not the empathetic prose of the human-typed
// digest it replaces.
//
// Type-only import of NetworkOverview — this file is safe to use anywhere,
// despite the `.server` module it borrows the shape from.

export type DigestParams = {
  overview: NetworkOverview;
  now: Date;
  /** Label for the resolved-work window, e.g. "Last 30 days". */
  rangeLabel: string;
  /** Absolute URL of the dashboard, so a reader can go from post to detail. */
  dashboardUrl: string;
};

export function digestTitle(now: Date): string {
  return `Network — daily status ${formatDateInET(now, "EEE d MMM yyyy")}`;
}

/**
 * Stamps the reading time, because most of this digest is present-tense: device
 * up/down, open tickets and escalations are all "right now", not "yesterday".
 * Without the stamp a reader scrolling back three days cannot tell whether they
 * are looking at live numbers or history — and the two demand different actions.
 * Only `Fixed` and the average are windowed, and both carry their own range
 * label.
 */
export function digestAsOf(now: Date): string {
  return `Live as of ${formatDateInET(now, "d MMM h:mm a")} ET · device status and open tickets are current; “Fixed” is a range`;
}

/**
 * Per-property health glyph. Scannable in a chat client in a way a number
 * column is not — the reader's eye finds the red rows before reading anything.
 *
 * `⚫` (not monitored) ranks as a PROBLEM, not a neutral state: a property with
 * no devices registered is one we are blind to, and this codebase's standing
 * rule is that an unmonitored fleet must never render as a healthy one (N4).
 */
function healthGlyph(p: NetworkOverview["properties"][number]): string {
  if (p.total === 0) return "⚫";
  if (p.offline > 0 || p.open > 0) return "🔴";
  if (p.unknown > 0) return "🟡";
  return "🟢";
}

/**
 * Worst-first ordering. The dashboard sorts alphabetically, which is right for a
 * page you scan deliberately; a 9 AM digest is read in a hurry, so the rows that
 * need action go on top. Blind properties first — being unable to see a site is
 * worse than knowing a device at it is down.
 */
function rankedProperties(overview: NetworkOverview): NetworkOverview["properties"] {
  return [...overview.properties].sort((a, b) => {
    const blind = (p: typeof a) => (p.total === 0 ? 0 : 1);
    if (blind(a) !== blind(b)) return blind(a) - blind(b);
    const bad = (p: typeof a) => p.offline + p.unknown;
    if (bad(a) !== bad(b)) return bad(b) - bad(a);
    if (a.open !== b.open) return b.open - a.open;
    return a.shortCode.localeCompare(b.shortCode);
  });
}

/**
 * Which columns to render.
 *
 * `Unverified` appears ONLY when some property actually has unverifiable
 * devices. It is normally zero, and a permanently-empty column costs width in a
 * chat card for no information — but when it is non-zero it is the single most
 * important column on the table, because those devices are not confirmed up.
 */
function showUnknownColumn(overview: NetworkOverview): boolean {
  return overview.properties.some((p) => p.unknown > 0);
}

function tableHeader(overview: NetworkOverview): string[] {
  return [
    "",
    "Site",
    "Up",
    "Down",
    ...(showUnknownColumn(overview) ? ["Unver."] : []),
    "Open",
    "Fixed",
  ];
}

/**
 * One table row's cells, shared by the card and the text renderings so the two
 * can never disagree about a number.
 *
 * `Up` is rendered as "26/39" rather than a bare online count: the ratio carries
 * the total too, so one column answers both "how many are up" and "out of how
 * many" without spending a second column on it.
 */
function tableRows(overview: NetworkOverview): string[][] {
  const withUnknown = showUnknownColumn(overview);
  return rankedProperties(overview).map((p) => [
    healthGlyph(p),
    p.shortCode,
    // A property with zero devices is a COVERAGE GAP, not a healthy one. Say so
    // rather than printing a bare 0 that reads like "nothing wrong here".
    p.total === 0 ? "none" : `${p.online}/${p.total}`,
    p.total === 0 ? "—" : String(p.offline),
    ...(withUnknown ? [p.total === 0 ? "—" : String(p.unknown)] : []),
    String(p.open),
    String(p.resolved),
  ]);
}

/**
 * Portfolio totals row. Without it the reader has to add six numbers in their
 * head to answer "how bad is it overall", which is the first question a digest
 * should answer.
 */
function totalsRow(overview: NetworkOverview): string[] {
  const p = overview.properties;
  const sum = (pick: (r: (typeof p)[number]) => number) => p.reduce((n, r) => n + pick(r), 0);
  const online = sum((r) => r.online);
  const total = sum((r) => r.total);
  return [
    "",
    "All",
    `${online}/${total}`,
    String(sum((r) => r.offline)),
    ...(showUnknownColumn(overview) ? [String(sum((r) => r.unknown))] : []),
    String(sum((r) => r.open)),
    String(sum((r) => r.resolved)),
  ];
}

function tableCaption(rangeLabel: string): string {
  return `Status by property (Fixed = ${rangeLabel.toLowerCase()})`;
}

/**
 * Space-padded table, for the plain-text renderings — the NotificationLog body,
 * the `text` fallback field, and anywhere a human reads the raw message.
 *
 * ⚠ NOT for the Teams card. An Adaptive Card TextBlock renders markdown-ish
 * rich text and **collapses runs of spaces**: this exact table was posted live
 * on 2026-08-01 and arrived with every column squashed together. The card gets
 * `digestTableCard` below instead. An earlier comment here claimed padding would
 * survive — that was a guess, and it was wrong.
 */
function propertyTableText(overview: NetworkOverview, rangeLabel: string): string[] {
  const header = tableHeader(overview);
  const rows = tableRows(overview);
  if (rows.length === 0) return [tableCaption(rangeLabel), "No active properties."];

  const all = [header, ...rows, totalsRow(overview)];
  const widths = header.map((_, i) => Math.max(...all.map((r) => [...(r[i] ?? "")].length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();

  // The glyph column has no heading, so its rule is blank too — a lone "-"
  // floating left of "Site" reads as a column that lost its name.
  const rule = line(header.map((h, i) => (h === "" ? "" : "-".repeat(widths[i]!))));

  return [
    tableCaption(rangeLabel),
    line(header),
    rule,
    ...rows.map(line),
    rule,
    line(totalsRow(overview)),
  ];
}

/**
 * The same table as an Adaptive Card ColumnSet, which renders genuinely aligned
 * regardless of font.
 *
 * Laid out COLUMN-major — one Column per field, each holding a stack of
 * TextBlocks — rather than one ColumnSet per row. Alignment then comes from the
 * container itself, so it cannot drift, and it is one element instead of one per
 * property.
 */
function digestTableCard(overview: NetworkOverview, rangeLabel: string): CardElement[] {
  const rows = tableRows(overview);
  if (rows.length === 0) {
    return [
      { type: "TextBlock", text: tableCaption(rangeLabel), weight: "Bolder", wrap: true },
      {
        type: "TextBlock",
        text: "_No active properties._",
        wrap: true,
        isSubtle: true,
      },
    ];
  }

  const header = tableHeader(overview);
  const totals = totalsRow(overview);

  return [
    { type: "TextBlock", text: tableCaption(rangeLabel), weight: "Bolder", wrap: true },
    {
      type: "ColumnSet",
      separator: true,
      columns: header.map((heading, col) => ({
        type: "Column",
        // Glyph and site stay intrinsic width so the numeric columns get the
        // remaining space evenly and can be compared straight down.
        width: col <= 1 ? "auto" : "stretch",
        items: [
          { type: "TextBlock", text: heading, weight: "Bolder", wrap: false, isSubtle: true },
          ...rows.map((r) => ({
            type: "TextBlock",
            text: r[col]!,
            wrap: false,
            // Colour the cell, not the row: Adaptive Cards have no row concept,
            // and tinting only the number that is bad is what draws the eye to
            // it. Applied per column so "Down: 13" is red while that same
            // property's "Fixed: 9" stays neutral.
            ...cellTone(header[col]!, r[col]!),
          })),
          {
            type: "TextBlock",
            text: totals[col]!,
            weight: "Bolder",
            wrap: false,
            separator: true,
          },
        ],
      })),
    },
  ];
}

/**
 * Emphasis for one cell, by column meaning. Only ever highlights a number that
 * represents a problem — a green wash on healthy rows would make the table
 * harder to scan, not easier, because everything would be coloured.
 */
function cellTone(heading: string, value: string): CardElement {
  const n = Number.parseInt(value, 10);
  const positive = Number.isFinite(n) && n > 0;
  if ((heading === "Down" || heading === "Open") && positive) {
    return { color: "Attention", weight: "Bolder" };
  }
  if (heading === "Unver." && positive) return { color: "Warning", weight: "Bolder" };
  if (heading === "Up" && value === "none") return { color: "Attention", weight: "Bolder" };
  return {};
}

export function buildDailyDigest(params: DigestParams): string {
  const { overview, now, rangeLabel, dashboardUrl } = params;
  const c = overview.cards;

  const lines: string[] = [digestAsOf(now), ""];

  // Lead with the honest caveat when there is nothing to report, so an empty
  // digest is never mistaken for an all-clear — same rule the dashboard's empty
  // state follows.
  if (c.devicesTotal === 0) {
    lines.push(
      "⚠️ No devices are being monitored. This is an empty state, not an all-clear —",
      "nothing below reflects the real network until the UniFi poll runs.",
      "",
    );
  }

  lines.push(
    "Overview",
    `Devices up now: ${c.devicesTotal - c.devicesOffline - c.devicesUnknown} of ${c.devicesTotal}`,
    `Devices offline: ${c.devicesOffline}`,
    `Unverifiable (console unreachable): ${c.devicesUnknown}`,
    `Open tickets: ${c.openTickets}`,
    `Escalated: ${c.escalated}`,
    `Properties with issues: ${c.propertiesWithIssues}`,
    `Resolved · ${rangeLabel}: ${c.resolvedInRange}`,
    `Avg resolution · ${rangeLabel}: ${
      c.avgResolutionMin === null ? "—" : `${c.avgResolutionMin} min`
    }`,
    "",
  );

  if (c.devicesUnknown > 0) {
    lines.push(
      `⚠️ ${c.devicesUnknown} device${c.devicesUnknown === 1 ? "" : "s"} could not be verified —` +
        " their console is unreachable, so they are not confirmed up.",
      "",
    );
  }

  lines.push(...propertyTableText(overview, rangeLabel), "");
  lines.push(...oldestOpenLines(overview), "");
  lines.push(`[Dashboard] → ${dashboardUrl}`);

  return lines.join("\n");
}

/**
 * Names the oldest open tickets. The counts say how bad it is; these say what to
 * do next, which is the only reason to read a digest at 9 AM.
 */
function oldestOpenLines(overview: NetworkOverview): string[] {
  const oldest = overview.openTicketList.slice(0, OLDEST_SHOWN);
  if (oldest.length === 0) return ["No open tickets."];

  const lines = ["Oldest open"];
  for (const t of oldest) {
    lines.push(
      `${t.ticketNumber} · ${t.propertyShortCode} · ${t.deviceName ?? "property-wide"} · since ${formatDateInET(t.openedAt, "d MMM HH:mm")} ET`,
    );
  }
  if (overview.openTicketList.length > oldest.length) {
    lines.push(`…and ${overview.openTicketList.length - oldest.length} more open.`);
  }
  return lines;
}

const OLDEST_SHOWN = 5;

/**
 * The digest as Adaptive Card elements — what Teams actually renders.
 *
 * Same content as `buildDailyDigest`, and the numbers come from the same
 * helpers, but the property table is a ColumnSet instead of padded text because
 * a TextBlock collapses the padding (verified live 2026-08-01).
 */
export function buildDailyDigestCard(params: DigestParams): CardElement[] {
  const { overview, now, rangeLabel, dashboardUrl } = params;
  const c = overview.cards;
  const elements: CardElement[] = [];

  const text = (value: string, extra: CardElement = {}): CardElement => ({
    type: "TextBlock",
    text: value,
    wrap: true,
    ...extra,
  });

  elements.push(text(digestAsOf(now), { isSubtle: true, spacing: "None", size: "Small" }));

  if (c.devicesTotal === 0) {
    elements.push(
      text(
        "⚠️ **No devices are being monitored.** This is an empty state, not an all-clear — nothing below reflects the real network until the UniFi poll runs.",
        { color: "Attention" },
      ),
    );
  }

  // FactSet rather than a TextBlock per line: it is the Adaptive Card element
  // built for label/value pairs, and it aligns the values without padding.
  // Live figures first, windowed figures after — the ordering says which is
  // which before anyone reads the labels.
  elements.push(text("Right now", { weight: "Bolder", separator: true }), {
    type: "FactSet",
    facts: [
      {
        title: "Devices up",
        value: `${c.devicesTotal - c.devicesOffline - c.devicesUnknown} of ${c.devicesTotal}`,
      },
      { title: "Devices offline", value: String(c.devicesOffline) },
      { title: "Unverifiable", value: String(c.devicesUnknown) },
      { title: "Open tickets", value: String(c.openTickets) },
      { title: "Escalated", value: String(c.escalated) },
      { title: "Properties with issues", value: String(c.propertiesWithIssues) },
    ],
  });

  elements.push(text(rangeLabel, { weight: "Bolder", separator: true }), {
    type: "FactSet",
    facts: [
      { title: "Resolved", value: String(c.resolvedInRange) },
      {
        title: "Avg resolution",
        value: c.avgResolutionMin === null ? "—" : `${c.avgResolutionMin} min`,
      },
    ],
  });

  if (c.devicesUnknown > 0) {
    elements.push(
      text(
        `⚠️ ${c.devicesUnknown} device${c.devicesUnknown === 1 ? "" : "s"} could not be verified — their console is unreachable, so they are not confirmed up.`,
        { color: "Warning" },
      ),
    );
  }

  elements.push(...digestTableCard(overview, rangeLabel));

  const oldest = oldestOpenLines(overview);
  if (overview.openTicketList.length === 0) {
    elements.push(text(oldest[0]!, { isSubtle: true }));
  } else {
    elements.push(text("Oldest open", { weight: "Bolder", separator: true }));
    // Skip the "Oldest open" heading the text version carries inline.
    for (const line of oldest.slice(1)) elements.push(text(line));
  }

  elements.push(text(`[Dashboard](${dashboardUrl})`, { separator: true }));

  return elements;
}
