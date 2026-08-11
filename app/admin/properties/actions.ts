"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { circlePolygon, parseGeoJsonPolygon } from "@/lib/geofence-input";

// Geofence editing. ADMIN only, matching the rest of /admin/properties — a
// geofence decides whether a photo reads as taken on property, so it is
// portfolio configuration rather than a per-property manager setting.
//
// Every change is audit-logged with the previous value, because the polygon is
// the basis of a verification claim: if a badge is ever disputed, the question
// "what was the boundary at the time" has to be answerable.

export type GeofenceResult = { ok: true; pointCount: number } | { ok: false; error: string };

export async function saveGeofenceFromGeoJson(
  propertyId: string,
  text: unknown,
): Promise<GeofenceResult> {
  const user = await requireAdmin();
  if (typeof text !== "string") return { ok: false, error: "Invalid input" };

  const parsed = parseGeoJsonPolygon(text);
  if (!parsed.ok) return parsed;

  return persist(user.id, propertyId, parsed.polygon, parsed.pointCount, "geojson");
}

export async function saveGeofenceFromCircle(
  propertyId: string,
  lat: unknown,
  lng: unknown,
  radiusMeters: unknown,
): Promise<GeofenceResult> {
  const user = await requireAdmin();

  const parsed = circlePolygon(Number(lat), Number(lng), Number(radiusMeters));
  if (!parsed.ok) return parsed;

  return persist(user.id, propertyId, parsed.polygon, parsed.pointCount, "circle");
}

export async function clearGeofence(propertyId: string): Promise<GeofenceResult> {
  const user = await requireAdmin();

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { geofence: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  await db.$transaction(async (tx) => {
    // Prisma.DbNull writes SQL NULL to a nullable Json column; a bare `null`
    // is rejected, and Prisma.JsonNull would store the JSON literal `null` —
    // which outerRing() would then have to treat as "not set" anyway.
    await tx.property.update({ where: { id: propertyId }, data: { geofence: Prisma.DbNull } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "Property",
        entityId: propertyId,
        action: "clear_geofence",
        before: { geofence: property.geofence ?? undefined },
        after: {
          geofence: null,
          note: "Photos at this property will store UNVERIFIED until a boundary is set again.",
        },
      },
    });
  });

  revalidateGeofenceSurfaces(propertyId);
  return { ok: true, pointCount: 0 };
}

async function persist(
  actorUserId: string,
  propertyId: string,
  polygon: { type: "Polygon"; coordinates: [number, number][][] },
  pointCount: number,
  method: "geojson" | "circle",
): Promise<GeofenceResult> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { geofence: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  await db.$transaction(async (tx) => {
    await tx.property.update({ where: { id: propertyId }, data: { geofence: polygon } });
    await tx.auditLog.create({
      data: {
        actorUserId,
        entityType: "Property",
        entityId: propertyId,
        action: "set_geofence",
        before: { geofence: property.geofence ?? undefined },
        after: { geofence: polygon, method, pointCount },
      },
    });
  });

  revalidateGeofenceSurfaces(propertyId);
  return { ok: true, pointCount };
}

function revalidateGeofenceSurfaces(propertyId: string): void {
  revalidatePath("/admin/properties");
  revalidatePath(`/admin/properties/${propertyId}/geofence`);
}
