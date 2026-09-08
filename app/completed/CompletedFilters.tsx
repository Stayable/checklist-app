"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SelectField } from "@/components/ui/select";

export type AssigneeOpt = { id: string; name: string };

export function CompletedFilters({ assignees }: { assignees: AssigneeOpt[] }) {
  const router = useRouter();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/completed?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm text-slate-600">
        From
        <input
          type="date"
          defaultValue={params.get("from") ?? ""}
          onChange={(e) => set("from", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm text-slate-600">
        To
        <input
          type="date"
          defaultValue={params.get("to") ?? ""}
          onChange={(e) => set("to", e.target.value)}
          className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm text-slate-600">
        Assignee
        {/* `value`, not `defaultValue`: navigation re-renders this with the new
            params, so the URL is the source of truth and an uncontrolled input
            would drift from it on Back. */}
        <div className="mt-1">
          <SelectField
            ariaLabel="Assignee"
            value={params.get("assignee") ?? ""}
            onChange={(next) => set("assignee", next)}
            options={[
              { value: "", label: "All" },
              ...assignees.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
      </label>
    </div>
  );
}
