"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * A small client island that renders a <select> and pushes the chosen value
 * as a URL search param.  Used as a child of ReportFilters.
 */
export function ParamSelect({
  label,
  paramKey,
  options,
}: {
  label: string;
  paramKey: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function handleChange(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(paramKey, value);
    else next.delete(paramKey);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="text-sm text-slate-600">
      {label}
      <select
        defaultValue={params.get(paramKey) ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="mt-1 block rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
