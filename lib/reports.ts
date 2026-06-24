import { InstanceStatus } from "@prisma/client";

export type StatusCount = {
  propertyId: string;
  scheduledFor: Date;
  status: InstanceStatus;
  count: number;
};

export type CompletenessRow = {
  propertyId: string;
  date: string; // ymd key
  scheduled: number;
  completed: number;
  incomplete: number;
  withIssues: number;
  pct: number;
};

const DONE = new Set<InstanceStatus>([InstanceStatus.SUBMITTED, InstanceStatus.REVIEWED]);
const INCOMPLETE = new Set<InstanceStatus>([
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
  InstanceStatus.FLAGGED,
]);
// INVALIDATED / EXPIRED are terminal and excluded from the scheduled denominator.

export function summarizeCompleteness(
  counts: StatusCount[],
  withIssuesByKey: Record<string, number>,
  ymd: (d: Date) => string,
): CompletenessRow[] {
  const byKey = new Map<string, CompletenessRow>();
  for (const c of counts) {
    const date = ymd(c.scheduledFor);
    const key = `${c.propertyId}|${date}`;
    let row = byKey.get(key);
    if (!row) {
      row = { propertyId: c.propertyId, date, scheduled: 0, completed: 0, incomplete: 0, withIssues: withIssuesByKey[key] ?? 0, pct: 0 };
      byKey.set(key, row);
    }
    if (DONE.has(c.status)) {
      row.completed += c.count;
      row.scheduled += c.count;
    } else if (INCOMPLETE.has(c.status)) {
      row.incomplete += c.count;
      row.scheduled += c.count;
    }
  }
  for (const row of byKey.values()) {
    row.pct = row.scheduled === 0 ? 0 : Math.round((row.completed / row.scheduled) * 100);
  }
  return [...byKey.values()].sort((a, b) => (a.date === b.date ? a.propertyId.localeCompare(b.propertyId) : b.date.localeCompare(a.date)));
}
