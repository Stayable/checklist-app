import { describe, expect, it } from "vitest";
import {
  buildEscalationMessage,
  buildMassOutageCheckReply,
  buildMassOutageMessage,
  buildResolutionReply,
  buildTicketCreatedMessage,
} from "./teams-message";

describe("buildEscalationMessage", () => {
  const params = {
    propertyName: "Kissimmee West",
    propertyShortCode: "KW",
    deviceName: "SW-Lobby",
    alertMessage: "Switch offline",
    openedAt: new Date("2026-08-01T08:00:00Z"),
    ageHours: 4,
    thresholdHours: 4,
    ticketNumber: "TKT-20260801-003",
    ticketUrl: "https://ops.rentstayable.com/network/tickets/abc",
    notifyName: "Gerardo",
  };

  it("identifies the property by name and short code", () => {
    expect(buildEscalationMessage(params)).toContain("Kissimmee West (KW)");
  });

  it("names who should pick it up", () => {
    const msg = buildEscalationMessage(params);
    expect(msg).toContain("Gerardo");
    expect(msg).toContain("please pick this up");
  });

  it("renders NO email address — escalation is Teams-only", () => {
    // Kyle 2026-08-02: no email for Gerardo. Printing an address would imply a
    // delivery path that no longer exists.
    expect(buildEscalationMessage(params)).not.toMatch(/@/);
  });

  it("states both the age and the threshold it passed", () => {
    // "Open for 4 h" alone doesn't tell a reader whether that is bad.
    expect(buildEscalationMessage(params)).toContain("Open for: 4 h — past the 4 h");
  });

  it("describes a device-less mass-outage parent as property-wide", () => {
    const msg = buildEscalationMessage({ ...params, deviceName: null });
    expect(msg).toContain("Property-wide");
    // Must never render a bare "null" where a device name goes.
    expect(msg).not.toContain("null");
  });

  it("renders the opened time in ET", () => {
    // 08:00 UTC is 04:00 ET in August; a UTC render would misstate it by 4 h,
    // which matters when the message is about elapsed time.
    expect(buildEscalationMessage(params)).toContain("Opened: Aug 1, 2026 4:00 AM ET");
  });

  it("links to the ticket", () => {
    expect(buildEscalationMessage(params)).toContain(params.ticketUrl);
  });
});

// Spec §5.3 / §5.5 exact message templates. Pure string builders — assert the
// literal shape so a future edit can't silently drift from the spec.

describe("buildTicketCreatedMessage", () => {
  it("renders the §5.3 new-ticket template", () => {
    const msg = buildTicketCreatedMessage({
      propertyName: "Lakeland",
      deviceName: "LL-AP-01",
      deviceType: "Access Point",
      alertMessage: "Device unreachable",
      offlineSince: new Date("2026-07-25T14:00:00Z"),
      ticketNumber: "TKT-20260725-001",
      ticketUrl: "https://ops.rentstayable.com/network/tickets/abc123",
    });

    expect(msg).toBe(
      [
        "🔴 Device Ticket Created",
        "",
        "Property: Lakeland",
        "Device: LL-AP-01 (Access Point)",
        "Issue: Device unreachable",
        `Offline Since: ${"Jul 25, 2026 10:00 AM ET"}`,
        "Ticket: TKT-20260725-001",
        "",
        "No recovery detected after 5 minutes. Please investigate.",
        "Reply to this message to add notes to the ticket.",
        "",
        "[View Ticket] → https://ops.rentstayable.com/network/tickets/abc123",
      ].join("\n"),
    );
  });
});

describe("buildResolutionReply", () => {
  it("renders the §5.3 resolution-reply template", () => {
    const msg = buildResolutionReply({
      downDurationMin: 12,
      resolvedAt: new Date("2026-07-25T14:12:00Z"),
    });

    expect(msg).toBe(
      ["✅ Resolved", "", "Down Duration: 12 min", "Resolved At: Jul 25, 2026 10:12 AM ET"].join(
        "\n",
      ),
    );
  });
});

describe("buildMassOutageMessage", () => {
  it("renders the §5.5 mass-outage initial-post template", () => {
    const msg = buildMassOutageMessage({
      propertyName: "Jacksonville West",
      deviceCount: 6,
      time: new Date("2026-07-25T14:00:00Z"),
      ticketNumber: "TKT-20260725-002",
      deviceNames: ["JW-AP-01", "JW-AP-02", "JW-SW-01"],
      ticketUrl: "https://ops.rentstayable.com/network/tickets/def456",
    });

    expect(msg).toBe(
      [
        "🔴 Mass Outage Detected",
        "",
        "Property: Jacksonville West",
        "Devices Affected: 6 devices offline simultaneously",
        "Time: Jul 25, 2026 10:00 AM ET",
        "Ticket: TKT-20260725-002",
        "",
        "Devices: JW-AP-01, JW-AP-02, JW-SW-01",
        "",
        "[View Ticket] → https://ops.rentstayable.com/network/tickets/def456",
      ].join("\n"),
    );
  });
});

describe("buildMassOutageCheckReply", () => {
  it("all-recovered variant includes Down Duration when provided", () => {
    const msg = buildMassOutageCheckReply({
      recovered: ["JW-AP-01", "JW-AP-02"],
      stillOffline: [],
      maxDurationMin: 7,
    });

    expect(msg).toBe(
      [
        "✅ All devices recovered",
        "",
        "All 2 affected devices came back online within 10 minutes.",
        "Down Duration: 7 min",
      ].join("\n"),
    );
  });

  it("all-recovered variant omits Down Duration when not provided", () => {
    const msg = buildMassOutageCheckReply({
      recovered: ["JW-AP-01"],
      stillOffline: [],
    });

    expect(msg).toBe(
      ["✅ All devices recovered", "", "All 1 affected devices came back online within 10 minutes."].join(
        "\n",
      ),
    );
  });

  it("split variant lists both groups", () => {
    const msg = buildMassOutageCheckReply({
      recovered: ["JW-AP-01"],
      stillOffline: ["JW-AP-02", "JW-SW-01"],
    });

    expect(msg).toBe(
      [
        "10-Minute Check",
        "",
        "✅ Recovered (1 devices): JW-AP-01",
        "🔴 Still Offline (2 devices): JW-AP-02, JW-SW-01",
        "",
        "Individual tickets created for still-offline devices.",
      ].join("\n"),
    );
  });

  it("all-still-offline variant", () => {
    const msg = buildMassOutageCheckReply({
      recovered: [],
      stillOffline: ["JW-AP-01", "JW-AP-02"],
    });

    expect(msg).toBe(
      [
        "10-Minute Check — All Devices Still Offline",
        "",
        "🔴 2 devices remain offline. Individual tickets have been created for each.",
      ].join("\n"),
    );
  });

  it("empty/empty degenerate case falls into the all-recovered branch", () => {
    const msg = buildMassOutageCheckReply({ recovered: [], stillOffline: [] });

    expect(msg).toBe(
      ["✅ All devices recovered", "", "All 0 affected devices came back online within 10 minutes."].join(
        "\n",
      ),
    );
  });
});
