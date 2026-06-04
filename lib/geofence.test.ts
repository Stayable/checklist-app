import { describe, expect, it } from "vitest";
import { GeofenceStatus } from "@prisma/client";
import { distanceToRingMeters, geofenceStatusFor, outerRing, pointInRing } from "./geofence";

// A ~220m × 220m square around Lakeland (4645 N. Socrum Loop Rd-ish coords).
// 0.001° lat ≈ 111m; 0.001° lng ≈ 96m at 28°N.
const SQUARE = {
  type: "Polygon",
  coordinates: [
    [
      [-81.96, 28.1],
      [-81.958, 28.1],
      [-81.958, 28.102],
      [-81.96, 28.102],
      [-81.96, 28.1], // closed ring
    ],
  ],
};

const CENTER = { lat: 28.101, lng: -81.959 };
const FAR_AWAY = { lat: 28.2, lng: -81.9 }; // ~12km off
// ~20m east of the eastern edge (-81.958): 0.0002° lng ≈ 19.6m at 28°N.
const JUST_OUTSIDE = { lat: 28.101, lng: -81.9578 };
// ~200m east of the eastern edge.
const WELL_OUTSIDE = { lat: 28.101, lng: -81.956 };

describe("outerRing", () => {
  it("extracts a valid GeoJSON polygon ring", () => {
    expect(outerRing(SQUARE)).toHaveLength(5);
  });
  it("rejects null, wrong type, and malformed coordinates", () => {
    expect(outerRing(null)).toBeNull();
    expect(outerRing({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(outerRing({ type: "Polygon", coordinates: [] })).toBeNull();
    expect(outerRing({ type: "Polygon", coordinates: [[[0, 0], [1, 1]]] })).toBeNull(); // <4 pts
    expect(outerRing({ type: "Polygon", coordinates: [[["a", 0], [0, 0], [1, 1], [0, 0]]] })).toBeNull();
  });
});

describe("pointInRing", () => {
  const ring = outerRing(SQUARE)!;
  it("center is inside", () => {
    expect(pointInRing(CENTER, ring)).toBe(true);
  });
  it("far point is outside", () => {
    expect(pointInRing(FAR_AWAY, ring)).toBe(false);
  });
});

describe("distanceToRingMeters", () => {
  const ring = outerRing(SQUARE)!;
  it("~20m outside the east edge measures roughly 20m", () => {
    const d = distanceToRingMeters(JUST_OUTSIDE, ring);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(30);
  });
  it("~200m outside measures roughly 200m", () => {
    const d = distanceToRingMeters(WELL_OUTSIDE, ring);
    expect(d).toBeGreaterThan(150);
    expect(d).toBeLessThan(250);
  });
});

describe("geofenceStatusFor", () => {
  it("NO_GPS when gps missing", () => {
    expect(geofenceStatusFor(null, SQUARE)).toBe(GeofenceStatus.NO_GPS);
  });
  it("UNVERIFIED when polygon missing or invalid (Phase-6 backfill case)", () => {
    expect(geofenceStatusFor(CENTER, null)).toBe(GeofenceStatus.UNVERIFIED);
    expect(geofenceStatusFor(CENTER, { type: "Polygon", coordinates: [] })).toBe(
      GeofenceStatus.UNVERIFIED,
    );
  });
  it("VERIFIED inside the polygon", () => {
    expect(geofenceStatusFor(CENTER, SQUARE)).toBe(GeofenceStatus.VERIFIED);
  });
  it("VERIFIED within the 50m buffer outside the edge (GPS drift)", () => {
    expect(geofenceStatusFor(JUST_OUTSIDE, SQUARE)).toBe(GeofenceStatus.VERIFIED);
  });
  it("OFF_PROPERTY beyond the buffer", () => {
    expect(geofenceStatusFor(WELL_OUTSIDE, SQUARE)).toBe(GeofenceStatus.OFF_PROPERTY);
    expect(geofenceStatusFor(FAR_AWAY, SQUARE)).toBe(GeofenceStatus.OFF_PROPERTY);
  });
});
