import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  PrismaClient,
  Ticket,
  Property,
} from "@prisma/client";
import { isPropertyTeamsConfigured } from "./teams-config";
import { isTeamsWebhookConfigured } from "./teams-webhook";
import type { AffectedDevice } from "./mass-outage";
import {
  buildMassOutageCheckReply,
  buildMassOutageMessage,
  buildResolutionReply,
  buildTicketCreatedMessage,
} from "./teams-message";

/**
 * The mass-outage functions (Task 5) are called from `runMassOutageCheck`,
 * which — per the Task 4 fresh-tx lesson — runs its DB calls directly
 * against the top-level `db` singleton rather than inside one enclosing
 * `$transaction` (so `createStandardTicket`'s own per-attempt retry never
 * inherits a poisoned transaction). So these two accept either a top-level
 * `PrismaClient` or an interactive `Prisma.TransactionClient`, unlike the
 * two ticket-lifecycle loggers above which are always called from within an
 * existing transaction.
 */
type AnyClient = PrismaClient | Prisma.TransactionClient;

type TeamsProperty = Pick<
  Property,
  "id" | "name" | "shortCode" | "teamsChannelName" | "teamsChannelId"
>;

// Teams posting: SCAFFOLD + DEGRADE (Task 7, Kyle 2026-07-25 — no Azure AD
// creds, no confirmed team/channel IDs). Every ticket-lifecycle event below
// builds the exact spec §5.3/§5.5 message via lib/network/teams-message.ts
// (pure, unit-tested), then routes through `writeTeamsLog`, which is
// config-gated (lib/network/teams-config.ts): whether or not Graph is
// actually configured, nothing is sent yet — both paths degrade to a
// SKIPPED NotificationLog row, differing only in `error`, so the intended
// message body is always captured/visible in the log. The real Graph POST
// has a clearly-marked seam inside `writeTeamsLog` for a future
// creds-unblocked task to fill in. Never throws — a Teams-logging failure
// must not fail the ticket operation it's attached to (same never-throw
// discipline as the unconfigured-Resend path in lib/notify.server.ts).

function target(property: Pick<Property, "teamsChannelName" | "shortCode">): string {
  return property.teamsChannelName ?? property.shortCode;
}

function ticketUrl(ticketId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `${base}/network/tickets/${ticketId}`;
}

/**
 * Writes the single NotificationLog TEAMS row for one Teams-post attempt.
 * Config-gated:
 *  - **not configured** (today's reality — no `MS_GRAPH_*` env / no
 *    `Property.teamsChannelId`) → SKIPPED row, `error: "teams_not_configured"`.
 *  - **configured** → this is where the real Graph POST belongs. Since this
 *    task is scaffold-only (no Azure creds, no Graph SDK dependency added),
 *    it currently falls back to a SKIPPED row too, distinguished by
 *    `error: "graph_post_not_implemented"` — see the seam comment below.
 * Never throws: caught and swallowed so a logging failure can't fail the
 * ticket-lifecycle write it's attached to.
 */
async function writeTeamsLog(
  client: AnyClient,
  params: {
    property: TeamsProperty;
    event: string;
    title: string;
    body: string;
    entityId: string;
  },
): Promise<void> {
  const { property, event, title, body, entityId } = params;
  try {
    // FUTURE (creds-unblocked task): once `isPropertyTeamsConfigured(property)`
    // is true (MS_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET set +
    // Property.teamsChannelId present), this is where the real Microsoft
    // Graph call goes:
    //   POST /v1.0/teams/{teamId}/channels/{channelId}/messages
    //     body: { body: { content: body } }
    //   → save response.id onto Ticket.teamsMessageId (+ build
    //     Ticket.teamsMessageUrl from the Teams deep link)
    // A resolution reply (this same `body` is a reply, not a new post) posts
    // instead to:
    //   POST /v1.0/teams/{teamId}/channels/{channelId}/messages/{teamsMessageId}/replies
    // (spec §5.3/§5.4). No Azure AD app registration, no Graph SDK dependency
    // exists in this codebase yet — SCAFFOLD + DEGRADE scope decision (Kyle,
    // 2026-07-25: no creds available). Both the configured and unconfigured
    // cases degrade to the same SKIPPED row below (dedup of a carried Task-7
    // Minor finding — this used to be two near-identical `create` calls);
    // `error` alone distinguishes "nothing to post to" from "would post, but
    // the Graph call isn't wired yet", so it's obvious which gap remains once
    // creds land.
    // A Workflows webhook (TEAMS_WEBHOOK_URL) takes priority when present:
    // queue the row as PENDING and let the post-commit sweep
    // (lib/network/teams-deliver.server.ts, driven by the 1-min cron) deliver
    // it. Deliberately NOT posting here — this function runs inside the
    // caller's transaction, and an HTTP call in a transaction holds it open
    // across a third-party round trip, while a rollback could never unsend
    // the message. Same post-commit discipline as lib/notify.server.ts.
    const queued = isTeamsWebhookConfigured();
    const error = queued
      ? null
      : isPropertyTeamsConfigured(property)
        ? "graph_post_not_implemented"
        : "teams_not_configured";

    await client.notificationLog.create({
      data: {
        userId: null,
        channel: NotificationChannel.TEAMS,
        status: queued ? NotificationStatus.PENDING : NotificationStatus.SKIPPED,
        error,
        event,
        title,
        body,
        target: target(property),
        entityType: "ticket",
        entityId,
      },
    });
  } catch {
    // Best-effort log only — never let a Teams-notification failure fail
    // the ticket lifecycle operation it's attached to.
  }
}

