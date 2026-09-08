"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SelectField } from "@/components/ui/select";

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
      {/* `value`, not `defaultValue`: the URL is the source of truth and an
          uncontrolled input drifts from it on Back. */}
      <div className="mt-1">
        <SelectField
          ariaLabel={label}
          value={params.get(paramKey) ?? ""}
          onChange={handleChange}
          options={[{ value: "", label: "All" }, ...options]}
        />
      </div>
    </label>
  );
}
