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
//
// 2026-08-01: there are now NINE channels (one General + one per property), so
// the destination is no longer implicit in this module — the caller resolves a
// routing key to a URL via lib/network/teams-routing.ts and passes it in.

// Config detection lives in teams-routing.ts (isAnyTeamsWebhookConfigured) —
// with nine possible channels, "is Teams configured" is a routing question, not
// a transport one.

const REQUEST_TIMEOUT_MS = 10_000;

/** One Adaptive Card body element. Loosely typed — we emit a small, fixed set. */
export type CardElement = Record<string, unknown>;

/**
 * Wraps Adaptive Card body elements in the request body.
 *
 * Carries BOTH a top-level `text` and the card attachment on purpose: a
 * Workflows flow may reference either `triggerBody()?['text']` or the card
 * attachment depending on how it was authored, and both shapes were accepted by
 * the live endpoint during probing. Sending both means delivery doesn't depend
 * on guessing the flow's internals.
 *
 * ⚠ VERIFIED 2026-08-01: Kyle's flow renders **the card**, not `text`. So the
 * card body is what has to be right; `text` is a fallback for a differently
 * authored flow, and for anyone reading the payload in a log.
 */
export function buildTeamsCardPayload(
  title: string,
  elements: CardElement[],
  fallbackText: string,
): Record<string, unknown> {
  return {
    text: `**${title}**\n\n${fallbackText}`,
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
            ...elements,
          ],
        },
      },
    ],
  };
}

/**
 * The plain-text message shape — one wrapped TextBlock under the title.
 *
 * ⚠ A TextBlock renders as markdown-ish rich text, which **collapses runs of
 * spaces**. Confirmed live 2026-08-01: a space-padded table posted through here
 * arrived with its columns squashed together. So never use this for tabular
 * content — build a ColumnSet and pass it to buildTeamsCardPayload instead
 * (lib/network/digest.ts does exactly that).
 */
export function buildTeamsWebhookPayload(title: string, body: string): Record<string, unknown> {
  return buildTeamsCardPayload(title, [{ type: "TextBlock", text: body, wrap: true }], body);
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
async function post(url: string, payload: Record<string, unknown>): Promise<TeamsPostResult> {
  if (!url) return { ok: false, error: "teams_webhook_not_configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
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

/** Plain-text message. See buildTeamsWebhookPayload on why not for tables. */
export async function postTeamsWebhook(
  url: string,
  title: string,
  body: string,
): Promise<TeamsPostResult> {
  return post(url, buildTeamsWebhookPayload(title, body));
}

/** Structured-card message — used by the digest for its aligned table. */
export async function postTeamsCard(
  url: string,
  title: string,
  elements: CardElement[],
  fallbackText: string,
): Promise<TeamsPostResult> {
  return post(url, buildTeamsCardPayload(title, elements, fallbackText));
}
