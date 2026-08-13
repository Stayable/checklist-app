import { formatInET } from "../datetime";

// Pure Teams message-body builders (NETWORK spec §5.3 "Message templates" +
// §5.5 "Teams notification for mass outage" / "10-minute check reply"
// variants). No I/O, no Graph dependency — these strings are consumed today
// by lib/network/teams-graph.server.ts as the `body` of a degraded (SKIPPED)
// NotificationLog row, and will be the exact payload of the real Graph
// channel-message POST once Task 7's scaffold is unblocked by Azure creds.
// All datetime substitutions render in ET via lib/datetime.ts (ADR-013).

/**
 * The "open this ticket" line.
 *
 * ⚠ MUST be markdown link syntax. These strings are rendered by Teams inside an
 * Adaptive Card `TextBlock` (verified live 2026-08-01 — the flow renders the
 * card, not the payload's `text` field), and a TextBlock renders markdown-ish
 * rich text. The earlier form was `[View Ticket] → <bare url>`: square brackets
 * with no `(url)` after them are literal characters, so it produced dead text
 * and an un-clickable URL. Reported by Kyle 2026-08-13.
 *
 * Kept as one helper so all four message templates cannot drift apart, and so
 * this reasoning lives in exactly one place.
 */
export function ticketLink(ticketUrl: string): string {
  return `[View ticket](${ticketUrl})`;
}

export interface TicketCreatedMessageParams {
  propertyName: string;
  deviceName: string;
  deviceType: string;
  alertMessage: string;
  offlineSince: Date;
  ticketNumber: string;
  ticketUrl: string;
}

/** Spec §5.3 "New ticket" template. */
export function buildTicketCreatedMessage(params: TicketCreatedMessageParams): string {
  const { propertyName, deviceName, deviceType, alertMessage, offlineSince, ticketNumber, ticketUrl } =
    params;
  return [
    "🔴 Device Ticket Created",
    "",
    `Property: ${propertyName}`,
    `Device: ${deviceName} (${deviceType})`,
    `Issue: ${alertMessage}`,
    `Offline Since: ${formatInET(offlineSince)}`,
    `Ticket: ${ticketNumber}`,
    "",
    "No recovery detected after 5 minutes. Please investigate.",
    "Reply to this message to add notes to the ticket.",
    "",
    ticketLink(ticketUrl),
  ].join("\n");
}

export interface ResolutionReplyParams {
  /** Null when no duration was recorded — say so, never print a number. */
  downDurationMin: number | null;
  resolvedAt: Date;
}

/** Spec §5.3 "Resolution reply" template. */
export function buildResolutionReply(params: ResolutionReplyParams): string {
  const { downDurationMin, resolvedAt } = params;
  return [
    "✅ Resolved",
    "",
    // "not recorded" rather than a coerced 0: the caller used to send
    // `downDurationMin ?? 0`, so tickets with no recorded duration announced
    // "Down Duration: 0 min" — read as "it was never really down". An absent
    // measurement has to look absent.
    `Down Duration: ${downDurationMin == null ? "not recorded" : `${downDurationMin} min`}`,
    `Resolved At: ${formatInET(resolvedAt)}`,
  ].join("\n");
}

export interface EscalationMessageParams {
  propertyName: string;
  propertyShortCode: string;
  deviceName: string | null;
  alertMessage: string;
  openedAt: Date;
  ageHours: number;
  thresholdHours: number;
  ticketNumber: string;
  ticketUrl: string;
  /** Who to pull in. Rendered as plain text — see the @-mention note below. */
  notifyName: string;
}

/**
 * Escalation post for the General channel (Kyle 2026-08-01).
 *
 * ON @-MENTIONS: a genuine Teams @-mention requires an `msteams` mention entity
 * in the Adaptive Card *and* a Power Automate flow that passes it through, and
 * that flow is not something this codebase can see or verify. So the contact is
 * named in plain text — visible and unambiguous. Claiming a tag that silently
 * renders as literal text would be worse than not tagging. Making it a real
 * mention is a flow-side change (Kyle, Monday).
 *
 * No email address is rendered. An earlier version printed one because the sweep
 * also emailed; escalation is Teams-only now (Kyle, 2026-08-02), so an address in
 * the post would imply a delivery path that does not exist.
 */
