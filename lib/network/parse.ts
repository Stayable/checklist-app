import type { DeviceSource, DeviceType, NetworkEventType } from "@prisma/client";
import { mapArubaEvent, mapUnifiEvent } from "./event-mapping";

export type ParsedWebhook = {
  deviceName: string;
  /**
   * Stable identity for the device key, when the source has one better than
   * the display name (T11: the UniFi poller passes the MAC). Webhook parsers
   * leave this undefined and keep the historical name-based key.
   *
   * Names are edited freely in the UniFi controller; keying on the name would
   * strand the old row OFFLINE forever after a rename and open a ticket for a
   * device that never went down.
   */
  deviceIdent?: string;
  propertyRef: string; // matches Property.propertyId (the RISE8 id, e.g. "4645")
  eventType: NetworkEventType;
  source: DeviceSource;
  deviceType: DeviceType;
  alertMessage: string | null;
  occurredAt: Date; // from source system; falls back to now() only if absent
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseOccurredAt(timestamp: unknown): Date {
  if (typeof timestamp === "string" || typeof timestamp === "number") {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * ASSUMED PAYLOAD SHAPE (spec §3.3 — unconfirmed pending a live UniFi
 * controller capture): `{ event: string, device: string, propertyId: string,
 * message?: string, timestamp?: string|number }`.
 *
 * `event` (e.g. "camera.disconnected") is mapped to NetworkEventType via
 * Task 2's `mapUnifiEvent`; an unrecognized event returns null (caller still
 * persists the RawWebhookPayload, just can't build a NetworkEvent from it).
 *
 * Source/type inferred from the event-name prefix: `camera.*` events come
 * from UniFi Protect cameras; anything else (`device.*`) is treated as a
 * UniFi Network access point.
 */
export function parseUnifiPayload(payload: unknown): ParsedWebhook | null {
  if (!isRecord(payload)) return null;

  const eventRaw = asNonEmptyString(payload.event);
  const deviceName = asNonEmptyString(payload.device);
  const propertyRef = asNonEmptyString(payload.propertyId);
  if (!eventRaw || !deviceName || !propertyRef) return null;

  const eventType = mapUnifiEvent(eventRaw);
  if (!eventType) return null;

  const isCamera = eventRaw.startsWith("camera.");
  const source: DeviceSource = isCamera ? "UNIFI_PROTECT" : "UNIFI_NETWORK";
  const deviceType: DeviceType = isCamera ? "CAMERA" : "AP";

  return {
    deviceName,
    propertyRef,
    eventType,
    source,
    deviceType,
    alertMessage: asNonEmptyString(payload.message),
    occurredAt: parseOccurredAt(payload.timestamp),
  };
}

/**
 * ASSUMED PAYLOAD SHAPE (spec §3.3 — unconfirmed pending a live Aruba
 * Instant On portal capture): `{ alertType: string, apName: string,
 * propertyId: string, message?: string, timestamp?: string|number }`.
 *
 * `alertType` is free-form prose (see event-mapping.ts) and is mapped via
 * Task 2's `mapArubaEvent`; an unrecognized string returns null. Aruba only
 * monitors access points, so source/type are always fixed to ARUBA/AP.
 */
export function parseArubaPayload(payload: unknown): ParsedWebhook | null {
  if (!isRecord(payload)) return null;

  const alertType = asNonEmptyString(payload.alertType);
  const deviceName = asNonEmptyString(payload.apName);
  const propertyRef = asNonEmptyString(payload.propertyId);
  if (!alertType || !deviceName || !propertyRef) return null;

  const eventType = mapArubaEvent(alertType);
  if (!eventType) return null;

  return {
    deviceName,
    propertyRef,
    eventType,
    source: "ARUBA",
    deviceType: "AP",
    alertMessage: asNonEmptyString(payload.message),
    occurredAt: parseOccurredAt(payload.timestamp),
  };
}
