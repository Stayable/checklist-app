// components/shell/ShellChrome.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@prisma/client";
import { isNavItemActive, shouldHideShell, type NavItem } from "@/lib/nav";
import type { PickerProperty } from "@/lib/rbac";
import { PropertyPicker } from "@/components/PropertyPicker";
import { OnlineStatus } from "@/components/OnlineStatus";
import { SignOutButton } from "@/components/SignOutButton";

// Responsive app chrome. Desktop (lg+): fixed navy sidebar + content area.
// Mobile (<lg): bottom tab bar + content. Hidden entirely on auth/standalone
// routes so /login etc. render bare. Active state is pathname-driven.
export function ShellChrome({
  name,
  navItems,
  properties,
  currentPropertyId,
  showPicker,
  children,
}: {
  name: string;
  role: Role;
  navItems: NavItem[];
  properties: PickerProperty[];
  currentPropertyId: string | null;
  showPicker: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (shouldHideShell(pathname)) return <>{children}</>;

  const mainItems = navItems.filter((i) => i.group === "main");
  const adminItems = navItems.filter((i) => i.group === "admin");

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy px-4 py-6 text-white lg:flex lg:fixed lg:inset-y-0">
        <div className="px-2 text-lg font-extrabold tracking-tight">Stayable</div>
        <p className="mt-1 px-2 text-xs text-slate-300">Operations</p>

        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {mainItems.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
          {adminItems.length > 0 && (
            <>
              <p className="mt-6 px-3 text-xs font-bold uppercase tracking-wide text-slate-400">
                Admin
              </p>
              {adminItems.map((item) => (
                <SidebarLink key={item.href} item={item} pathname={pathname} />
              ))}
            </>
          )}
        </nav>

        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 px-2 pt-4">
          <span className="truncate text-sm font-semibold">{name}</span>
          {showPicker && (
            <PropertyPicker properties={properties} current={currentPropertyId} />
          )}
          <div className="flex items-center justify-between">
            <OnlineStatus />
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-h-screen w-full flex-col lg:pl-60">
        {/* Mobile top bar (picker + sign out live here on small screens) */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:hidden">
          <span className="text-base font-extrabold text-navy">Stayable</span>
          <div className="flex items-center gap-2">
            <OnlineStatus />
            {showPicker && (
              <PropertyPicker properties={properties} current={currentPropertyId} />
            )}
            <SignOutButton />
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-10">
          {children}
        </main>

        {/* Mobile bottom tab bar — main items only */}
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-stretch justify-around">
            {mainItems.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs font-semibold ${
                    active ? "text-navy" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isNavItemActive(item.href, pathname);
  return (
    <Link
      href={item.href}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {item.label}
    </Link>
  );
}
