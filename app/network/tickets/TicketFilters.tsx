"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { TicketType } from "@prisma/client";
import { DEVICE_TYPE_OPTIONS } from "@/lib/network/device-type";

// Type/property/date-range filters for /network/tickets. URL-driven (same
// approach as DispatchFilters / CompletedFilters / ReportFilters) so a
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
        <select
          defaultValue={params.get("type") ?? ""}
          onChange={(e) => setParam("type", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All types</option>
          {TICKET_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-slate-600">
        Property
        <select
          defaultValue={params.get("property") ?? ""}
          onChange={(e) => setParam("property", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.shortCode}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-slate-600">
        Device type
        <select
          defaultValue={params.get("deviceType") ?? ""}
          onChange={(e) => setParam("deviceType", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">All devices</option>
          {DEVICE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
