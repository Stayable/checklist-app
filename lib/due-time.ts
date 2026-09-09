import { etDayStartUtc } from "@/lib/datetime";

// The one place a checklist deadline is turned from what a person typed into
// what goes in `checklist_instances.due_at`.
//
// Two writers produce that column: the batch wizard (a person picking a time
// for one submission) and the 5 AM cron (a recurring rule applying the same
// time every morning). They must agree, because a reminder job reads one column
// and cannot tell which path wrote the row.

/**
 * ET wall-clock `HH:mm`, 24-hour — the one shape a due time may take.
 *
 * ⚠ `app/checklists/new/batch.actions.ts` still declares this literal inline.
 * It is byte-identical on purpose; fold that copy into this constant the next
 * time that file is touched. A rule path that accepted `"9:00"` while the
 * wizard rejected it would create checklists the wizard could never have made.
 */
export const DUE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * ET wall-clock `HH:mm` on `ymd` (an ET calendar day, `yyyy-MM-dd`), as the UTC
 * instant to store in `due_at`. Null in, null out: no due time means no
 * deadline, and no deadline means nobody gets reminded.
 *
 * A malformed stored value also yields null rather than an Invalid Date. The
 * rule path reads `dueTime` back out of Postgres, where a column added after
 * the fact can hold anything a migration or a hand-edit put there — and
 * `new Date(NaN)` reaches Prisma as a write error at 5 AM, on the cron, with
 * nobody watching.
 */
export function dueAtFor(ymd: string, dueTime: string | null | undefined): Date | null {
  if (!dueTime || !DUE_TIME_PATTERN.test(dueTime)) return null;
  const [h, m] = dueTime.split(":").map(Number);
  // etDayStartUtc gives the instant of ET midnight, so adding the offset lands
  // on ET wall-clock time. A DST transition inside the same day would shift this
  // by an hour; both US transitions happen at 02:00, and no checklist is due
  // then, so the simple arithmetic is honest here.
  return new Date(etDayStartUtc(ymd).getTime() + (h! * 60 + m!) * 60_000);
}

/**
 * `"18:00"` → `"6:00 PM ET"`, for read-only display of a rule's deadline.
 *
 * Formatted by hand rather than through `lib/datetime.ts` because a rule's due
 * time is a wall-clock time with NO date: there is no instant to convert, and
 * inventing one (today's date, say) to run it through `formatInET` would print
 * the right thing for the wrong reason and drift across a DST boundary. The
 * "ET" suffix is still mandatory — the stored value is Eastern by definition.
 */
export function formatDueTime(dueTime: string | null | undefined): string | null {
  if (!dueTime || !DUE_TIME_PATTERN.test(dueTime)) return null;
  const [h, m] = dueTime.split(":").map(Number);
  const hour12 = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour12}:${String(m!).padStart(2, "0")} ${h! < 12 ? "AM" : "PM"} ET`;
}
