import { NextResponse } from "next/server";
import { NotificationChannel, NotificationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/app-url";
import { etYMD, formatDateInET, formatInET } from "@/lib/datetime";
import {
  deliverNotificationEmail,
  logNotification,
  type NotifyRecipient,
} from "@/lib/notify.server";
import { postTeamsCard, type CardElement } from "@/lib/network/teams-webhook";
import { resolveChecklistWebhook } from "@/lib/checklist-teams";
import {
  REMINDABLE_STATUSES,
  reminderWindow,
  selectReminders,
  type ReminderKind,
} from "@/lib/checklist-reminders";
import type { NotifyEvent } from "@/lib/notify-copy";
import {
  checklistNotificationsEnabled,
  DISABLED_RESPONSE,
} from "@/lib/checklist-notifications-enabled";

// ADR-037 due-time reminders — the DELIVERY half. Runs every 15 minutes
// (`*/15 * * * *` in vercel.json).
//
// Kyle 2026-09-09: "Reminders before the Required time (1 hour before) and on
// the deadline", to the PM group chat on Teams AND to the person who has to do
// the checklist.
//
// WHY EVERY 15 MINUTES AND NOT AN HOURLY ET-GATED JOB like network-digest. That
// job posts at one wall-clock hour, so it needs `isEtHour` to survive the UTC
// cron's twice-yearly drift. A reminder is anchored to each checklist's own
// `dueAt`, not to a wall-clock hour, so there is nothing for DST to move: the
// windows in lib/checklist-reminders.ts are absolute-instant arithmetic. The
// only thing the interval buys is resolution — a "1 hour before" warning is
// really "between 45 and 60 minutes before", which is the honest claim.
//
// THE SELECTION RULES LIVE IN lib/checklist-reminders.ts, not here. The SQL
// below narrows to the same time band so we don't load the portfolio, but it is
// a NARROWING ONLY — `selectReminders` decides. Splitting it that way is what
// makes the rules unit-testable without a database.
//
// Auth mirrors the other cron routes: Vercel injects
// `Authorization: Bearer ${CRON_SECRET}`; fail-closed in production when the
// secret is unset, dev-open otherwise.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEAMS_EVENT = "checklist_due_digest";
const TEAMS_TARGET = "CHECKLIST_MAIN";

/**
 * Ceiling on rows examined in one tick.
 *
 * The 12h backlog cutoff already stops a first-deploy blast, but a genuine bad
 * morning (a whole property's rules firing with deadlines nobody met) could
 * still put hundreds of rows in the band, and each one costs a transaction, an
 * email and an update inside a 60s function. Overflow is not lost — it is
 * simply picked up on the next tick 15 minutes later, because nothing is
 * stamped until it is sent. Ordered by `dueAt` ascending so the most urgent
 * work drains first.
 */
const MAX_INSTANCES_PER_RUN = 150;

/**
 * Lines per section on the Teams card before it collapses to "+N more".
 *
 * A card is read on a phone in a group chat. Past roughly twenty rows nobody
 * reads any of them, and the useful signal becomes the count plus the link.
 */
const MAX_CARD_LINES_PER_SECTION = 20;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production"; // dev-only convenience
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadCandidates(now: Date) {
  const { backlogFloor, soonHorizon } = reminderWindow(now);
  return db.checklistInstance.findMany({
    where: {
      // EXPLICIT allow-list, never `notIn`. Prisma `in:` lists silently EXCLUDE
      // a new enum value while `notIn:` lists silently INCLUDE it — pinned by a
      // test in this repo. With `notIn` a future InstanceStatus would start
      // emailing staff with a clean typecheck; with `in` it goes quiet until
      // someone adds it to REMINDABLE_STATUSES on purpose.
      status: { in: [...REMINDABLE_STATUSES] },
      // Also excludes `dueAt IS NULL`, which is the intended behaviour: no
      // deadline, no reminder. Hits @@index([status, dueAt]).
      dueAt: { gte: backlogFloor, lte: soonHorizon },
      // Cheap pre-filter for rows that already had BOTH reminders. The real
      // per-kind decision is selectReminders'.
      OR: [{ remindedBeforeAt: null }, { remindedDueAt: null }],
    },
    orderBy: { dueAt: "asc" },
    take: MAX_INSTANCES_PER_RUN,
    select: {
      id: true,
      title: true,
      systemId: true,
      dueAt: true,
      status: true,
      remindedBeforeAt: true,
      remindedDueAt: true,
      roomLabel: true,
      property: { select: { shortCode: true } },
      room: { select: { roomNumber: true } },
      assignedUser: {
        select: { id: true, email: true, name: true, locale: true, active: true },
      },
    },
  });
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

/** A candidate paired with the reminder it earned. */
type Pending = { row: Candidate; kind: ReminderKind };

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

/**
 * What a human calls this checklist.
 *
 * `title` is the composed ADR-009 display name ("Arrival LL 312 090926") and is
 * what every other surface shows, so a reminder must agree with it. The
 * fallbacks matter: a row generated before titles, or one whose title was never
 * set, must still name itself rather than arriving as an empty subject line.
 */
function checklistLabel(row: Candidate): string {
  const title = row.title?.trim();
  if (title) return title;
  if (row.systemId) return row.systemId;
  const scope = row.room?.roomNumber ?? row.roomLabel?.trim();
  return `${row.property.shortCode} checklist${scope ? ` ${scope}` : ""}`;
}

/**
 * The deadline as ET wall-clock, for the email's `note` field.
 *
 * `formatInET` appends the "ET" suffix itself, per ADR-013 — every user-facing
 * time in this app carries it regardless of the reader's own timezone, and the
 * offshore reviewers are the reason that is not optional.
 */
function dueTextForEmail(dueAt: Date): string {
  return formatInET(dueAt, "EEE d MMM, h:mm a");
}

/**
 * The deadline for a card cell. Time only, because the column header says ET
 * and repeating the suffix twenty times costs width for nothing — except when
 * the deadline fell on a different ET day than the run, where a bare "11:00 PM"
 * would read as tonight. An overdue item from yesterday is exactly the case
 * this reminder exists for, so it must not be ambiguous.
 */
function dueCell(dueAt: Date, now: Date): string {
  const sameDay = etYMD(dueAt) === etYMD(now);
  return sameDay
    ? formatDateInET(dueAt, "h:mm a")
    : formatDateInET(dueAt, "d MMM h:mm a");
}

const EVENT_FOR_KIND: Record<ReminderKind, NotifyEvent> = {
  due_soon: "checklist_due_soon",
  due_now: "checklist_due_now",
};

// ---------------------------------------------------------------------------
// Teams card
// ---------------------------------------------------------------------------

/** Fixed weights so every row's columns line up. See lib/network/digest.ts. */
const CARD_COLUMN_WEIGHTS = ["24", "54", "22"];

function cardRow(cells: string[], head = false): CardElement {
  return {
    type: "ColumnSet",
    spacing: "Small",
    columns: CARD_COLUMN_WEIGHTS.map((width, i) => ({
      type: "Column",
      width,
      items: [
        {
          type: "TextBlock",
          text: cells[i] ?? "",
          wrap: true,
          ...(head ? { isSubtle: true, weight: "Bolder" } : {}),
        },
      ],
    })),
  };
}

/**
 * Group by property short code (JN/JW/KE/KW/LL/OR/SA/DP), which is how the PMs
 * read anything — each manager scans for their own two letters first. Sorted by
 * code so a property is always in the same place on the card, then by deadline
 * inside it.
 */
function groupByShortCode(items: readonly Pending[]): [string, Pending[]][] {
  const groups = new Map<string, Pending[]>();
  for (const item of items) {
    const code = item.row.property.shortCode;
    const bucket = groups.get(code);
    if (bucket) bucket.push(item);
    else groups.set(code, [item]);
  }
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => (a.row.dueAt?.getTime() ?? 0) - (b.row.dueAt?.getTime() ?? 0));
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function assigneeCell(row: Candidate): string {
  const name = row.assignedUser?.name?.trim();
  // "Unassigned" is the most actionable line on the card: nobody is going to
  // fill it, so the PM reading this is the only person who can act.
  return name ? name : "Unassigned";
}

/**
 * One section — "due in 1 hour" or "overdue now" — as card elements.
 *
 * The two are kept apart rather than merged into one sorted list because they
 * ask for different things: a warning is "start this", a chase is "this is
 * late". Collapsing them would let a genuinely-late item hide among warnings.
 */
function section(heading: string, items: readonly Pending[], now: Date): CardElement[] {
  if (items.length === 0) return [];
  const elements: CardElement[] = [
    {
      type: "TextBlock",
      text: `${heading} (${items.length})`,
      weight: "Bolder",
      spacing: "Medium",
      separator: true,
      wrap: true,
    },
    cardRow(["Due (ET)", "Checklist", "Assignee"], true),
  ];

  let rendered = 0;
  for (const [code, bucket] of groupByShortCode(items)) {
    if (rendered >= MAX_CARD_LINES_PER_SECTION) break;
    elements.push({
      type: "TextBlock",
      text: `**${code}** · ${bucket.length}`,
      spacing: "Small",
      wrap: true,
    });
    for (const item of bucket) {
      if (rendered >= MAX_CARD_LINES_PER_SECTION) break;
      elements.push(
        cardRow([
          item.row.dueAt ? dueCell(item.row.dueAt, now) : "—",
          checklistLabel(item.row),
          assigneeCell(item.row),
        ]),
      );
      rendered += 1;
    }
  }

  if (rendered < items.length) {
    elements.push({
      type: "TextBlock",
      text: `_+${items.length - rendered} more — open the app for the full list._`,
      isSubtle: true,
      wrap: true,
    });
  }
  return elements;
}

function cardTitle(now: Date): string {
  return `Checklists due — ${formatInET(now, "EEE d MMM h:mm a")}`;
}

function buildCard(dueSoon: readonly Pending[], dueNow: readonly Pending[], now: Date) {
  const elements: CardElement[] = [
    ...section("Due in 1 hour", dueSoon, now),
    ...section("Overdue now", dueNow, now),
    {
      type: "TextBlock",
      text: `[Open checklists](${appUrl("/checklists")})`,
      isSubtle: true,
      spacing: "Medium",
      wrap: true,
    },
  ];

  // Plain-text twin, stored on the NotificationLog row and sent as the `text`
  // fallback. Built from the same helpers, so it cannot disagree with the card.
  const line = (item: Pending) =>
    `  ${item.row.property.shortCode}  ${item.row.dueAt ? dueCell(item.row.dueAt, now) : "—"}  ${checklistLabel(item.row)}  (${assigneeCell(item.row)})`;
  const text = [
    dueSoon.length > 0 ? `Due in 1 hour (${dueSoon.length}):` : null,
    ...dueSoon.map(line),
    dueNow.length > 0 ? `Overdue now (${dueNow.length}):` : null,
    ...dueNow.map(line),
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { elements, text };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

type EmailOutcome = "sent" | "no_recipient" | "failed";

/**
 * Email the person who has to do the checklist.
 *
 * An INACTIVE assignee counts as no recipient. Their mailbox may be gone and
 * they are certainly not doing the work; the Teams card still names the
 * checklist, which is what gets it reassigned.
 */
async function notifyAssignee(
  row: Candidate,
  kind: ReminderKind,
): Promise<EmailOutcome> {
  const user = row.assignedUser;
  if (!user || !user.active) return "no_recipient";
  if (row.dueAt === null) return "no_recipient"; // unreachable; keeps dueAt narrowed

  const recipient: NotifyRecipient = {
    id: user.id,
    email: user.email,
    locale: user.locale,
  };
  const event = EVENT_FOR_KIND[kind];
  const label = checklistLabel(row);
  const note = dueTextForEmail(row.dueAt);

  let emailLogId: string | null = null;
  try {
    emailLogId = await db.$transaction((tx) =>
      logNotification(tx, recipient, event, label, note, {
        type: "checklist_instance",
        id: row.id,
      }),
    );
  } catch (err) {
    console.error("[checklist-reminders] log failed", row.id, err);
    return "failed";
  }

  // Never throws; settles the EMAIL row to SENT / FAILED / SKIPPED itself.
  await deliverNotificationEmail(emailLogId, recipient, event, label, note);

  if (!emailLogId) return "failed";
  let settled: { status: NotificationStatus } | null = null;
  try {
    settled = await db.notificationLog.findUnique({
      where: { id: emailLogId },
      select: { status: true },
    });
  } catch (err) {
    console.error("[checklist-reminders] settle read failed", row.id, err);
    return "failed";
  }

  // SKIPPED means Resend is unconfigured, and that is as delivered as this
  // environment can get. Treating it as a failure would leave the row unstamped
  // and re-attempted every 15 minutes, writing two more NotificationLog rows
  // each time — a log-growth loop in exactly the environment least able to
  // notice it. A real FAILED does retry, bounded: a due_soon retry stops when
  // the deadline passes, a due_now retry when the row ages past the 12h floor.
  if (settled?.status === NotificationStatus.SENT) return "sent";
  if (settled?.status === NotificationStatus.SKIPPED) return "sent";
  return "failed";
}

/**
 * Stamp the instance so it is never reminded twice.
 *
 * Written per instance, immediately after that instance's own send, rather than
 * batched at the end of the run. See the ordering note on `handle`.
 */
async function stamp(row: Candidate, kind: ReminderKind, now: Date): Promise<boolean> {
  try {
    await db.checklistInstance.update({
      where: { id: row.id },
      data: kind === "due_soon" ? { remindedBeforeAt: now } : { remindedDueAt: now },
    });
    return true;
  } catch (err) {
    console.error("[checklist-reminders] stamp failed", row.id, kind, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";

  // Built but NOT activated (Kyle, 2026-09-09 — still in the testing phase).
  // The cron entries are also removed from vercel.json; this is the second
  // layer, so a manual trigger or a restored schedule cannot put a card in
  // front of the Property Managers by accident.
  //
  // `?dry=1` is deliberately EXEMPT: it renders and returns without sending or
  // writing anything, and it is how the thing gets exercised while switched
  // off. Gating it too would leave no way to see the output at all.
  if (!dryRun && !checklistNotificationsEnabled()) {
    return NextResponse.json(DISABLED_RESPONSE);
  }


  const candidates = await loadCandidates(now);
  const selection = selectReminders(candidates, now);
  const dueSoon: Pending[] = selection.dueSoon.map((row) => ({ row, kind: "due_soon" }));
  const dueNow: Pending[] = selection.dueNow.map((row) => ({ row, kind: "due_now" }));
  const pending = [...dueSoon, ...dueNow];

  if (pending.length === 0) {
    // Nothing due. Deliberately silent — a "nothing to report" post every 15
    // minutes would train the PM chat to ignore this card entirely.
    return NextResponse.json({
      ok: true,
      considered: candidates.length,
      dueSoon: 0,
      dueNow: 0,
      sent: 0,
      skipped: candidates.length,
      failed: 0,
    });
  }

  const { elements, text } = buildCard(dueSoon, dueNow, now);
  const title = cardTitle(now);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      considered: candidates.length,
      dueSoon: dueSoon.length,
      dueNow: dueNow.length,
      title,
      text,
      card: elements,
    });
  }

  // ORDERING — Teams first, then per-instance (email → stamp).
  //
  // Nothing is stamped before it is sent, so this is at-least-once: a crash
  // costs a duplicate, never a silent miss. The reverse (stamp then send) would
  // be at-most-once and would swallow a reminder invisibly, which is the worse
  // failure for a deadline. There is no third option without a transactional
  // outbox, and one grouped Teams post cannot be inside a per-row transaction.
  //
  // Teams goes FIRST because it is one post covering every row. If it went last
  // and the function died mid-run, the already-stamped rows would never appear
  // on any card — a silent loss. Going first, a crash after it costs at worst a
  // repeated line on the next card and a repeated email, both visible.
  //
  // The stamp is written per instance rather than batched at the end, so a
  // crash at row 37 re-sends row 37 and nothing before it.
  const destination = resolveChecklistWebhook("main");
  const teamsResult = destination
    ? await postTeamsCard(destination.url, title, elements, text)
    : ({ ok: false, error: "checklist_teams_not_configured" } as const);

  try {
    await db.notificationLog.create({
      data: {
        userId: null,
        channel: NotificationChannel.TEAMS,
        status: teamsResult.ok ? NotificationStatus.SENT : NotificationStatus.FAILED,
        error: teamsResult.ok ? null : teamsResult.error,
        event: TEAMS_EVENT,
        title,
        body: text,
        target: TEAMS_TARGET,
        entityType: "checklist_reminders",
        // entityId is deliberately OMITTED — it is a `@db.Uuid` column and this
        // post covers many instances, so there is no single id to put in it.
        // network-digest 500'd daily for weeks by writing a date string here.
      },
    });
  } catch (err) {
    // A missing log row must not cost the emails below.
    console.error("[checklist-reminders] teams log write failed", err);
  }

  let sent = 0;
  let failed = 0;
  let unassigned = 0;
  let stamped = 0;

  for (const item of pending) {
    let emailOutcome: EmailOutcome;
    try {
      emailOutcome = await notifyAssignee(item.row, item.kind);
    } catch (err) {
      // notifyAssignee already catches its own I/O; this is the belt to that
      // brace, because one bad row must not abort the remaining reminders.
      console.error("[checklist-reminders] notify threw", item.row.id, err);
      emailOutcome = "failed";
    }

    if (emailOutcome === "sent") sent += 1;
    if (emailOutcome === "failed") failed += 1;
    if (emailOutcome === "no_recipient") unassigned += 1;

    // WHICH RAIL OWNS THE STAMP. There are two rails and one column per kind,
    // so one of them has to be the authority.
    //
    //  * Assigned instance → the EMAIL is authoritative. It is that person's
    //    own reminder; the card is a supplementary broadcast. If Teams were
    //    allowed to veto the stamp, a broken webhook would re-email every
    //    assignee every 15 minutes until the deadline aged out.
    //  * Unassigned instance → there is no email, so the CARD is the only rail
    //    and its outcome is the stamp. An unconfigured or failing webhook
    //    leaves the row unstamped and it is reconsidered next tick, which costs
    //    nothing (no send is attempted) and self-heals once Teams works.
    //
    // Consequence, stated rather than hidden: a Teams failure on an ASSIGNED
    // instance loses that line from the chat permanently — the row is stamped
    // by its email and will not reappear on a later card. The FAILED
    // NotificationLog row above is where that shows up.
    const owningRailDelivered =
      emailOutcome === "no_recipient" ? teamsResult.ok : emailOutcome === "sent";

    if (owningRailDelivered && (await stamp(item.row, item.kind, now))) stamped += 1;
  }

  const outcome = {
    ok: true,
    considered: candidates.length,
    dueSoon: dueSoon.length,
    dueNow: dueNow.length,
    sent,
    unassigned,
    stamped,
    // Loaded but earning no reminder this tick — already stamped, or the other
    // half of a row that only needed one of the two.
    skipped: candidates.length - pending.length,
    failed,
    teams: {
      attempted: destination !== null,
      ok: teamsResult.ok,
      error: teamsResult.ok ? undefined : teamsResult.error,
    },
    // The take() ceiling was hit, so more rows are waiting for the next tick.
    truncated: candidates.length === MAX_INSTANCES_PER_RUN,
  };
  console.log("[checklist-reminders]", JSON.stringify(outcome));
  return NextResponse.json(outcome);
}

/**
 * The route never throws. A cron that 500s is retried by nobody, and an
 * unhandled rejection here would leave the run half-done with no record of why.
 */
async function guarded(req: Request) {
  try {
    return await handle(req);
  } catch (err) {
    console.error("[checklist-reminders] run failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return guarded(req);
}

// Manual trigger with the same auth — same behaviour, no hour gate to bypass.
export async function POST(req: Request) {
  return guarded(req);
}
