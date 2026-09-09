import { describe, expect, it } from "vitest";
import { checklistNotificationsEnabled } from "./checklist-notifications-enabled";

// The point of these is the DEFAULT. A switch that is meant to hold something
// back during a testing phase is only worth having if every ambiguous value
// resolves to "off" — an env typo must not put a card in front of the PMs.
describe("checklistNotificationsEnabled", () => {
  it("is OFF when the variable is unset", () => {
    expect(checklistNotificationsEnabled({})).toBe(false);
  });

  it("is OFF for an empty string", () => {
    expect(checklistNotificationsEnabled({ CHECKLIST_NOTIFICATIONS_ENABLED: "" })).toBe(false);
  });

  it.each(["TRUE", "True", " true", "true ", "1", "yes", "on", "enabled", "false"])(
    "is OFF for %o — only the exact string counts",
    (value) => {
      expect(checklistNotificationsEnabled({ CHECKLIST_NOTIFICATIONS_ENABLED: value })).toBe(false);
    },
  );

  it("is ON only for the exact string \"true\"", () => {
    expect(checklistNotificationsEnabled({ CHECKLIST_NOTIFICATIONS_ENABLED: "true" })).toBe(true);
  });
});
