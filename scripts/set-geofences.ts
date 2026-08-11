/**
 * Set the geofence polygon for each property from boundaries traced by Kyle on
 * satellite imagery (2026-08-12).
 *
 * Run:  pnpm dotenv -e .env.production.local -- tsx scripts/set-geofences.ts [--apply]
 *
 * Validation goes through parseGeoJsonPolygon — the SAME parser the admin editor
 * uses — so a boundary loaded here cannot pass checks the UI would reject
 * (coordinate order, Florida bounds, ring closure, corner count).
 *
 * WHAT THIS SCRIPT CAN AND CANNOT VERIFY. It checks that each polygon is
 * well-formed, sits inside Florida, spans a sane number of meters, contains its
 * own centroid, and does not overlap another property's box. It CANNOT check
 * that an outline matches the real parcel — that needs eyes on satellite
 * imagery, which is why Kyle traced them. The numbers printed below are there so
 * an obviously wrong one (a 5 km "motel", a polygon in the wrong county) is
 * caught before it starts labelling photos.
 */

import { GeofenceStatus } from "@prisma/client";
import { db } from "../lib/db";
import { geofenceStatusFor } from "../lib/geofence";
import { parseGeoJsonPolygon, ringBounds, type LngLat } from "../lib/geofence-input";

const ACTOR_EMAIL = "bke@rentstayable.com";
const METERS_PER_DEG_LAT = 111_320;