export function buildEscalationMessage(params: EscalationMessageParams): string {
  const {
    propertyName,
    propertyShortCode,
    deviceName,
    alertMessage,
    openedAt,
    ageHours,
    thresholdHours,
    ticketNumber,
    ticketUrl,
    notifyName,
  } = params;
  return [
    "⚠️ Ticket Escalated",
    "",
    `Property: ${propertyName} (${propertyShortCode})`,
    `Device: ${deviceName ?? "Property-wide — no single device"}`,
    `Issue: ${alertMessage}`,
    `Opened: ${formatInET(openedAt)}`,
    `Open for: ${ageHours} h — past the ${thresholdHours} h escalation threshold`,
    `Ticket: ${ticketNumber}`,
    "",
    `${notifyName} — please pick this up.`,
    "",
    ticketLink(ticketUrl),
  ].join("\n");
}

export interface MassOutageMessageParams {
  propertyName: string;
  deviceCount: number;
  time: Date;
  ticketNumber: string;
  deviceNames: string[];
  ticketUrl: string;
}

/** Spec §5.5 "Teams notification for mass outage (initial post)" template. */
export function buildMassOutageMessage(params: MassOutageMessageParams): string {
  const { propertyName, deviceCount, time, ticketNumber, deviceNames, ticketUrl } = params;
  return [
    "🔴 Mass Outage Detected",
    "",
    `Property: ${propertyName}`,
    `Devices Affected: ${deviceCount} devices offline simultaneously`,
    `Time: ${formatInET(time)}`,
    `Ticket: ${ticketNumber}`,
    "",
    `Devices: ${deviceNames.join(", ")}`,
    "",
    ticketLink(ticketUrl),
  ].join("\n");
}

export interface MassOutageCheckReplyParams {
  recovered: string[];
  stillOffline: string[];
  /** Only rendered in the all-recovered variant (spec's "Down Duration" line). */
  maxDurationMin?: number;
}

/**
 * Spec §5.5's three 10-minute-check reply variants, selected by the shape of
 * `recovered`/`stillOffline`:
 *  - `stillOffline` empty → "all recovered" (covers the degenerate
 *    zero-device case too — vacuously "all" of nothing recovered).
 *  - `recovered` empty (and `stillOffline` non-empty) → "all still offline".
 *  - both non-empty → the split variant.
 */
export function buildMassOutageCheckReply(params: MassOutageCheckReplyParams): string {
  const { recovered, stillOffline, maxDurationMin } = params;

  if (stillOffline.length === 0) {
    const lines = [
      "✅ All devices recovered",
      "",
      // Was "came back online within 10 minutes", printed directly above a
      // "Down Duration: 11 min" line — the reader is told two different things
      // in consecutive sentences (Kyle 2026-08-13, seen on TKT-20260812-084 and
      // -085). The check FIRES at the 10-minute mark but runs off a 1-minute
      // cron tick, so it always lands a little after; the sentence asserted a
      // bound this reply has never actually measured. State the count, and let
      // the measured duration be the only claim about time.
      `All ${recovered.length} affected devices are back online.`,
    ];
    if (maxDurationMin != null) {
      // "longest" because this is the max across the recovered devices, not a
      // single device's downtime — otherwise it reads as the outage duration
      // for each of them.
      lines.push(`Down Duration: ${maxDurationMin} min (longest of the ${recovered.length})`);
    }
    return lines.join("\n");
  }

  if (recovered.length === 0) {
    return [
      "10-Minute Check — All Devices Still Offline",
      "",
      `🔴 ${stillOffline.length} devices remain offline. Individual tickets have been created for each.`,
    ].join("\n");
  }

  return [
    "10-Minute Check",
    "",
    `✅ Recovered (${recovered.length} devices): ${recovered.join(", ")}`,
    `🔴 Still Offline (${stillOffline.length} devices): ${stillOffline.join(", ")}`,
    "",
    "Individual tickets created for still-offline devices.",
  ].join("\n");
}
