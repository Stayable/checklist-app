import { describe, expect, it } from "vitest";
import { buildTeamsWebhookPayload } from "./teams-webhook";

// Config detection moved to teams-routing.test.ts along with the routing rules
// (2026-08-01) — this file now covers the transport payload only.

describe("buildTeamsWebhookPayload", () => {
  const payload = buildTeamsWebhookPayload("Ticket TKT-1 created", "AP-RM122 is offline");

  it("carries a top-level text field for text-referencing flows", () => {
    expect(payload.text).toContain("Ticket TKT-1 created");
    expect(payload.text).toContain("AP-RM122 is offline");
  });

  it("also carries an adaptive card, so either flow shape works", () => {
    const attachments = payload.attachments as { contentType: string; content: unknown }[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.contentType).toBe("application/vnd.microsoft.card.adaptive");
  });

  it("puts the title and body in separate card blocks", () => {
    const content = (payload.attachments as { content: { body: { text: string }[] } }[])[0]!.content;
    expect(content.body[0]?.text).toBe("Ticket TKT-1 created");
    expect(content.body[1]?.text).toBe("AP-RM122 is offline");
  });

  it("survives an empty body", () => {
    const empty = buildTeamsWebhookPayload("Title only", "");
    expect(empty.text).toContain("Title only");
  });

  it("serialises non-ASCII content without loss (em dash, accented Spanish)", () => {
    // The live endpoint rejects non-ASCII unless charset=utf-8 is sent, which
    // postTeamsWebhook does; this guards the payload side of that pairing.
    const built = buildTeamsWebhookPayload("Ticket — KW", "Cámara desconectada en habitación 122");
    const json = JSON.stringify(built);
    expect(JSON.parse(json).text).toContain("—");
    expect(JSON.parse(json).text).toContain("Cámara");
  });
});
