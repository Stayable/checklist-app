"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DEFAULT_RANGE, RANGE_OPTIONS } from "@/lib/network/wifi-range";

// Date range for the network dashboard (Kyle 2026-08-01).
//
// Reuses the WiFi page's range helper — same option set, so "30d" means the
// same thing on both screens. The module is still named wifi-range.ts because
// that is where it was born; the logic is plain date arithmetic with nothing
// WiFi-specific in it.
//
// Scope is stated in the UI on purpose: this filters RESOLVED work only. Open
// tickets and device status are present-tense, and a historical window applied
// to "what is broken right now" would produce a confidently wrong number.

export function DashboardRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("range") ?? DEFAULT_RANGE;

  function pick(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === DEFAULT_RANGE) next.delete("range");
    else next.set("range", value);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <label className="text-sm text-slate-600">
      Resolved-work period
      <select
        value={current}
        onChange={(e) => pick(e.target.value)}
        className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        {RANGE_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
