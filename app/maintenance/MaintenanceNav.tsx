"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-nav for the Maintenance section, mirroring app/reports/ReportsNav.tsx.
// The rail already names these three; this is the in-page tab row so moving
// between them doesn't require the sidebar on a narrow screen.

const TABS = [
  { href: "/maintenance/schedule", label: "Schedule" },
  { href: "/maintenance/daily", label: "Daily" },
  { href: "/maintenance/contractors", label: "Contractors" },
];

export function MaintenanceNav() {
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
