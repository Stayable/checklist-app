import { formatDateInET } from "../datetime";
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
 * Fixed-width property table. Space-padded rather than markdown pipes: the
 * Adaptive Card renders a plain TextBlock, where a markdown table degrades into
 * unaligned pipe soup. Padding survives because Teams renders card text in a
 * proportional font but keeps the columns close enough to scan — and the numbers
 * are short.
 */
function propertyTable(overview: NetworkOverview, rangeLabel: string): string[] {
  const header = ["Site", "Dev", "Off", "Unk", "Open", "Fixed"];
  const rows = overview.properties.map((p) => [
    p.shortCode,
    // A property with zero devices is a COVERAGE GAP, not a healthy one. Say so
    // rather than printing a bare 0 that reads like "nothing wrong here".
    p.total === 0 ? "none" : String(p.total),
    p.total === 0 ? "—" : String(p.offline),
    p.total === 0 ? "—" : String(p.unknown),
    String(p.open),
    String(p.resolved),
  ]);

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i]!)).join("  ").trimEnd();

  return [
    `Status by property (Fixed = ${rangeLabel.toLowerCase()})`,
    line(header),
    line(widths.map((w) => "-".repeat(w))),
    ...rows.map(line),
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

  lines.push(...propertyTable(overview, rangeLabel), "");

  // Name the oldest open tickets. The counts say how bad it is; these say what
  // to do next, which is the only reason to read a digest at 9 AM.
  const oldest = overview.openTicketList.slice(0, 5);
  if (oldest.length > 0) {
    lines.push("Oldest open");
    for (const t of oldest) {
      lines.push(
        `${t.ticketNumber} · ${t.propertyShortCode} · ${t.deviceName ?? "property-wide"} · since ${formatDateInET(t.openedAt, "d MMM HH:mm")} ET`,
      );
    }
    if (overview.openTicketList.length > oldest.length) {
      lines.push(`…and ${overview.openTicketList.length - oldest.length} more open.`);
    }
    lines.push("");
  } else {
    lines.push("No open tickets.", "");
  }

  lines.push(`[Dashboard] → ${dashboardUrl}`);

  return lines.join("\n");
}
