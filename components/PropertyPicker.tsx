"use client";

import type { Role } from "@prisma/client";
import { useRouter } from "next/navigation";
import { CURRENT_PROPERTY_COOKIE } from "@/lib/cookies";
import {
  ALL_PROPERTIES_VALUE,
  propertyPickerOptions,
  type PickerPropertyLike,
} from "@/lib/property-picker";

// Header property picker. Stores the choice in a cookie the server reads to
// scope property-specific views. Rendered only for users with 2+ accessible
// properties (see AppShell) — one property is not a choice.
//
// The first option is the all-scope entry (W7). Selecting it CLEARS the cookie
// rather than writing a sentinel: getCurrentPropertyId then returns null and
// resolveScopedPropertyIds falls through to the user's full accessible set,
// which is the behaviour that already existed but had no control.
export function PropertyPicker({
  properties,
  current,
  role,
}: {
  properties: PickerPropertyLike[];
  current: string | null;
  role: Role;
}) {
  const router = useRouter();
  const options = propertyPickerOptions(properties, role);

  function select(value: string) {
    if (value === ALL_PROPERTIES_VALUE) {
      // max-age=0 expires it immediately. The path MUST match the one it was
      // written with or the browser leaves the original cookie in place and the
      // selection appears to do nothing.
      document.cookie = `${CURRENT_PROPERTY_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      document.cookie = `${CURRENT_PROPERTY_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
    router.refresh();
  }

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span className="sr-only">Property</span>
      <select
        value={current ?? ALL_PROPERTIES_VALUE}
        onChange={(e) => select(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 focus:border-slate-900 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
