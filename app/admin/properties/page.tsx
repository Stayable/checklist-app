import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

// Admin → Properties. Read-only in v1 (geofence editor + room management land in
// Phase 6 / later). Shows the portfolio and whether a geofence polygon is set.
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
        Read-only in v1. Geofence polygon editor ships in Phase 6.
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
                  {p.geofence ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Set</span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Not set</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
        Geofence map placeholder — Leaflet polygon editor lands in Phase 6 once
        Kate provides final coordinates per property.
      </div>
    </div>
  );
}
