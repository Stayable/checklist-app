"use client";

import type { Role } from "@prisma/client";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/ui/select";
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
//
// Not a native <select> — see components/ui/select.tsx for why.
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

  function select(next: string) {
    if (next === ALL_PROPERTIES_VALUE) {
      // max-age=0 expires it immediately. The path MUST match the one it was
      // written with or the browser leaves the original cookie in place and the
      // selection appears to do nothing.
      document.cookie = `${CURRENT_PROPERTY_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      document.cookie = `${CURRENT_PROPERTY_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    }
    router.refresh();
  }

  return (
    <SelectField
      ariaLabel="Property"
      value={current ?? ALL_PROPERTIES_VALUE}
      options={options}
      onChange={select}
      // Header control: sized to its content rather than filling the bar, and
      // semibold because it states the scope everything else on the page is
      // showing.
      triggerClassName="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:border-slate-900 focus:outline-none"
    />
  );
}
