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

const TABLE_HEADER = ["Site", "Dev", "Off", "Unk", "Open", "Fixed"] as const;

/**
 * One table row's cells, shared by the card and the text renderings so the two
 * can never disagree about a number.
 */
function tableRows(overview: NetworkOverview): string[][] {
  return overview.properties.map((p) => [
    p.shortCode,
    // A property with zero devices is a COVERAGE GAP, not a healthy one. Say so
    // rather than printing a bare 0 that reads like "nothing wrong here".
    p.total === 0 ? "none" : String(p.total),
    p.total === 0 ? "—" : String(p.offline),
    p.total === 0 ? "—" : String(p.unknown),
    String(p.open),
    String(p.resolved),
  ]);
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
  const header = [...TABLE_HEADER];
  const rows = tableRows(overview);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();

  return [
    tableCaption(rangeLabel),
    line(header),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map(line),
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

  return [
    { type: "TextBlock", text: tableCaption(rangeLabel), weight: "Bolder", wrap: true },
    {
      type: "ColumnSet",
      columns: TABLE_HEADER.map((heading, col) => ({
        type: "Column",
        // The site name needs room to breathe; the numeric columns should stay
        // tight so the eye can compare down them.
        width: col === 0 ? "auto" : "stretch",
        items: [
          { type: "TextBlock", text: heading, weight: "Bolder", wrap: false },
          ...rows.map((r) => ({ type: "TextBlock", text: r[col]!, wrap: false })),
        ],
      })),
    },
  ];
}

export function buildDailyDigest(params: DigestParams): string {
  const { overview, rangeLabel, dashboardUrl } = params;
  const c = overview.cards;

  const lines: string[] = [];

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
    `Open tickets: ${c.openTickets}`,
    `Escalated: ${c.escalated}`,
    `Devices offline: ${c.devicesOffline}`,
    `Unverifiable (console unreachable): ${c.devicesUnknown}`,
    `Properties with issues: ${c.propertiesWithIssues}`,
    `Resolved · ${rangeLabel}: ${c.resolvedInRange}`,
    `Avg resolution · ${rangeLabel}: ${
      c.avgResolutionMin === null ? "—" : `${c.avgResolutionMin} min`
    }`,
    `Devices monitored: ${c.devicesTotal}`,
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
  const { overview, rangeLabel, dashboardUrl } = params;
  const c = overview.cards;
  const elements: CardElement[] = [];

  const text = (value: string, extra: CardElement = {}): CardElement => ({
    type: "TextBlock",
    text: value,
    wrap: true,
    ...extra,
  });

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
  elements.push(text("Overview", { weight: "Bolder" }), {
    type: "FactSet",
    facts: [
      { title: "Open tickets", value: String(c.openTickets) },
      { title: "Escalated", value: String(c.escalated) },
      { title: "Devices offline", value: String(c.devicesOffline) },
      { title: "Unverifiable", value: String(c.devicesUnknown) },
      { title: "Properties with issues", value: String(c.propertiesWithIssues) },
      { title: `Resolved · ${rangeLabel}`, value: String(c.resolvedInRange) },
      {
        title: `Avg resolution · ${rangeLabel}`,
        value: c.avgResolutionMin === null ? "—" : `${c.avgResolutionMin} min`,
      },
      { title: "Devices monitored", value: String(c.devicesTotal) },
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
