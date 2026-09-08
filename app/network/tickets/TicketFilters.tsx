"use client";

import { SelectField } from "@/components/ui/select";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TicketType } from "@prisma/client";
import { DEVICE_TYPE_OPTIONS } from "@/lib/network/device-type";

// Type/property/date-range filters for /network/tickets. URL-driven (same
// approach as CompletedFilters / ReportFilters) so a
// filtered view is shareable and survives a refresh. The status tabs above
// this component stay Link-based (pre-existing behavior) — this covers the
// filters added alongside them. Every setParam call only ever touches its own
// key, so it composes with the status tabs and with sort/dir without
// clobbering them.

const TICKET_TYPE_OPTIONS = Object.values(TicketType).map((t) => ({
  value: t,
  label: t.replace(/_/g, " "),
}));

export type PropertyOption = { id: string; shortCode: string };

export function TicketFilters({ properties }: { properties: PropertyOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-sm text-slate-600">
        Type
        <div className="mt-1">
          <SelectField
            ariaLabel="Type"
            value={params.get("type") ?? ""}
            onChange={(next) => setParam("type", next)}
            options={[{ value: "", label: "All types" }, ...TICKET_TYPE_OPTIONS]}
          />
        </div>
      </label>

      <label className="text-sm text-slate-600">
        Property
        <div className="mt-1">
          <SelectField
            ariaLabel="Property"
            value={params.get("property") ?? ""}
            onChange={(next) => setParam("property", next)}
            options={[{ value: "", label: "All properties" }, ...properties.map((p) => ({ value: p.id, label: p.shortCode }))]}
          />
        </div>
      </label>

      <label className="text-sm text-slate-600">
        Device type
        <div className="mt-1">
          <SelectField
            ariaLabel="Device type"
            value={params.get("deviceType") ?? ""}
            onChange={(next) => setParam("deviceType", next)}
            options={[{ value: "", label: "All devices" }, ...DEVICE_TYPE_OPTIONS]}
          />
        </div>
      </label>

      <label className="text-sm text-slate-600">
        From
        <input
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>

      <label className="text-sm text-slate-600">
        To
        <input
          type="date"
          defaultValue={params.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}
