"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/reports/completeness", label: "Daily completeness" },
  { href: "/reports/issues", label: "Issues found" },
];

export function ReportsNav() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm font-medium ${active ? "border-b-2 border-navy text-navy" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
