// Labels for the Teams delivery record shown on a ticket (2026-08-11).
//
// WHY THIS EXISTS. The ticket page used to show a "Teams: not configured"
// badge derived from isPropertyTeamsConfigured() — Graph creds plus
// Property.teamsChannelId. Both belong to the ORIGINAL Graph design (ADR-026),
// which ADR-027 replaced with per-channel Power Automate webhooks resolved from
// env. No property has ever had teamsChannelId set and no Graph creds exist, so
// that badge read "not configured" on every ticket in production while
// notification_log showed the posts genuinely SENT to the property's channel.
// It was not merely noisy: it was false.
//
// The truth already exists per ticket in notification_log — event, routing
// target, status, time, and an `error` string that records a reroute — so the
// page now reports that instead of inferring capability from config. These are
// the pure label helpers for it; the page does the query.

/** Routing key -> what a human calls that channel. */
export function teamsTargetLabel(target: string | null): string {
  if (!target || target === "GENERAL") return "General channel";
  return `${target} channel`;
}

const EVENT_LABELS: Record<string, string> = {
  network_ticket_created: "Ticket opened",
  network_ticket_resolved: "Ticket resolved",
  network_ticket_escalated: "Escalation",
  network_mass_outage_check: "Mass outage",
  network_digest: "Daily digest",
};

/** Event key -> label. Unknown keys are humanised rather than hidden: a new
 *  event type appearing in the log should still be readable here. */
export function teamsEventLabel(event: string): string {
  const known = EVENT_LABELS[event];
  if (known) return known;
  return event.replace(/^network_/, "").replace(/_/g, " ");
}

export type TeamsDeliveryTone = "sent" | "pending" | "failed" | "skipped";

export function teamsDeliveryTone(status: string): TeamsDeliveryTone {
  switch (status) {
    case "SENT":
      return "sent";
    case "PENDING":
      return "pending";
    case "FAILED":
      return "failed";
    default:
      return "skipped";
  }
}

/**
 * Turn a NotificationLog.error string into something a manager can act on.
 *
 * The delivery sweep writes machine-readable markers rather than prose
 * (lib/network/teams-deliver.server.ts), and two of them are not failures at
 * all — a reroute still posted, just not where it was aimed. Rendering the raw
 * marker would read as breakage; hiding it would conceal that a property's own
 * channel is missing. Returns null when there is nothing worth saying.
 */
export function teamsDeliveryNote(error: string | null): string | null {
  if (!error) return null;

  const rerouted = error.match(/^rerouted_to_general_from:(.+)$/);
  if (rerouted) {
    return `${rerouted[1]} has no channel configured, so this went to General instead.`;
  }

  const notConfigured = error.match(/^teams_target_not_configured:(.+)$/);
  if (notConfigured) {
    return `No webhook is configured for ${notConfigured[1]}, and General is not set either — nothing was posted.`;
  }

  if (error === "teams_not_configured") {
    return "No Teams channel was configured when this fired, so nothing was posted.";
  }
  if (error === "graph_post_not_implemented") {
    return "Recorded before webhook delivery existed; nothing was posted.";
  }

  return error;
}
