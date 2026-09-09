import { InstanceStatus } from "@prisma/client";
import { formatDateInET, etYMD } from "./datetime";
import type { CardElement } from "./network/teams-webhook";

// The 9 AM ET daily CHECKLIST digest body (Kyle 2026-09-09; restructured twice
// on 2026-09-10).
//
// WHY YESTERDAY *AND* TODAY. The digest lands at 9 AM and checklists are due at
// 6 PM, so at 9 AM today's work has barely started — a report on "today" alone
// would be a column of zeros every morning and would say nothing. Yesterday is
// the only day whose outcome is settled, so that is what gets graded; today is
// reported as LOAD (how much work is on the board), not as performance.
//
// WHY THE COUNTS TABLE IS THE WHOLE DIGEST. Two rounds of feedback, and the
// second reversed the first. Kyle asked to "focus on per property", which was
// read as ADR-010's per-property block — short code, then the misses named by
// template and room, each linking to its instance. That shipped, he saw it in
// Teams, and asked for it simpler: the counts table only. The table IS the
// per-property view. So the named listings, their per-property caps, their
// overflow arithmetic and the note sanitiser are all DELETED rather than left
// switched off — along with the ~1,200-row query that fed them, which is a real
// saving on a Neon instance being cost-tuned. Recover them with `git log -p`
// on this file if the naming is ever wanted again; do not reinstate them from
// memory, and do not add "just one" detail line back without asking.
//
// Pure by construction: it takes already-fetched counts and returns text plus
// Adaptive Card elements. No database, no env, no `new Date()` except through
// the caller-supplied `now`. Same shape as lib/network/digest.ts, and it is why
// the wording and the arithmetic here are unit-testable while the route stays a
// thin shell.
//
// Tone follows ADR-010: terse and factual auto-generation, NOT the empathetic
// prose of the human-typed Teams digest it replaces.

/** One `groupBy(propertyId, status)` bucket, as Prisma returns it. */
export type ChecklistStatusCount = {
  /** `Property.id` (uuid) — the FK, not the 4-digit business `propertyId`. */
  propertyId: string;
  status: InstanceStatus;
  count: number;
};

/** The identity half of a property row. Short codes are canonical (ADR-011). */
export type DigestProperty = {
  id: string;
  shortCode: string;
};

/**
 * Where the digest's two links point.
 *
 * `day` is a DAY filter, not a property filter, and that is a limitation rather
 * than a choice: `/checklists` scopes to a property through the reader's own
 * header picker (a cookie), and takes no property query param. So the link
 * narrows the reader to yesterday and leaves the property where they had it.
 * Do not invent a `?property=` — it would be silently ignored, which is worse
 * than a link that admits what it does.
 */
export type DigestLinks = {
  /** Yesterday's checklists, day-filtered. */
  day: string;
  /** The manager review queue. */
  reviewQueue: string;
};

export type ChecklistDigestInput = {
  /** Active properties. Ones absent here never appear, even if counts mention them. */
  properties: DigestProperty[];
  /** Exact per-status counts for instances scheduled YESTERDAY (ET). */
  yesterday: ChecklistStatusCount[];
  /** Exact per-status counts for instances scheduled TODAY (ET). */
  today: ChecklistStatusCount[];
  /** Reading instant. Everything user-facing is rendered from this, in ET. */
  now: Date;
  links: DigestLinks;
  /**
   * A warning rendered ABOVE everything else, in both the card and the text.
   *
   * Exists for exactly one caller: the `--sample` mode of
   * scripts/send-checklist-digest-test.ts, which posts invented numbers to the
   * test channel. A Teams post full of fabricated figures that looks real is a
   * genuine hazard — somebody screenshots it, or acts on it — so the disclaimer
   * has to be the first thing rendered, not a footnote. Leave it undefined for
   * a real digest.
   */
  banner?: string;
};

// ── ET day boundaries ───────────────────────────────────────────────────────

/**
 * Calendar day before `ymd`, as `yyyy-MM-dd`.
 *
 * Mirrors `nextYMD` in lib/datetime.ts and is deliberately DST-agnostic: it
 * steps the calendar date, never a 24-hour duration. Subtracting 86_400_000 ms
 * from an instant is wrong twice a year — on 1 Nov the ET day is 25 hours long,
 * so "now minus 24h" is still today and the digest would grade the wrong day.
 */
