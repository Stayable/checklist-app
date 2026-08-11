import { describe, expect, it } from "vitest";
import {
  teamsDeliveryNote,
  teamsDeliveryTone,
  teamsEventLabel,
  teamsTargetLabel,
} from "./teams-delivery-labels";

describe("teamsTargetLabel", () => {
  it("names a property channel by its short code", () => {
    expect(teamsTargetLabel("JW")).toBe("JW channel");
    expect(teamsTargetLabel("LL")).toBe("LL channel");
  });

  it("treats GENERAL and a missing target as the General channel", () => {
    // A row with no target predates per-channel routing, and the delivery sweep
    // resolves it as General — so the label has to agree with that.
    expect(teamsTargetLabel("GENERAL")).toBe("General channel");
    expect(teamsTargetLabel(null)).toBe("General channel");
  });
});

describe("teamsEventLabel", () => {
  it("labels the events the network pipeline actually emits", () => {
    expect(teamsEventLabel("network_ticket_created")).toBe("Ticket opened");
    expect(teamsEventLabel("network_ticket_resolved")).toBe("Ticket resolved");
    expect(teamsEventLabel("network_ticket_escalated")).toBe("Escalation");
    expect(teamsEventLabel("network_mass_outage_check")).toBe("Mass outage");
  });

  it("humanises an unknown event instead of dropping it", () => {
    // A new event key must stay readable rather than rendering blank.
    expect(teamsEventLabel("network_something_new")).toBe("something new");
    expect(teamsEventLabel("other_event")).toBe("other event");
  });
});

describe("teamsDeliveryTone", () => {
  it("maps each status", () => {
    expect(teamsDeliveryTone("SENT")).toBe("sent");
    expect(teamsDeliveryTone("PENDING")).toBe("pending");
    expect(teamsDeliveryTone("FAILED")).toBe("failed");
    expect(teamsDeliveryTone("SKIPPED")).toBe("skipped");
  });

  it("treats an unrecognised status as skipped rather than sent", () => {
    // Fail closed: never imply a post landed on the strength of a status this
    // code does not know.
    expect(teamsDeliveryTone("WHATEVER")).toBe("skipped");
  });
});

describe("teamsDeliveryNote", () => {
  it("says nothing when there is nothing to say", () => {
    expect(teamsDeliveryNote(null)).toBeNull();
  });

  it("explains a reroute as a redirect, not a failure — it did post", () => {
    const note = teamsDeliveryNote("rerouted_to_general_from:KW");
    expect(note).toContain("KW");
    expect(note).toContain("General");
  });

  it("explains a genuinely dropped post", () => {
    const note = teamsDeliveryNote("teams_target_not_configured:SA");
    expect(note).toContain("SA");
    expect(note).toContain("nothing was posted");
  });

  it("covers the two legacy markers from the Graph-era scaffold", () => {
    expect(teamsDeliveryNote("teams_not_configured")).toContain("nothing was posted");
    expect(teamsDeliveryNote("graph_post_not_implemented")).toContain("nothing was posted");
  });

  it("passes an unrecognised error through rather than swallowing it", () => {
    expect(teamsDeliveryNote("http_502_bad_gateway")).toBe("http_502_bad_gateway");
  });
});
