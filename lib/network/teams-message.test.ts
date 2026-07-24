import { describe, expect, it } from "vitest";
import {
  buildMassOutageCheckReply,
  buildMassOutageMessage,
  buildResolutionReply,
  buildTicketCreatedMessage,
} from "./teams-message";

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