export function previousYMD(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * The two ET calendar days this digest covers, derived from the reading instant.
 *
 * Exported because the cron route needs the same two days to build its query,
 * and deriving them twice is how the card and the data drift apart.
 */
export function checklistDigestDays(now: Date): { todayYMD: string; yesterdayYMD: string } {
  const todayYMD = etYMD(now);
  return { todayYMD, yesterdayYMD: previousYMD(todayYMD) };
}

/**
 * UTC-midnight `Date` for an ET calendar day, for matching a Prisma `@db.Date`
 * column (`ChecklistInstance.scheduledFor`).
 *
 * A `@db.Date` has no time and no zone — Prisma reads and writes it as UTC
 * midnight — so the filter value must be UTC midnight too. Converting the ET day
 * to an instant first (`etDayStartUtc`) would produce 04:00/05:00Z and match
 * nothing. See the `formatDateOnly` warning in lib/datetime.ts for the display
 * side of the same trap.
 */
export function dateOnlyUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

// ── Classification ──────────────────────────────────────────────────────────

/** Which digest bucket a status falls in. */
type Bucket = "completed" | "flagged" | "missed" | "voided";

/**
 * Status → bucket, as an EXHAUSTIVE switch rather than a set of `Set`s.
 *
 * The project rule is that `in:`/`notIn:` lists silently mis-handle a new enum
 * member. A membership test here has the same defect one layer up: a status
 * added to `InstanceStatus` would fall through every set and vanish from the
 * digest with a clean typecheck, so the totals would quietly stop summing to the
 * number of instances. The `never` assignment below turns that into a compile
 * error instead, which is the only way this stays correct without anyone
 * remembering to come back here.
 *
 * FLAGGED is NOT completed, matching `lib/reports.ts`: the work was submitted
 * but a manager rejected it, so it still owes a redo. It gets its own bucket
 * because Kyle asked for flagged as its own line, not because it is done.
 *
 * REVIEWED is `completed`, and the `Reviewed` COLUMN counts it a second time as
 * a subset — see `Tallied.reviewed`. Kept in `completed` deliberately:
 * `lib/reports.ts` defines DONE as SUBMITTED + REVIEWED, and a digest that
 * graded a property differently from the reports screen would be the more
 * confusing of the two errors.
 *
 * INVALIDATED is `voided` and is excluded from the denominator — a stayover or
 * a duplicate is work that ceased to exist, and grading a property down for it
 * would punish correct behaviour.
 *
 * EXPIRED is `missed`, not voided. It is the system's own record of a checklist
 * that ran out of day unfilled, which is exactly what "not completed" means.
 */
function bucketOf(status: InstanceStatus): Bucket {
  switch (status) {
    case InstanceStatus.SUBMITTED:
    case InstanceStatus.REVIEWED:
      return "completed";
    case InstanceStatus.FLAGGED:
      return "flagged";
    case InstanceStatus.SCHEDULED:
    case InstanceStatus.ASSIGNED:
    case InstanceStatus.IN_PROGRESS:
    case InstanceStatus.EXPIRED:
      return "missed";
    case InstanceStatus.INVALIDATED:
      return "voided";
    default: {
      const unhandled: never = status;
      throw new Error(`unhandled InstanceStatus in checklist digest: ${String(unhandled)}`);
    }
  }
}

// ── Model ───────────────────────────────────────────────────────────────────

export type PropertyDigest = {
  shortCode: string;
  /** Yesterday, submitted or reviewed. */
  completed: number;
  /**
   * Yesterday, signed off by a manager. A SUBSET of `completed`, never an
   * addition to it — every reviewed instance is also counted in `completed`.
   */
  reviewed: number;
  /** Yesterday, flagged by a manager — submitted but owed a redo. */
  flagged: number;
  /** Yesterday, never finished: still open, or expired. */
  missed: number;
  /** Yesterday, invalidated (stayover, duplicate, not needed). Not graded. */
  voided: number;
  /** Today's load — every non-invalidated instance scheduled for today. */
  today: number;
  /** completed + flagged + missed. The graded denominator. */
  expected: number;
  /** True when this property had nothing yesterday and nothing today. */
  silent: boolean;
};

export type ChecklistDigestModel = {
  todayYMD: string;
  yesterdayYMD: string;
  /** Properties with something to report, worst first. */
  rows: PropertyDigest[];
  /** Short codes of properties with nothing at all. Named, never dropped. */
  silentShortCodes: string[];
  totals: {
    completed: number;
    reviewed: number;
    flagged: number;
    missed: number;
    voided: number;
    today: number;
    expected: number;
  };
  /** completed / expected, whole percent. null when nothing was due. */
  completionPct: number | null;
  /** True when the whole portfolio had zero instances on both days. */
  portfolioEmpty: boolean;
};

/** Bucket counts for one property on one day, plus the reviewed sub-count. */
type Tallied = Record<Bucket, number> & { reviewed: number };

const emptyTally = (): Tallied => ({
  completed: 0,
  flagged: 0,
  missed: 0,
  voided: 0,
  reviewed: 0,
});

function tally(counts: ChecklistStatusCount[]): Map<string, Tallied> {
  const out = new Map<string, Tallied>();
  for (const c of counts) {
    let row = out.get(c.propertyId);
    if (!row) {
      row = emptyTally();
      out.set(c.propertyId, row);
    }
    row[bucketOf(c.status)] += c.count;
    // Counted a SECOND time, on purpose. `reviewed` is a lens on `completed`,
    // not a sibling bucket — see the Reviewed column's legend.
    if (c.status === InstanceStatus.REVIEWED) row.reviewed += c.count;
  }
  return out;
}

/**
 * Worst-first ordering. The properties list is alphabetical by short code, which
 * is right for a settings page; a 9 AM digest is skimmed, so the rows that need
 * someone to do something go on top.
 *
 * The third key is the one worth explaining: a property with NOTHING due
 * yesterday sorts above one that was measured and came back clean. It is not a
 * problem, but it is an unknown, and an unknown outranks a confirmed pass — the
 * same judgement the network digest makes about an unmonitored fleet.
 */
function rank(a: PropertyDigest, b: PropertyDigest): number {
  if (a.missed !== b.missed) return b.missed - a.missed;
  if (a.flagged !== b.flagged) return b.flagged - a.flagged;
  const unmeasured = (r: PropertyDigest) => (r.expected === 0 ? 0 : 1);
  if (unmeasured(a) !== unmeasured(b)) return unmeasured(a) - unmeasured(b);
  if (a.today !== b.today) return b.today - a.today;
  return a.shortCode.localeCompare(b.shortCode);
}

export function buildChecklistDigestModel(input: ChecklistDigestInput): ChecklistDigestModel {
  const { todayYMD, yesterdayYMD } = checklistDigestDays(input.now);
  const y = tally(input.yesterday);
  const t = tally(input.today);

  const all: PropertyDigest[] = input.properties.map((p) => {
    const yr = y.get(p.id) ?? emptyTally();
    const tr = t.get(p.id) ?? emptyTally();
    // Today's load excludes `voided` for the same reason yesterday's denominator
    // does: an invalidated instance is not work anyone has to do.
    const today = tr.completed + tr.flagged + tr.missed;
    const expected = yr.completed + yr.flagged + yr.missed;
    return {
      shortCode: p.shortCode,
      completed: yr.completed,
      reviewed: yr.reviewed,
      flagged: yr.flagged,
      missed: yr.missed,
      voided: yr.voided,
      today,
      expected,
      silent: expected === 0 && today === 0 && yr.voided === 0,
    };
  });

  // A property with nothing to report gets NO row — eight rows of zeros every
  // morning is how a digest teaches people to stop reading it. But it is still
  // NAMED, on one subtle line, because a silently absent property is
  // indistinguishable from a property that fell out of the query or lost its
  // rules. "Nothing scheduled" is a fact worth one line; it is not an all-clear.
  const rows = all.filter((r) => !r.silent).sort(rank);
  const silentShortCodes = all
    .filter((r) => r.silent)
    .map((r) => r.shortCode)
    .sort();

  const sum = (pick: (r: PropertyDigest) => number) => all.reduce((n, r) => n + pick(r), 0);
  const totals = {
    completed: sum((r) => r.completed),
    reviewed: sum((r) => r.reviewed),
    flagged: sum((r) => r.flagged),
    missed: sum((r) => r.missed),
    voided: sum((r) => r.voided),
    today: sum((r) => r.today),
    expected: sum((r) => r.expected),
  };

  return {
    todayYMD,
    yesterdayYMD,
    rows,
    silentShortCodes,
    totals,
    completionPct:
      totals.expected === 0 ? null : Math.round((totals.completed / totals.expected) * 100),
    portfolioEmpty: rows.length === 0,
  };
}

// ── Shared wording ──────────────────────────────────────────────────────────

export function checklistDigestTitle(now: Date): string {
  return `Checklists — daily digest ${formatDateInET(now, "EEE d MMM yyyy")}`;
}

/**
 * A ymd rendered as an instant safe to format in ET.
 *
 * Noon UTC, not midnight: midnight UTC is 7/8 PM the PREVIOUS day in Eastern, so
 * formatting it through `formatDateInET` would print every date one day early —
 * the exact bug `formatDateOnly` exists to prevent for `@db.Date` columns. Noon
 * is the same ET calendar day under both EDT and EST.
 */
function dateOnlyUtcNoon(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

/**
 * Says which day each half of the digest is about, before any number.
 *
 * Without it "Done 12/13" is ambiguous at a glance between last night and this
 * morning, and the two demand opposite reactions — one is a result, the other is
 * a workload.
 */
function asOfLine(model: ChecklistDigestModel, now: Date): string {
  return (
    `Yesterday ${formatDateInET(dateOnlyUtcNoon(model.yesterdayYMD), "EEE d MMM")}` +
    ` · today ${formatDateInET(dateOnlyUtcNoon(model.todayYMD), "EEE d MMM")}` +
    ` · sent ${formatDateInET(now, "h:mm a")} ET`
  );
}

const EMPTY_PORTFOLIO_WARNING =
  "No checklists were scheduled yesterday and none are scheduled today. " +
  "This is an empty state, not an all-clear — with no recurring rules the 5 AM " +
  "generator produces nothing, so there is nothing here to complete.";

/**
 * The one thing about this table that is not self-evident, said once, under it.
 *
 * `Reviewed` counts instances a manager has signed off, and every one of them is
 * ALSO inside `Done` — so `Done 12 · Reviewed 3` describes twelve finished
 * checklists of which three are signed off, never fifteen events. Without this
 * line the two columns read as additive, which is a wrong number a PM would act
 * on. Placed after the table rather than in the header because a six-column
 * header has no room for it and truncating it would defeat the point.
 */
const TABLE_LEGEND =
  "Done = submitted or reviewed, out of what was due · Reviewed is the part of Done a manager signed off (a subset, not an addition) · Missed = never finished";

/**
 * Per-property glyph. The eye finds the red rows before it reads a number.
 *
 * ⚫ means "nothing was due yesterday" and ranks as a caveat, not as health: a
 * property that was never measured must never render the same as one that was
 * measured and passed. Same rule the network digest applies to an unmonitored
 * fleet.
 */
function glyph(r: PropertyDigest): string {
  if (r.missed > 0) return "🔴";
  if (r.flagged > 0) return "🟡";
  if (r.expected > 0) return "🟢";
  return "⚫";
}

const GLYPHS = ["⚫", "🔴", "🟡", "🟢"];

/**
 * Printable width. `[...s].length` counts an emoji as one code point but a
 * monospace renderer gives it two columns, so padding by code points leaves
 * every glyph row one column short and the text table drifts. Only these four
 * glyphs occur, so they are listed rather than guessed at by Unicode range.
 */
function displayWidth(s: string): number {
  let extra = 0;
  for (const g of GLYPHS) if (s.includes(g)) extra += 1;
  return [...s].length + extra;
}

function padTo(s: string, width: number): string {
  return s + " ".repeat(Math.max(0, width - displayWidth(s)));
}

/** Column order is Kyle's (2026-09-10). `Rev'd` is short only to fit the width. */
const HEADER = ["Site", "Done", "Flag", "Missed", "Today", "Rev'd"] as const;

function cellsFor(r: PropertyDigest): string[] {
  return [
    // Glyph and code are ONE cell, never two columns. As separate columns they
    // drift vertically — an emoji TextBlock renders taller than a text one, so
    // the two stacks accumulate different heights and the dot stops lining up
    // with its property (learned the hard way on the network digest, 2026-08-01).
    `${glyph(r)} ${r.shortCode}`,
    // "12/14", not a bare 12: one column answers both "how many landed" and
    // "out of how many were owed" without spending a second column on it.
    r.expected === 0 ? "—" : `${r.completed}/${r.expected}`,
    r.expected === 0 ? "—" : String(r.flagged),
    r.expected === 0 ? "—" : String(r.missed),
    String(r.today),
    // Dash, not 0, when nothing was due — "0 reviewed" would read as a backlog
    // when in fact there was nothing to review.
    r.expected === 0 ? "—" : String(r.reviewed),
  ];
}

/**
 * The one portfolio figure, and it sits at the BOTTOM.
 *
 * Kyle's objection was to a summary on top, not to a total existing — a total
 * read first framed the digest as a scorecard. One line under the table answers
 * "how bad overall" for anyone who wants it and costs nothing to skip. There is
 * deliberately no "All" row inside the table: two renderings of one number is
 * how they start to disagree.
 */
function totalsLine(model: ChecklistDigestModel): string {
  const t = model.totals;
  const pct = model.completionPct === null ? "—" : `${model.completionPct}%`;
  return (
    `All properties — done ${t.expected === 0 ? "—" : `${t.completed}/${t.expected}`} (${pct})` +
    ` · reviewed ${t.reviewed} · flagged ${t.flagged} · missed ${t.missed} · today ${t.today}` +
    // Only when it happened. A permanent "invalidated 0" is noise in a message
    // meant to be skimmed in five seconds.
    (t.voided > 0 ? ` · invalidated ${t.voided} (not graded)` : "")
  );
}

function silentLine(model: ChecklistDigestModel): string | null {
  if (model.silentShortCodes.length === 0) return null;
  return `Nothing scheduled either day: ${model.silentShortCodes.join(", ")}`;
}

/**
 * Names the properties whose instances were invalidated, when any were.
 *
 * One line for the whole digest, not a per-property detail line. It earns its
 * place because a property whose ONLY activity yesterday was six stayovers
 * renders as a row of dashes — visibly present and unaccountably blank, which
 * reads as a bug. The counts do not belong in the table: they are not graded,
 * and a seventh column empty on almost every row would cost width on every row
 * to serve the rare one.
 */
function voidedLine(model: ChecklistDigestModel): string | null {
  const named = model.rows.filter((r) => r.voided > 0);
  if (named.length === 0) return null;
  const parts = named.map((r) => `${r.shortCode} ${r.voided}`).join(", ");
  return `Invalidated yesterday, not graded (stayover / duplicate / not needed): ${parts}`;
}

// ── Plain text ──────────────────────────────────────────────────────────────

/**
 * Space-padded table, for the `text` fallback field and the NotificationLog
 * body.
 *
 * ⚠ NEVER feed this padding to a card TextBlock. An Adaptive Card TextBlock
 * renders markdown-ish rich text and COLLAPSES runs of spaces — a padded table
 * posted through the card arrives with every column squashed together (verified
 * live on the network digest, 2026-08-01). The card uses ColumnSets instead.
 */
function tableText(model: ChecklistDigestModel): string[] {
  if (model.rows.length === 0) return ["No property had anything scheduled."];

  const header = [...HEADER];
  const rows = model.rows.map(cellsFor);
  const widths = header.map((_, i) =>
    Math.max(...[header, ...rows].map((r) => displayWidth(r[i] ?? ""))),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => padTo(cell, widths[i]!)).join("  ").trimEnd();

  return [
    line(header),
    line(header.map((_, i) => "-".repeat(widths[i]!))),
    ...rows.map(line),
  ];
}

export function buildChecklistDigestText(
  model: ChecklistDigestModel,
  input: Pick<ChecklistDigestInput, "now" | "links" | "banner">,
): string {
  const lines: string[] = [];

  if (input.banner) lines.push(input.banner, "");
  lines.push(asOfLine(model, input.now), "");

  if (model.portfolioEmpty) {
    lines.push(`⚠️ ${EMPTY_PORTFOLIO_WARNING}`, "");
  }

  lines.push(...tableText(model));
  if (model.rows.length > 0) lines.push("", TABLE_LEGEND);

  const voided = voidedLine(model);
  if (voided) lines.push("", voided);
  const silent = silentLine(model);
  if (silent) lines.push("", silent);

  lines.push("", totalsLine(model));
  lines.push(
    "",
    `[Yesterday's checklists] → ${input.links.day}`,
    `[Review queue] → ${input.links.reviewQueue}`,
  );

  return lines.join("\n");
}

// ── Adaptive Card ───────────────────────────────────────────────────────────

/**
 * Relative column widths as Adaptive Card weights.
 *
 * FIXED weights, never "auto": with row-major rendering each row is its own
 * ColumnSet and `auto` sizes every row from its own content, so "12/14" and "0"
 * would land on different boundaries and the table would read ragged. Identical
 * weights on every row are the whole alignment guarantee. Site is widest because
 * it carries the glyph as well as the code; the single-digit columns are
 * narrowest so six of them still fit a phone.
 */
function columnWeight(heading: string): string {
  if (heading === "Site") return "30";
  if (heading === "Done") return "20";
  if (heading === "Missed") return "18";
  if (heading === "Rev'd") return "17";
  return "15";
}

function rowCard(cells: string[], opts: { head?: boolean } = {}): CardElement {
  return {
    type: "ColumnSet",
    separator: true,
    spacing: "Small",
    columns: HEADER.map((heading, col) => ({
      type: "Column",
      width: columnWeight(heading),
      items: [
        {
          type: "TextBlock",
          text: cells[col] ?? "",
          wrap: false,
          ...(opts.head === true ? { isSubtle: true, weight: "Bolder" } : {}),
          ...(opts.head === true ? {} : cellTone(heading, cells[col] ?? "")),
        },
      ],
    })),
  };
}

/**
 * Emphasis for one cell. Only ever tints a number that represents a problem — a
 * green wash on the healthy rows would colour nearly everything and make the
 * card harder to scan, not easier. `Rev'd` is never tinted: a low review count
 * at 9 AM means the manager has not started yet, which is not a fault.
 */
function cellTone(heading: string, value: string): CardElement {
  const n = Number.parseInt(value, 10);
  const positive = Number.isFinite(n) && n > 0;
  if (heading === "Missed" && positive) return { color: "Attention", weight: "Bolder" };
  if (heading === "Flag" && positive) return { color: "Warning", weight: "Bolder" };
  return {};
}

export function buildChecklistDigestCard(
  model: ChecklistDigestModel,
  input: Pick<ChecklistDigestInput, "now" | "links" | "banner">,
): CardElement[] {
  const text = (value: string, extra: CardElement = {}): CardElement => ({
    type: "TextBlock",
    text: value,
    wrap: true,
    ...extra,
  });

  const elements: CardElement[] = [];

  // First element, before even the date stamp. A disclaimer below the numbers is
  // a disclaimer nobody reads.
  if (input.banner) {
    elements.push(text(input.banner, { color: "Attention", weight: "Bolder", wrap: true }));
  }

  elements.push(text(asOfLine(model, input.now), { isSubtle: true, spacing: "None", size: "Small" }));

  if (model.portfolioEmpty) {
    elements.push(text(`⚠️ **${EMPTY_PORTFOLIO_WARNING}**`, { color: "Attention" }));
  }

  if (model.rows.length === 0) {
    elements.push(text("_No property had anything scheduled._", { isSubtle: true }));
  } else {
    elements.push(rowCard([...HEADER], { head: true }));
    for (const row of model.rows) elements.push(rowCard(cellsFor(row)));
    elements.push(text(TABLE_LEGEND, { isSubtle: true, size: "Small", spacing: "Small" }));
  }

  const voided = voidedLine(model);
  if (voided) elements.push(text(voided, { isSubtle: true, size: "Small" }));
  const silent = silentLine(model);
  if (silent) elements.push(text(silent, { isSubtle: true, size: "Small" }));

  elements.push(text(totalsLine(model), { separator: true, weight: "Bolder" }));
  elements.push(
    text(`[Yesterday's checklists](${input.links.day}) · [Review queue](${input.links.reviewQueue})`, {
      spacing: "Small",
    }),
  );

  return elements;
}

/** Model + both renderings in one call, so a caller cannot build only one. */
export function buildChecklistDigest(input: ChecklistDigestInput): {
  model: ChecklistDigestModel;
  title: string;
  text: string;
  card: CardElement[];
} {
  const model = buildChecklistDigestModel(input);
  return {
    model,
    title: checklistDigestTitle(input.now),
    text: buildChecklistDigestText(model, input),
    card: buildChecklistDigestCard(model, input),
  };
}
