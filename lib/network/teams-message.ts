import { formatInET } from "../datetime";

// Pure Teams message-body builders (NETWORK spec §5.3 "Message templates" +
// §5.5 "Teams notification for mass outage" / "10-minute check reply"
// variants). No I/O, no Graph dependency — these strings are consumed today
// by lib/network/teams-graph.server.ts as the `body` of a degraded (SKIPPED)
// NotificationLog row, and will be the exact payload of the real Graph
// channel-message POST once Task 7's scaffold is unblocked by Azure creds.
// All datetime substitutions render in ET via lib/datetime.ts (ADR-013).

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
    `[View Ticket] → ${ticketUrl}`,
  ].join("\n");
}

export interface ResolutionReplyParams {
  downDurationMin: number;
  resolvedAt: Date;
}

/** Spec §5.3 "Resolution reply" template. */
export function buildResolutionReply(params: ResolutionReplyParams): string {
  const { downDurationMin, resolvedAt } = params;
  return [
    "✅ Resolved",
    "",
    `Down Duration: ${downDurationMin} min`,
    `Resolved At: ${formatInET(resolvedAt)}`,
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
    `[View Ticket] → ${ticketUrl}`,
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
      `All ${recovered.length} affected devices came back online within 10 minutes.`,
    ];
    if (maxDurationMin != null) {
      lines.push(`Down Duration: ${maxDurationMin} min`);
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