// Traced by Kyle, 2026-08-12, keyed by Stayable property id.
const TRACED: Record<string, string> = {
  // Davenport — 44199 US Hwy 27
  "44199": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.6516627,28.2373647],[-81.6511127,28.236428],[-81.6497263,28.2370699],[-81.6499276,28.2373772],[-81.6504181,28.2371823],[-81.6509426,28.2372972],[-81.6511666,28.2375945],[-81.6516627,28.2373647]]]}}`,
  // Orlando OBT — 8700 S. Orange Blossom Trail
  "8700": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.4057553,28.4388187],[-81.405736,28.4378575],[-81.4044274,28.4378677],[-81.4041541,28.438839],[-81.4057553,28.4388187]]]}}`,
  // Kissimmee East — 2295 E. Irlo Bronson Memorial Hwy
  "2295": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.3496166,28.2854245],[-81.3502782,28.2844933],[-81.3502521,28.2841263],[-81.3501219,28.2837593],[-81.3499604,28.2835804],[-81.349528,28.2832777],[-81.3482726,28.2847273],[-81.3493978,28.2854612],[-81.3496166,28.2854245]]]}}`,
  // Kissimmee West — 5399 W. Irlo Bronson Memorial Hwy
  "5399": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.4996433,28.3331404],[-81.4987733,28.3331587],[-81.4987733,28.3349103],[-81.499862,28.3348874],[-81.4999089,28.3333192],[-81.4996433,28.3331404]]]}}`,
  // Jacksonville West — 910 Suemac Road
  "6802": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.7590853,30.3356109],[-81.7590619,30.3339714],[-81.76068,30.3339552],[-81.7606706,30.3350725],[-81.7604877,30.3354247],[-81.7601922,30.3356109],[-81.7590853,30.3356109]]]}}`,
  // Jacksonville North — 812 Dunn Avenue
  "812": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.6580359,30.4291818],[-81.6571487,30.4291913],[-81.6567235,30.4281324],[-81.6580249,30.4280881],[-81.6580359,30.4291818]]]}}`,
  // Lakeland — 4645 N. Socrum Loop Road
  "4645": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.9496195,28.1036312],[-81.9490682,28.103579],[-81.9485524,28.1025017],[-81.9485584,28.102235],[-81.9489852,28.1016127],[-81.9496433,28.1016859],[-81.9497025,28.102167],[-81.9502479,28.1022455],[-81.9502124,28.1026429],[-81.949667,28.1026534],[-81.9496195,28.1036312]]]}}`,
  // St. Augustine — 2535 State Road 16
  "2535": `{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-81.4159253,29.91965],[-81.4163902,29.9194256],[-81.4166336,29.9190281],[-81.4167209,29.918644],[-81.415632,29.9184115],[-81.4152826,29.9188739],[-81.4159253,29.91965]]]}}`,
};

function spanMeters(ring: LngLat[]): { width: number; height: number; centroid: { lat: number; lng: number } } {
  const b = ringBounds(ring);
  const midLat = (b.minLat + b.maxLat) / 2;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180);
  // Corners only (drop the closing repeat) so the average isn't weighted twice.
  const corners = ring.slice(0, -1);
  return {
    width: Math.round((b.maxLng - b.minLng) * metersPerDegLng),
    height: Math.round((b.maxLat - b.minLat) * METERS_PER_DEG_LAT),
    centroid: {
      lat: corners.reduce((sum, p) => sum + p[1], 0) / corners.length,
      lng: corners.reduce((sum, p) => sum + p[0], 0) / corners.length,
    },
  };
}

async function main() {
  const apply = process.argv.includes("--apply");

  const actor = await db.user.findUnique({ where: { email: ACTOR_EMAIL }, select: { id: true } });
  if (!actor) throw new Error(`Actor ${ACTOR_EMAIL} not found`);

  const properties = await db.property.findMany({
    select: { id: true, propertyId: true, shortCode: true, name: true, geofence: true },
    orderBy: { shortCode: "asc" },
  });

  console.log(apply ? "MODE: apply\n" : "MODE: dry run (nothing will be written)\n");
  console.log("  code  corners  span (m)     centroid                    centroid reads");

  const prepared: { id: string; shortCode: string; polygon: object; pointCount: number }[] = [];
  const problems: string[] = [];
  const boxes: { shortCode: string; b: ReturnType<typeof ringBounds> }[] = [];

  for (const property of properties) {
    const raw = TRACED[property.propertyId];
    if (!raw) {
      problems.push(`${property.shortCode}: no traced boundary supplied`);
      continue;
    }

    const parsed = parseGeoJsonPolygon(raw);
    if (!parsed.ok) {
      problems.push(`${property.shortCode}: ${parsed.error}`);
      continue;
    }

    const ring = parsed.polygon.coordinates[0];
    const { width, height, centroid } = spanMeters(ring);
    // A polygon that does not contain its own centroid is either badly concave
    // or self-intersecting — worth seeing before it starts judging photos.
    const centroidStatus = geofenceStatusFor(centroid, parsed.polygon);

    console.log(
      `  ${property.shortCode.padEnd(5)} ${String(parsed.pointCount).padEnd(8)} ${`${width}×${height}`.padEnd(12)} ` +
        `${centroid.lat.toFixed(5)}, ${centroid.lng.toFixed(5)}   ${centroidStatus}`,
    );

    if (centroidStatus !== GeofenceStatus.VERIFIED) {
      problems.push(`${property.shortCode}: centroid reads ${centroidStatus} — check the outline`);
    }
    if (width > 1500 || height > 1500) {
      problems.push(`${property.shortCode}: spans ${width}×${height} m, which is too large for one parcel`);
    }
    if (width < 30 || height < 30) {
      problems.push(`${property.shortCode}: spans only ${width}×${height} m, which looks too small`);
    }

    boxes.push({ shortCode: property.shortCode, b: ringBounds(ring) });
    prepared.push({
      id: property.id,
      shortCode: property.shortCode,
      polygon: parsed.polygon,
      pointCount: parsed.pointCount,
    });
  }

  // Two properties sharing ground would mean a copy-paste slip.
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].b;
      const c = boxes[j].b;
      const overlaps =
        a.minLng <= c.maxLng && c.minLng <= a.maxLng && a.minLat <= c.maxLat && c.minLat <= a.maxLat;
      if (overlaps) problems.push(`${boxes[i].shortCode} and ${boxes[j].shortCode} overlap`);
    }
  }

  if (problems.length > 0) {
    console.log("\n⚠ problems:");
    for (const p of problems) console.log(`    ${p}`);
  } else {
    console.log("\nall boundaries well-formed, in Florida, sanely sized, non-overlapping");
  }

  if (!apply) {
    console.log("\nRe-run with --apply to write.");
    await db.$disconnect();
    return;
  }
  if (problems.length > 0) {
    throw new Error("Refusing to write while any boundary has a problem.");
  }

  for (const item of prepared) {
    const before = properties.find((p) => p.id === item.id)?.geofence ?? undefined;
    await db.$transaction(async (tx) => {
      await tx.property.update({ where: { id: item.id }, data: { geofence: item.polygon } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          entityType: "Property",
          entityId: item.id,
          action: "set_geofence",
          before: { geofence: before },
          after: {
            geofence: item.polygon,
            method: "geojson",
            pointCount: item.pointCount,
            note: "Traced on satellite imagery by Kyle, 2026-08-12, loaded by scripts/set-geofences.ts.",
          },
        },
      });
    });
  }

  console.log(`\nwrote ${prepared.length} boundaries`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
