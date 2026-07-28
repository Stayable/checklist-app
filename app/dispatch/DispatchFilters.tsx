"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

import { ALL_TRADES, tradeLabel } from "@/lib/contractors";
import { JOB_STATUS_ORDER, jobStatusLabel } from "@/lib/contractor-jobs";

// Queue filters for /dispatch. URL-driven (same approach as the reports and
// completed filters) so a filtered view is shareable and survives a refresh.
export function DispatchFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  const urgentOnly = params.get("urgent") === "1";

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-sm text-slate-600">
        Status
        <select
          defaultValue={params.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Open work</option>
          {JOB_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {jobStatusLabel(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-slate-600">
        Trade
        <select
          defaultValue={params.get("trade") ?? ""}
          onChange={(e) => setParam("trade", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All trades</option>
          {ALL_TRADES.map((t) => (
            <option key={t} value={t}>
              {tradeLabel(t)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 pb-1.5 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={urgentOnly}
          onChange={(e) => setParam("urgent", e.target.checked ? "1" : "")}
          className="h-4 w-4 rounded border-slate-300"
        />
        Urgent only
      </label>
    </div>
  );
}
