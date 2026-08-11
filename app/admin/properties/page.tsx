import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { outerRing } from "@/lib/geofence";

// Admin → Properties. Room management is still later; the geofence is now
// editable per property (A6). "Set" is computed with the SAME parser the photo
// evaluator uses, so a malformed polygon reads as not set here rather than
// looking configured while verifying nothing.
export default async function AdminPropertiesPage() {
  await requireAdmin();

  const properties = await db.property.findMany({
    orderBy: { shortCode: "asc" },
    select: {
      id: true,
      propertyId: true,
      shortCode: true,
      name: true,
      address: true,
      geofence: true,
      active: true,
      _count: { select: { rooms: true, users: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Properties</h1>
      <p className="mt-1 text-sm text-slate-500">
        Until a property has a geofence, every photo taken there is stored UNVERIFIED.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Property</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Address</th>
              <th className="px-4 py-3">Rooms</th>
              <th className="px-4 py-3">Geofence</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {properties.map((p) => (
              <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                <td className="px-4 py-3 font-bold text-slate-900">{p.shortCode}</td>
                <td className="px-4 py-3 text-slate-700">{p.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.propertyId}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.address}</td>
                <td className="px-4 py-3 text-slate-600">{p._count.rooms}</td>
                <td className="px-4 py-3">
                  {outerRing(p.geofence) ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Set</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Not set</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/properties/${p.id}/geofence`}
                    className="font-medium text-navy hover:underline"
                  >
                    {outerRing(p.geofence) ? "Edit" : "Set up"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
