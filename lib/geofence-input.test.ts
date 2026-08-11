import { describe, expect, it } from "vitest";
import { geofenceStatusFor } from "./geofence";
import {
  circlePolygon,
  looksSwapped,
  parseGeoJsonPolygon,
  parseLatLngPair,
  ringBounds,
} from "./geofence-input";

// A small square around Lakeland (4645 N. Socrum Loop Rd), in GeoJSON order.
const LL_RING: [number, number][] = [
  [-81.9705, 28.1385],
  [-81.9685, 28.1385],
  [-81.9685, 28.1400],
  [-81.9705, 28.1400],
];
const bare = { type: "Polygon", coordinates: [LL_RING] };

describe("parseGeoJsonPolygon", () => {
  it("accepts a bare Polygon and closes the ring", () => {
    const result = parseGeoJsonPolygon(JSON.stringify(bare));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ring = result.polygon.coordinates[0];
    // 4 corners in, 5 positions out: GeoJSON requires the ring to close.
    expect(result.pointCount).toBe(4);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("accepts a FeatureCollection, which is what geojson.io actually exports", () => {
    const fc = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: bare }],
    };
    const result = parseGeoJsonPolygon(JSON.stringify(fc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.polygon.coordinates[0]).toHaveLength(5);
  });

  it("accepts a single Feature", () => {
    const feature = { type: "Feature", properties: {}, geometry: bare };
    expect(parseGeoJsonPolygon(JSON.stringify(feature)).ok).toBe(true);
  });

  it("keeps an already-closed ring the same length", () => {
    const closed = { type: "Polygon", coordinates: [[...LL_RING, LL_RING[0]]] };
    const result = parseGeoJsonPolygon(JSON.stringify(closed));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pointCount).toBe(4);
      expect(result.polygon.coordinates[0]).toHaveLength(5);
    }
  });

  it("rejects reversed [lat, lng] coordinates with an explanation", () => {
    // The trap: this is valid JSON and valid GeoJSON shape, but puts the
    // property off the coast of Somalia.
    const swapped = { type: "Polygon", coordinates: [LL_RING.map(([lng, lat]) => [lat, lng])] };
    const result = parseGeoJsonPolygon(JSON.stringify(swapped));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/longitude, latitude/i);
      expect(result.error).toMatch(/-81/);
    }
  });

  it("rejects more than one shape rather than silently picking one", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: bare },
        { type: "Feature", properties: {}, geometry: bare },
      ],
    };
    const result = parseGeoJsonPolygon(JSON.stringify(fc));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/more than one shape/i);
  });

  it("rejects a point outside Florida and names it", () => {
    const texas = { type: "Polygon", coordinates: [[[-97.1, 32.7], [-97.0, 32.7], [-97.0, 32.8]]] };
    const result = parseGeoJsonPolygon(JSON.stringify(texas));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outside Florida/i);
  });

  it("rejects fewer than 3 corners, empty input, and non-JSON", () => {
    const two = { type: "Polygon", coordinates: [[[-81.97, 28.13], [-81.96, 28.13]]] };
    expect(parseGeoJsonPolygon(JSON.stringify(two)).ok).toBe(false);
    expect(parseGeoJsonPolygon("").ok).toBe(false);
    expect(parseGeoJsonPolygon("not json").ok).toBe(false);
    expect(parseGeoJsonPolygon(JSON.stringify({ type: "Point", coordinates: [-81.9, 28.1] })).ok).toBe(
      false,
    );
  });

  it("rejects a coordinate that is not a pair of numbers", () => {
    const bad = { type: "Polygon", coordinates: [[[-81.97, 28.13], ["x", 28.13], [-81.96, 28.14]]] };
    expect(parseGeoJsonPolygon(JSON.stringify(bad)).ok).toBe(false);
  });

  // The whole point of the parser: what it emits must satisfy the evaluator.
  it("produces a polygon the geofence evaluator accepts and verifies inside", () => {
    const result = parseGeoJsonPolygon(JSON.stringify(bare));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const inside = { lat: 28.13925, lng: -81.9695 };
    const farAway = { lat: 28.2, lng: -81.9 };
    expect(geofenceStatusFor(inside, result.polygon)).toBe("VERIFIED");
    expect(geofenceStatusFor(farAway, result.polygon)).toBe("OFF_PROPERTY");
    expect(geofenceStatusFor(null, result.polygon)).toBe("NO_GPS");
  });
});

describe("looksSwapped", () => {
  it("is true only when every pair sits in the reversed bands", () => {
    expect(looksSwapped(LL_RING)).toBe(false);
    expect(looksSwapped(LL_RING.map(([lng, lat]) => [lat, lng]))).toBe(true);
  });
});

describe("circlePolygon", () => {
  it("builds a closed ring the evaluator verifies at its centre", () => {
    const result = circlePolygon(28.139, -81.9695, 150);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ring = result.polygon.coordinates[0];
    expect(result.pointCount).toBe(24);
    expect(ring).toHaveLength(25);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(geofenceStatusFor({ lat: 28.139, lng: -81.9695 }, result.polygon)).toBe("VERIFIED");
  });

  it("puts a point beyond the radius plus the 50m buffer off-property", () => {
    const result = circlePolygon(28.139, -81.9695, 100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ~600 m north: outside 100 m + 50 m buffer by a wide margin.
    expect(geofenceStatusFor({ lat: 28.1444, lng: -81.9695 }, result.polygon)).toBe("OFF_PROPERTY");
  });

  it("rejects a swapped centre, a non-Florida point, and a silly radius", () => {
    // lat/lng passed the wrong way round: -81 is not a valid latitude.
    expect(circlePolygon(-81.9695, 28.139, 150).ok).toBe(false);
    expect(circlePolygon(32.7, -97.1, 150).ok).toBe(false);
    expect(circlePolygon(28.139, -81.9695, 5).ok).toBe(false);
    expect(circlePolygon(28.139, -81.9695, 99_999).ok).toBe(false);
    expect(circlePolygon(Number.NaN, -81.9695, 150).ok).toBe(false);
  });
});

describe("ringBounds", () => {
  it("returns the bounding box", () => {
    expect(ringBounds(LL_RING)).toEqual({
      minLng: -81.9705,
      maxLng: -81.9685,
      minLat: 28.1385,
      maxLat: 28.14,
    });
  });
});

describe("parseLatLngPair", () => {
  it("parses what Google Maps copies", () => {
    expect(parseLatLngPair("28.1392, -81.9695")).toEqual({ lat: 28.1392, lng: -81.9695 });
    expect(parseLatLngPair("  28.1392 ,-81.9695 ")).toEqual({ lat: 28.1392, lng: -81.9695 });
  });

  it("returns null for anything else", () => {
    expect(parseLatLngPair("28.1392")).toBeNull();
    expect(parseLatLngPair("lat 28 lng -81")).toBeNull();
    expect(parseLatLngPair("")).toBeNull();
  });
});
