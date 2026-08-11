// Turning what a human pastes or types into the GeoJSON Polygon that
// properties.geofence stores and lib/geofence.ts evaluates. Pure — no I/O — so
// every trap below is unit-tested rather than discovered in production.
//
// FOUR REAL TRAPS THIS EXISTS TO CATCH:
//
// 1. geojson.io — the tool anyone will actually reach for — exports a
//    FeatureCollection, not a bare Polygon. Accepting only a Polygon would make
//    the normal workflow fail with "invalid" on correct data.
// 2. GeoJSON is [longitude, latitude], which is the reverse of how everyone
//    says and writes coordinates, and of what Google Maps copies to your
//    clipboard. Swapped input still parses as valid GeoJSON and lands the
//    polygon in the wrong hemisphere. For Florida the two ranges do not
//    overlap, so a swap is DETECTABLE — and it is rejected with an explanation
//    rather than silently corrected, because silently "fixing" input teaches
//    nobody and would mangle a genuinely unusual case.
// 3. A GeoJSON ring must be closed (last point == first) and hold at least 4
//    positions. A hand-built ring usually is not closed; closing it is the
//    correct, lossless repair, so that one IS done for you.
// 4. Google Maps hands you "28.123, -81.456" — a lat,lng pair as text. The
//    circle builder therefore takes lat and lng as separate labelled numbers
//    and does the ordering itself.

export type LngLat = [number, number];

/** Florida bounds, generous. Every Stayable property is in-state; this is a
 *  sanity check on operator input, not a hard geographic constraint. */
const FL_LNG = { min: -88, max: -79 };
const FL_LAT = { min: 24, max: 31.5 };

export type ParseResult =
  | { ok: true; polygon: { type: "Polygon"; coordinates: [LngLat[]] }; pointCount: number }
  | { ok: false; error: string };

function isNumberPair(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/** Pull the first Polygon ring out of any of the shapes a person might paste. */
function extractRing(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return null;
  const node = parsed as Record<string, unknown>;

  if (node.type === "FeatureCollection" && Array.isArray(node.features)) {
    const polygons = node.features.filter((f) => {
      const geometry = (f as Record<string, unknown> | null)?.geometry as
        | Record<string, unknown>
        | undefined;
      return geometry?.type === "Polygon";
    });
    if (polygons.length === 0) return null;
    // More than one drawn shape is ambiguous — say so rather than picking one.
    if (polygons.length > 1) return "multiple";
    const geometry = (polygons[0] as Record<string, unknown>).geometry as Record<string, unknown>;
    return (geometry.coordinates as unknown[])?.[0] ?? null;
  }

  if (node.type === "Feature") {
    const geometry = node.geometry as Record<string, unknown> | undefined;
    if (geometry?.type !== "Polygon") return null;
    return (geometry.coordinates as unknown[])?.[0] ?? null;
  }

  if (node.type === "Polygon") {
    return (node.coordinates as unknown[])?.[0] ?? null;
  }

  return null;
}

/** True when the pair looks like [lat, lng] for Florida rather than [lng, lat]. */
export function looksSwapped(ring: LngLat[]): boolean {
  // In Florida longitude is ~-81 and latitude ~28: |lng| > |lat| always, and
  // the ranges do not overlap. If the FIRST number sits in the latitude band
  // and the SECOND in the longitude band, the pair is reversed.
  return ring.every(
    ([first, second]) =>
      first >= FL_LAT.min &&
      first <= FL_LAT.max &&
      second >= FL_LNG.min &&
      second <= FL_LNG.max,
  );
}

/**
 * Parse pasted GeoJSON into a closed Polygon. Accepts a FeatureCollection (what
 * geojson.io exports), a Feature, or a bare Polygon.
 */
export function parseGeoJsonPolygon(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Paste the GeoJSON for the property boundary." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "That is not valid JSON. Copy the whole GeoJSON block." };
  }

  const extracted = extractRing(parsed);
  if (extracted === "multiple") {
    return {
      ok: false,
      error: "That file holds more than one shape. Keep a single polygon per property.",
    };
  }
  if (!Array.isArray(extracted)) {
    return {
      ok: false,
      error: "No polygon found. Expected a GeoJSON Polygon, Feature, or FeatureCollection.",
    };
  }

  if (!extracted.every(isNumberPair)) {
    return { ok: false, error: "The polygon has a coordinate that is not a pair of numbers." };
  }
  const ring = extracted.map(([lng, lat]) => [lng, lat] as LngLat);

  // Distinct corners, ignoring an explicit closing point.
  const closed =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const corners = closed ? ring.slice(0, -1) : ring;
  if (corners.length < 3) {
    return { ok: false, error: "A boundary needs at least 3 corners." };
  }

  if (looksSwapped(corners)) {
    return {
      ok: false,
      error:
        "Those coordinates look reversed. GeoJSON is [longitude, latitude] — for Florida the first number should be about -81, the second about 28.",
    };
  }

  const outOfRange = corners.find(
    ([lng, lat]) =>
      lng < FL_LNG.min || lng > FL_LNG.max || lat < FL_LAT.min || lat > FL_LAT.max,
  );
  if (outOfRange) {
    return {
      ok: false,
      error: `Point [${outOfRange[0]}, ${outOfRange[1]}] is outside Florida. Check the coordinate order and the values.`,
    };
  }

  if (corners.length > 200) {
    return { ok: false, error: "That boundary has too many points — simplify it under 200." };
  }

  // Close the ring ourselves: lossless, and GeoJSON requires it.
  const coordinates: [LngLat[]] = [[...corners, corners[0]]];
  return { ok: true, polygon: { type: "Polygon", coordinates }, pointCount: corners.length };
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * A regular polygon approximating a circle of `radiusMeters` around a point —
 * the low-effort option when a precise parcel outline is not worth the trouble.
 * 24 sides keeps the inscribed-vs-true-circle error under ~1%, well inside the
 * 50 m buffer the evaluator already applies.
 */
export function circlePolygon(
  lat: number,
  lng: number,
  radiusMeters: number,
  sides = 24,
): ParseResult {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Enter both a latitude and a longitude." };
  }
  if (lat < FL_LAT.min || lat > FL_LAT.max || lng < FL_LNG.min || lng > FL_LNG.max) {
    return {
      ok: false,
      error: "That point is outside Florida. Latitude is about 28, longitude about -81 (negative).",
    };
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 20 || radiusMeters > 2000) {
    return { ok: false, error: "Radius must be between 20 and 2000 meters." };
  }

  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
  const corners: LngLat[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides;
    corners.push([
      lng + (radiusMeters * Math.cos(angle)) / metersPerDegLng,
      lat + (radiusMeters * Math.sin(angle)) / METERS_PER_DEG_LAT,
    ]);
  }
  return {
    ok: true,
    polygon: { type: "Polygon", coordinates: [[...corners, corners[0]]] },
    pointCount: sides,
  };
}

/** Bounding box of a ring, for drawing a preview. */
export function ringBounds(ring: LngLat[]): {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
} {
  const lngs = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

/** Parse "28.123, -81.456" (how Google Maps copies a point) into lat/lng. */
export function parseLatLngPair(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
