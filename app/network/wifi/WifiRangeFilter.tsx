"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { DEFAULT_RANGE, RANGE_OPTIONS } from "@/lib/network/wifi-range";
import { SelectField } from "@/components/ui/select";

// Date-range selector for the WiFi page (Kate's request, 2026-07-29).
//
// Applies to REVENUE only, and the page says so. Spotipo's API silently ignores
// date parameters — verified: start_date/end_date and from/to all return an
// identical total_count — so a range that claimed to filter guest counts would be
// lying. Stripe's created[gte]/created[lte] genuinely filter, so revenue is
// honestly range-able.

export function WifiRangeFilter() {
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
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-sm text-slate-600">
        Revenue period
        <div className="mt-1">
          <SelectField
            ariaLabel="Revenue period"
            value={current}
            onChange={pick}
            options={RANGE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          />
        </div>
      </label>
      <p className="pb-1.5 text-xs text-slate-400">
        Applies to revenue only — Spotipo ignores date filters, so guest counts stay lifetime
        totals.
      </p>
    </div>
  );
}
