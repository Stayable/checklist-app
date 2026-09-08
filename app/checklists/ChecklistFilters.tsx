"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { InstanceStatus } from "@prisma/client";
import { SelectField } from "@/components/ui/select";

// Filters for the checklist index. Same shape as CompletedFilters: the URL is
// the source of truth, so every control reads `value` from the params rather
// than holding its own state — Back then restores the view it looked like.

const STATUS_OPTIONS = [
  // "" is the default view, not a missing value: outstanding work only.
  { value: "", label: "Open (not yet submitted)" },
  { value: "all", label: "All statuses" },
  ...Object.values(InstanceStatus).map((s) => ({
    value: s,
    label: s.replace(/_/g, " "),
  })),
];

export function ChecklistFilters() {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any filter change invalidates the page cursor; keeping it would show
    // "page 3" of a two-page result and read as an empty property.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/checklists?${qs}` : "/checklists");
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-600">
        Status
        <div className="mt-1 min-w-56">
          <SelectField
            ariaLabel="Status"
            value={params.get("status") ?? ""}
            onChange={(next) => set("status", next)}
            options={STATUS_OPTIONS}
          />
        </div>
      </label>
      <label className="text-sm text-slate-600">
        Scheduled from
        <input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm text-slate-600">
        To
        <input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}
