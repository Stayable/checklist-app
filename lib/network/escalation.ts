import type { TicketStatus } from "@prisma/client";
import { formatInET } from "../datetime";

/**
 * Pure display-only escalation + overnight tagging (DevSpec §9). Kept
 * dependency-free like lib/network/ticket-age.ts so it unit-tests cleanly.
 * Neither of these drives any notification in v1 — see docs/DECISIONS.md
 * ADR-026.
 */

/**
 * Escalation threshold — still unconfirmed by Kate/Christopher (same status as
 * the checklist SLA defaults in ADR-014), but **no longer display-only**: as of
 * 2026-08-01 crossing it posts to the General Teams channel and emails the
 * escalation contact. So this number now decides when a real person gets
 * interrupted, and confirming it matters more than it did as a badge threshold.
 */
export const ESCALATION_THRESHOLD_HOURS = 4;

const HOUR_MS = 60 * 60 * 1000;

/**
 * The instant a ticket opened at `openedAt` becomes escalated. Pure; exists so
 * the sweep can express its query as a single `openedAt < cutoff` bound instead
 * of loading every open ticket and filtering in memory.
 */
export function escalationCutoff(now: Date): Date {
  return new Date(now.getTime() - ESCALATION_THRESHOLD_HOURS * HOUR_MS);
}

/**
 * True when `openedAt` falls in the overnight window — 10 PM to 8 AM
 * (inclusive of 22:00, exclusive of 08:00) — **in Eastern Time**, per spec
 * §9. The hour is always derived via lib/datetime.ts's formatInET, never the
 * server/browser's local timezone, so this is correct across EDT/EST and
 * regardless of where the process runs.
 */
export function isOvernight(openedAt: Date): boolean {
  const hour = Number.parseInt(formatInET(openedAt, "H"), 10);
  return hour >= 22 || hour < 8;
}

export type EscalationLevel = "NONE" | "ESCALATED";

/**
 * Display-only escalation flag (spec §9). A ticket already in a terminal
 * status (RESOLVED/CLOSED) is never escalated, regardless of how old it is
 * — escalation only matters while a ticket is still open. An OPEN/
 * IN_PROGRESS ticket older than ESCALATION_THRESHOLD_HOURS is "ESCALATED".
 * Pure — no I/O, drives no notifications.
 */
export function escalationLevel(params: {
  openedAt: Date;
  now: Date;
  status: TicketStatus;
}): EscalationLevel {
  const { openedAt, now, status } = params;
  if (status === "RESOLVED" || status === "CLOSED") return "NONE";
  const ageMs = now.getTime() - openedAt.getTime();
  return ageMs > ESCALATION_THRESHOLD_HOURS * HOUR_MS ? "ESCALATED" : "NONE";
}
