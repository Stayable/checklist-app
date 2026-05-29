import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/rbac";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Admin — Stayable Operations",
};

// Admin console shell. English-only (ADR-013). Guards ADMIN at the layout level
// so every /admin/* route is protected in one place.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const tabs = [
    { href: "/admin/users", label: "Users" },
    { href: "/admin/properties", label: "Properties" },
    { href: "/admin/templates", label: "Templates" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-sm font-bold text-slate-900">
              Stayable Ops <span className="font-normal text-slate-400">/ Admin</span>
            </Link>
            <nav className="flex gap-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
