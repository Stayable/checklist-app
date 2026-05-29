"use client";

import { useRouter } from "next/navigation";
import { CURRENT_PROPERTY_COOKIE } from "@/lib/cookies";
import type { PickerProperty } from "@/lib/rbac";

// Header property picker for users assigned to more than one property. Stores
// the choice in a cookie the server reads to scope property-specific views.
// Rendered only when there are 2+ options (see Home); portfolio roles and
// single-property users don't get it.
export function PropertyPicker({
  properties,
  current,
}: {
  properties: PickerProperty[];
  current: string | null;
}) {
  const router = useRouter();

  function select(id: string) {
    document.cookie = `${CURRENT_PROPERTY_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span className="sr-only">Property</span>
      <select
        value={current ?? ""}
        onChange={(e) => select(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.shortCode} — {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
