import { afterEach, describe, expect, it } from "vitest";
import { buildTeamsWebhookPayload, isTeamsWebhookConfigured } from "./teams-webhook";

const ORIGINAL = process.env.TEAMS_WEBHOOK_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.TEAMS_WEBHOOK_URL;
  else process.env.TEAMS_WEBHOOK_URL = ORIGINAL;
});

describe("isTeamsWebhookConfigured", () => {
  it("is false when unset and when empty", () => {
    delete process.env.TEAMS_WEBHOOK_URL;
    expect(isTeamsWebhookConfigured()).toBe(false);
    process.env.TEAMS_WEBHOOK_URL = "";
    expect(isTeamsWebhookConfigured()).toBe(false);
  });

  it("is true once a URL is present", () => {
    process.env.TEAMS_WEBHOOK_URL = "https://example.invalid/hook";
    expect(isTeamsWebhookConfigured()).toBe(true);
  });
});

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
