import { GeofenceStatus } from "@prisma/client";

// Geofence verification (CLAUDE.md §Photo Verification). Pure functions — no
// I/O — so they unit-test cleanly and can run in the submit action now and a
// Phase-6 backfill job later.
//
// properties.geofence holds a GeoJSON Polygon: { type: "Polygon", coordinates:
// [[[lng, lat], ...outerRing], ...holes] }. Only the outer ring is evaluated
// (hotel parcels don't have holes). Statuses:
//   VERIFIED     — GPS inside the polygon, or within BUFFER_METERS of its edge
//   OFF_PROPERTY — GPS present, polygon present, point beyond the buffer
//   NO_GPS       — no GPS captured with the photo
//   UNVERIFIED   — GPS captured but the property has no (valid) polygon yet;
//                  re-evaluate in Phase 6 once polygons are drawn

export const BUFFER_METERS = 50;

export type GpsPoint = { lat: number; lng: number };

/** [lng, lat] pairs, per GeoJSON. */
type Ring = [number, number][];

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLng(latDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((latDeg * Math.PI) / 180);
}

/** Ray-casting point-in-ring test on GeoJSON [lng, lat] coordinates. */
export function pointInRing(point: GpsPoint, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // lng, lat
    const [xj, yj] = ring[j];
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Min distance in meters from a point to the ring's edges, via equirectangular
 * projection local to the point — plenty accurate at 50m scale.
 */
export function distanceToRingMeters(point: GpsPoint, ring: Ring): number {
  const mLng = metersPerDegLng(point.lat);
  const px = point.lng * mLng;
  const py = point.lat * METERS_PER_DEG_LAT;
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * mLng;
    const ay = ring[j][1] * METERS_PER_DEG_LAT;
    const bx = ring[i][0] * mLng;
    const by = ring[i][1] * METERS_PER_DEG_LAT;
    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    const dx = px - (ax + t * abx);
    const dy = py - (ay + t * aby);
    min = Math.min(min, Math.hypot(dx, dy));
  }
  return min;
}

/** Extract the outer ring from a GeoJSON Polygon value, or null if invalid. */
export function outerRing(geofence: unknown): Ring | null {
  if (typeof geofence !== "object" || geofence === null) return null;
  const g = geofence as { type?: unknown; coordinates?: unknown };
  if (g.type !== "Polygon" || !Array.isArray(g.coordinates)) return null;
  const ring = g.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4) return null; // GeoJSON rings are closed: ≥4 points
  const valid = ring.every(
    (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number",
  );
  return valid ? (ring as Ring) : null;
}

/** Geofence status for a photo, per the rules at the top of this file. */
export function geofenceStatusFor(gps: GpsPoint | null, geofence: unknown): GeofenceStatus {
  if (!gps) return GeofenceStatus.NO_GPS;
  const ring = outerRing(geofence);
  if (!ring) return GeofenceStatus.UNVERIFIED;
  if (pointInRing(gps, ring)) return GeofenceStatus.VERIFIED;
  return distanceToRingMeters(gps, ring) <= BUFFER_METERS
    ? GeofenceStatus.VERIFIED
    : GeofenceStatus.OFF_PROPERTY;
}
