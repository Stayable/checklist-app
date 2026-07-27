import type { NetworkEventType } from "@prisma/client";

/**
 * Maps a raw UniFi webhook `eventType` string to our NetworkEventType.
 * Returns null for anything unrecognized — callers must still log the raw
 * payload (RawWebhookPayload) but must NOT throw and must NOT guess a type.
 */
export function mapUnifiEvent(eventType: string): NetworkEventType | null {
  switch (eventType) {
    case "camera.disconnected":
    case "camera.offline":
    case "camera.device_error":
    case "device.disconnected":
      return "PROBLEM";
    case "camera.connected":
    case "camera.online":
    case "device.connected":
      return "RECOVERY";
    default:
      return null;
  }
}

// Aruba alert strings are descriptive prose, not a fixed enum (spec §3.3 —
// exact firmware wording varies by controller version). We normalize
// (lower-case + trim) then match on keyword patterns rather than exact
// strings. Recovery/restore keywords are checked BEFORE problem keywords so
// a message like "AP reconnected (was disconnected)" — which contains the
// substring "disconnected" — is correctly classified as a RECOVERY, not
// swallowed by a naive "disconnected" substring test.
const ARUBA_RECOVERY_PATTERNS = [
  /reconnect/, // "AP reconnected", "access point has reconnected"
  /restored/, // "uplink restored", "connection restored"
  /\bonline\b/, // "AP online", "access point is online"
  /back\s*up/, // "AP back up"
];

const ARUBA_PROBLEM_PATTERNS = [
  /disconnect/, // "AP disconnected", "device.disconnected"
  /\boffline\b/, // "AP offline", "access point offline"
  /over[-\s]?the[-\s]?air/, // "uplink changed: wired -> over-the-air"
];

export function mapArubaEvent(alertType: string): NetworkEventType | null {
  const normalized = alertType.toLowerCase().trim();

  if (ARUBA_RECOVERY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "RECOVERY";
  }

  if (ARUBA_PROBLEM_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "PROBLEM";
  }

  return null;
}
