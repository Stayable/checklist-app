import { IssuePriority } from "@prisma/client";

// Pure review/issue helpers — no React, no DB. Shared by the review queue,
// single-submission review, and issue-creation paths; unit-tested in isolation.

/** Placeholder SLA hours per priority (ADR-014 follow-up). Seed + fallback when
 * a sla_defaults row is missing. Christopher confirms/corrects via /admin/sla. */
export const SLA_PLACEHOLDER_HOURS: Record<IssuePriority, number> = {
  [IssuePriority.URGENT]: 4,
  [IssuePriority.HIGH]: 24,
  [IssuePriority.MEDIUM]: 72,
  [IssuePriority.LOW]: 168,
};

/** Issue SLA target = creation time + configured hours for its priority. */
export function slaTargetAt(
  createdAt: Date,
  priority: IssuePriority,
  hoursByPriority: Partial<Record<IssuePriority, number>> = {},
): Date {
  const hours = hoursByPriority[priority] ?? SLA_PLACEHOLDER_HOURS[priority];
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Minutes from open to submit, or null when either timestamp is missing.
 * Clamped to >= 0 so clock skew can never show a negative duration.
 */
export function timeToCompleteMinutes(
  openedAt: Date | null,
  submittedAt: Date | null,
): number | null {
  if (!openedAt || !submittedAt) return null;
  const ms = submittedAt.getTime() - openedAt.getTime();
  return Math.max(0, Math.round(ms / 60_000));
}

/** "—" / "12m" / "1h 05m" — queue + review-header display. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** An issue is in SLA breach when unresolved past its target. */
export function isSlaBreached(
  slaTarget: Date | null,
  resolvedAt: Date | null,
  now: Date,
): boolean {
  if (!slaTarget || resolvedAt) return false;
  return now.getTime() > slaTarget.getTime();
}
