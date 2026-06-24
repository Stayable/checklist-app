"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function ReportFilters({
  children,
  pdfHref,
}: {
  children?: React.ReactNode;
  pdfHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
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
      {children}
      <a
        href={`${pdfHref}?${params.toString()}`}
        className="ml-auto rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
      >
        Export PDF
      </a>
    </div>
  );
}
