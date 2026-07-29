// Teams delivery via a Power Automate "Workflows" webhook (2026-07-27).
//
// This is the send-only alternative to the Microsoft Graph path the DevSpec
// asks for (§5.3/§5.4). Kyle supplied a Workflows webhook URL for the
// "Network Tickets (test)" channel, which unblocks real notifications today
// without an Azure app registration or admin consent.
//
// KNOWN LIMITS vs Graph — deliberate, flagged for Kate rather than hidden:
//   * send-only: no threading, so a resolution posts as its own message
//     instead of a reply under the original ticket post
//   * no message id comes back, so Ticket.teamsMessageId / teamsMessageUrl
//     stay empty and T8 (Teams reply -> TicketNote) remains impossible
//   * the endpoint returns 202 for anything it accepts, whether or not the
//     flow then posts. "Accepted" is the strongest claim we can honestly make
//
// The Graph seam in lib/network/teams-graph.server.ts is left intact, so
// moving to Graph later is additive rather than a rewrite.

const REQUEST_TIMEOUT_MS = 10_000;

export function isTeamsWebhookConfigured(): boolean {
  return Boolean(process.env.TEAMS_WEBHOOK_URL);
}

/**
 * Builds the request body.
 *
 * Carries BOTH a top-level `text` and an Adaptive Card attachment on purpose:
 * a Workflows flow may reference either `triggerBody()?['text']` or the card
 * attachment depending on how it was authored, and both shapes were accepted
 * by the live endpoint during probing. Sending both means delivery doesn't
 * depend on guessing the flow's internals.
 */
export function buildTeamsWebhookPayload(title: string, body: string): Record<string, unknown> {
  return {
    // Plain-text fallback — also what a text-referencing flow posts.
    text: `**${title}**\n\n${body}`,
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          type: "AdaptiveCard",
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          version: "1.4",
          body: [
            { type: "TextBlock", text: title, weight: "Bolder", size: "Medium", wrap: true },
            { type: "TextBlock", text: body, wrap: true },
          ],
        },
      },
    ],
  };
}

export type TeamsPostResult = { ok: true; status: number } | { ok: false; error: string };

/**
 * POSTs one message. Never throws.
 *
 * `charset=utf-8` is REQUIRED, not cosmetic: without it the endpoint rejects
 * any non-ASCII byte with `InvalidRequestContent - Unable to translate bytes`.
 * Verified live 2026-07-27 — a single em dash in the message body 400s. Our
 * ticket templates use em dashes and field-facing copy is bilingual with
 * accented Spanish, so omitting this would fail intermittently on ordinary
 * wording.
 */
export async function postTeamsWebhook(
  title: string,
  body: string,
): Promise<TeamsPostResult> {
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return { ok: false, error: "teams_webhook_not_configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(buildTeamsWebhookPayload(title, body)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      return { ok: false, error: `teams_webhook_http_${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "teams_webhook_failed",
    };
  }
}
