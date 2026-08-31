// components/shell/ShellChrome.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User } from "lucide-react";
import {
  NAV_COLLAPSED_COOKIE,
  mobileSectionsForRole,
  shouldHideShell,
  type NavSection,
} from "@/lib/nav";
import type { PickerProperty } from "@/lib/rbac";
import { allPropertiesLabel } from "@/lib/property-picker";
import { PropertyPicker } from "@/components/PropertyPicker";
import { OnlineStatus } from "@/components/OnlineStatus";
import { SignOutButton } from "@/components/SignOutButton";
import { SidebarRail } from "./SidebarRail";
import { MobileTabBar } from "./MobileTabBar";

// Responsive app chrome. Desktop (lg+): collapsible navy rail + content.
// Mobile (<lg): bottom section bar + sheet. Hidden entirely on auth/standalone
// routes so /login etc. render bare.
//
// Restructured 2026-08-03: this file used to render every piece of nav inline.
// It now composes SidebarRail / SectionFlyout / MobileTabBar / MobileSheet and
// owns only the layout and the collapse state.
export function ShellChrome({
  name,
  role,
  sections,
  properties,
  currentPropertyId,
  showPicker,
  initialCollapsed,
  children,
}: {
  name: string;
  role: Parameters<typeof mobileSectionsForRole>[0];
  sections: NavSection[];
  properties: PickerProperty[];
  currentPropertyId: string | null;
  showPicker: boolean;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  if (shouldHideShell(pathname)) return <>{children}</>;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // Persist so the server can render the correct width on the next request.
    document.cookie = `${NAV_COLLAPSED_COOKIE}=${next ? "1" : "0"}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; samesite=lax`;
  }

  const activeProperty = properties.find((p) => p.id === currentPropertyId);
  // No active property now means the deliberate all-scope selection, not "unset"
  // — so the collapsed rail says ALL rather than the old "··" placeholder.
  const allScopeLabel = allPropertiesLabel(role, properties.length);

  const footer = (
    <div className="flex flex-col gap-3 px-2">
      {/* The account link used to be the user's NAME alone, which reads as a
          label rather than a destination — Kyle couldn't find where to change a
          password (2026-07-31). Name still shown, with an explicit sub-label. */}
      <Link href="/profile" className="flex items-center gap-2 truncate text-sm hover:text-slate-200">
        <User className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block truncate text-xs font-normal text-slate-400">
            Profile &amp; password
          </span>
        </span>
      </Link>
      {showPicker && (
        <PropertyPicker properties={properties} current={currentPropertyId} role={role} />
      )}
      <div className="flex items-center justify-between">
        <OnlineStatus />
        <SignOutButton />
      </div>
    </div>
  );

  // 56px has no room for a <select>, so the picker becomes the active property's
  // 2-letter short code — canonical across the platform (ADR-011), so it reads
  // as an abbreviation rather than a mystery glyph. Clicking expands the rail,
  // where the real picker lives; that beats a popover that would need its own
  // focus management for a control used a few times a day.
  const collapsedFooter = (
    <div className="flex flex-col items-center gap-3">
      <Link href="/profile" aria-label="Profile and password" title={name} className="text-slate-300 hover:text-white">
        <User className="h-5 w-5" />
      </Link>
      {showPicker && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={
            activeProperty ? `${activeProperty.shortCode} — ${activeProperty.name}` : allScopeLabel
          }
          aria-label={
            activeProperty
              ? `Property ${activeProperty.name}. Expand navigation to change.`
              : `${allScopeLabel}. Expand navigation to change.`
          }
          className="rounded-lg bg-white/10 px-1.5 py-1 text-xs font-bold text-white hover:bg-white/20"
        >
          {activeProperty?.shortCode ?? "ALL"}
        </button>
      )}
      <OnlineStatus />
      <SignOutButton />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      <SidebarRail
        sections={sections}
        pathname={pathname}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        footer={footer}
        collapsedFooter={collapsedFooter}
      />

      <div className={`flex min-h-screen w-full flex-col ${collapsed ? "lg:pl-14" : "lg:pl-60"}`}>
        {/* Mobile top bar (picker + sign out live here on small screens) */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:hidden">
          <Link href="/" className="text-base font-extrabold text-navy">
            StayCheck
          </Link>
          <div className="flex items-center gap-2">
            <OnlineStatus />
            {showPicker && (
              <PropertyPicker
                properties={properties}
                current={currentPropertyId}
                role={role}
              />
            )}
            <Link href="/profile" aria-label="Profile" className="text-navy">
              <User className="h-5 w-5" />
            </Link>
            <SignOutButton />
          </div>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-8 lg:pb-10">
          {children}
        </main>

        <MobileTabBar sections={mobileSectionsForRole(role)} pathname={pathname} />
      </div>
    </div>
  );
}