export async function logTeamsTicketCreated(
  tx: Prisma.TransactionClient,
  ticket: Pick<
    Ticket,
    "id" | "ticketNumber" | "alertMessage" | "deviceId" | "triggerEventId" | "openedAt"
  >,
  property: TeamsProperty,
): Promise<void> {
  let body: string;
  try {
    const [device, triggerEvent] = await Promise.all([
      ticket.deviceId
        ? tx.device.findUnique({ where: { id: ticket.deviceId }, select: { name: true, type: true } })
        : Promise.resolve(null),
      ticket.triggerEventId
        ? tx.networkEvent.findUnique({
            where: { id: ticket.triggerEventId },
            select: { occurredAt: true },
          })
        : Promise.resolve(null),
    ]);

    body = buildTicketCreatedMessage({
      propertyName: property.name,
      deviceName: device?.name ?? "Unknown device",
      deviceType: device?.type ?? "Unknown",
      alertMessage: ticket.alertMessage ?? "—",
      offlineSince: triggerEvent?.occurredAt ?? ticket.openedAt,
      ticketNumber: ticket.ticketNumber,
      ticketUrl: ticketUrl(ticket.id),
    });
  } catch {
    // Message enrichment (device/trigger-event lookup) failed — degrade to
    // the bare alert message rather than let this abort the caller's
    // ticket-creation transaction. Deliberate: fall back to the raw
    // alertMessage rather than fabricate a device name/type we couldn't
    // actually look up.
    body = ticket.alertMessage ?? "—";
  }

  await writeTeamsLog(tx, {
    property,
    event: "network_ticket_created",
    title: `Ticket ${ticket.ticketNumber} created — ${property.shortCode}`,
    body,
    entityId: ticket.id,
  });
}

export async function logTeamsTicketResolved(
  tx: Prisma.TransactionClient,
  ticket: Pick<Ticket, "id" | "ticketNumber" | "alertMessage" | "downDurationMin" | "resolvedAt">,
  property: TeamsProperty,
): Promise<void> {
  const body = buildResolutionReply({
    downDurationMin: ticket.downDurationMin ?? 0,
    resolvedAt: ticket.resolvedAt ?? new Date(),
  });

  await writeTeamsLog(tx, {
    property,
    event: "network_ticket_resolved",
    title: `Ticket ${ticket.ticketNumber} resolved — ${property.shortCode}`,
    body,
    entityId: ticket.id,
  });
}

/** Mass-outage ticket created (spec §5.5). */
export async function logTeamsMassOutageCreated(
  db: AnyClient,
  ticket: Pick<Ticket, "id" | "ticketNumber" | "alertMessage" | "affectedDevices" | "openedAt">,
  property: TeamsProperty,
): Promise<void> {
  const affected = (ticket.affectedDevices as unknown as AffectedDevice[] | null) ?? [];
  const body = buildMassOutageMessage({
    propertyName: property.name,
    deviceCount: affected.length,
    time: ticket.openedAt,
    ticketNumber: ticket.ticketNumber,
    deviceNames: affected.map((d) => d.deviceName),
    ticketUrl: ticketUrl(ticket.id),
  });

  await writeTeamsLog(db, {
    property,
    event: "network_mass_outage",
    title: `Mass outage ${ticket.ticketNumber} — ${property.shortCode}`,
    body,
    entityId: ticket.id,
  });
}

/** Mass-outage 10-minute resolution check result (spec §5.5). */
export async function logTeamsMassOutageCheck(
  db: AnyClient,
  ticket: Pick<Ticket, "id" | "ticketNumber">,
  property: TeamsProperty,
  summary: {
    recoveredNames: string[];
    stillOfflineNames: string[];
    /** Carried Task-7 Important fix: max down-duration (minutes) across the
     * recovered devices — threaded through to buildMassOutageCheckReply's
     * "Down Duration" line, which it only renders in the all-recovered
     * variant. Omit when nothing has recovered yet. */
    maxDurationMin?: number;
  },
): Promise<void> {
  const body = buildMassOutageCheckReply({
    recovered: summary.recoveredNames,
    stillOffline: summary.stillOfflineNames,
    maxDurationMin: summary.maxDurationMin,
  });

  await writeTeamsLog(db, {
    property,
    event: "network_mass_outage_check",
    title: `Mass outage check ${ticket.ticketNumber} — ${property.shortCode}`,
    body,
    entityId: ticket.id,
  });
}
