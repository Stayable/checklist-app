import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { outerRing } from "@/lib/geofence";
import type { LngLat } from "@/lib/geofence-input";
import { GeofenceEditor } from "./GeofenceEditor";

// Geofence editor for one property (A6). Until a boundary exists here, every
// photo at this property is stored UNVERIFIED and the whole photo-verification
// feature is inert — this page is what turns it on.

export default async function GeofencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();

  const property = await db.property.findUnique({
    where: { id },
    select: { id: true, shortCode: true, name: true, address: true, geofence: true },
  });
  if (!property) notFound();

  // Read the stored value through the SAME parser the evaluator uses, so a
  // malformed polygon shows here as "not set" exactly as it would behave at
  // submit time, rather than looking configured while verifying nothing.
  const ring = outerRing(property.geofence) as LngLat[] | null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/properties" className="text-sm text-slate-500 hover:underline">
          ← Properties
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {property.shortCode} — geofence
        </h1>
        <p className="text-sm text-slate-500">
          {property.name} · {property.address}
        </p>
      </div>

      <GeofenceEditor
        propertyId={property.id}
        shortCode={property.shortCode}
        address={property.address}
        saved={ring ? { polygon: property.geofence, ring } : null}
      />
    </div>
  );
}
