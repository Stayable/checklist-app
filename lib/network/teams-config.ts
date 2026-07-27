import type { Property } from "@prisma/client";

// Config-detection for the Teams Graph integration (NETWORK spec §5.3/§5.4).
// Pure env/property reads — no I/O. Used by teams-graph.server.ts to decide
// whether a ticket-lifecycle event can (eventually) post to Teams for real, or
// must degrade to a logged-only SKIPPED NotificationLog row (see that file's
// header comment for the full degradation story).
//
// Azure AD app-registration contract (documented in .env.example):
//   MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET
// Per-property channel targeting: Property.teamsChannelId (Task 1).

/** True iff the Graph app-registration env vars are all set (tenant-wide). */
export function isTeamsGraphConfigured(): boolean {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_CLIENT_ID &&
      process.env.MS_GRAPH_CLIENT_SECRET,
  );
}

/**
 * True iff Graph is configured tenant-wide AND this specific property has a
 * channel to post into. Both are required — Graph creds alone can't target a
 * channel, and a channel id alone is useless without creds to call Graph.
 */
export function isPropertyTeamsConfigured(
  property: Pick<Property, "teamsChannelId">,
): boolean {
  return isTeamsGraphConfigured() && Boolean(property.teamsChannelId);
}

/**
 * Shared Prisma `select` shape for "the property fields a Teams-lifecycle
 * logger needs" (carried Task-7 Minor fix — this exact field list was
 * duplicated at 5 call sites across lib/network/ticketing.server.ts,
 * lib/network/mass-outage.server.ts, lib/network/ingest.server.ts, and
 * app/api/cron/network-timers/route.ts). Spread it (`...TEAMS_PROPERTY_SELECT`)
 * alongside any extra fields a specific call site also needs.
 */
export const TEAMS_PROPERTY_SELECT = {
  id: true,
  name: true,
  shortCode: true,
  teamsChannelName: true,
  teamsChannelId: true,
} as const;
