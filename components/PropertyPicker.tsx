"use client";

import type { Role } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Select } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
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
// NOT a native <select> (changed 2026-09-09). Chrome on Windows draws the
// dropdown with the OS widget and ignores `font-family` on <option>, so the
// open list rendered in Times while the closed control was Nunito. A CSS rule
// was tried first (`option, optgroup { font-family: var(--font-sans) }`),
// shipped, and confirmed live in production CSS — the popup ignored it anyway,
// because no stylesheet reaches a native popup. The only way to control the
// type is to own the rendering, so this uses Base UI's Select: a real listbox
// in our own DOM, with keyboard nav, typeahead and ARIA wiring already handled.
// That rule stays in globals.css for the native selects elsewhere in the app.
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
  const value = current ?? ALL_PROPERTIES_VALUE;
  const selected = options.find((o) => o.value === value) ?? options[0];

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
    <Select.Root
      value={value}
      // Base UI hands back the item's value; it is typed as unknown because an
      // item value may be any serialisable thing.
      onValueChange={(next) => select(String(next ?? ALL_PROPERTIES_VALUE))}
    >
      <Select.Trigger
        aria-label="Property"
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus:border-slate-900 focus:outline-none"
      >
        <Select.Value>{selected?.label ?? "Property"}</Select.Value>
        <Select.Icon>
          <ChevronsUpDown className="size-4 text-slate-400" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        {/* sideOffset keeps the list clear of the trigger's border. The popup
            is portalled to <body>, which is inside the font-variable class on
            <html>, so it inherits Nunito — the whole point of the change. */}
        <Select.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup className="max-h-80 min-w-[var(--anchor-width)] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm font-medium text-slate-900 shadow-lg">
            <Select.List>
              {options.map((o) => (
                <Select.Item
                  key={o.value || "__all__"}
                  value={o.value}
                  className="flex cursor-default items-center gap-2 px-3 py-2 outline-none data-[highlighted]:bg-slate-100 data-[selected]:font-semibold"
                >
                  <Select.ItemIndicator className="flex w-4 justify-center">
                    <Check className="size-3.5" />
                  </Select.ItemIndicator>
                  {/* Reserves the tick's width on unselected rows so the labels
                      line up instead of shifting as the selection moves. */}
                  {value !== o.value && <span aria-hidden className="w-4" />}
                  <Select.ItemText>{o.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
