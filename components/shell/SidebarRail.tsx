// components/shell/SidebarRail.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  isNavItemActive,
  sectionForPathname,
  type NavSection,
  type SectionId,
} from "@/lib/nav";
import { NavIcon } from "./NavIcon";
import { SectionFlyout } from "./SectionFlyout";

// Desktop rail. Two widths: 240px expanded, 56px collapsed. Collapsed shows
// icons only and opens a section's children as a flyout.
//
// The initial collapsed value comes from a cookie read on the SERVER (see
// AppShell) rather than from an effect: with a fixed sidebar, deciding width on
// the client paints the wrong one first and the whole page jumps on every
// navigation.
export function SidebarRail({
  sections,
  pathname,
  collapsed,
  onToggleCollapsed,
  footer,
  collapsedFooter,
}: {
  sections: NavSection[];
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  footer: React.ReactNode;
  collapsedFooter: React.ReactNode;
}) {
  const activeSection = sectionForPathname(pathname);

  // Which sections are expanded. Seeded from the active route — the route
  // already implies what you want open, so there is nothing extra to persist.
  const [open, setOpen] = useState<Set<SectionId>>(
    () => new Set(activeSection ? [activeSection] : []),
  );

  function toggle(id: SectionId) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <aside
      className={`hidden shrink-0 flex-col bg-navy py-4 text-white lg:flex lg:fixed lg:inset-y-0 ${
        collapsed ? "w-14 px-2" : "w-60 px-4"
      }`}
    >
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between px-2"}`}>
        {!collapsed && (
          <Link href="/" className="min-w-0">
            <span className="block truncate text-lg font-extrabold tracking-tight">
              StayCheck
            </span>
            <span className="block truncate text-xs text-slate-300">Stayable</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
          className="rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
        {sections.map((section) =>
          collapsed ? (
            <SectionFlyout key={section.id} section={section} pathname={pathname} />
          ) : (
            <ExpandedSection
              key={section.id}
              section={section}
              pathname={pathname}
              open={open.has(section.id)}
              onToggle={() => toggle(section.id)}
            />
          ),
        )}
      </nav>

      <div className="mt-4 border-t border-white/10 pt-4">
        {collapsed ? collapsedFooter : footer}
      </div>
    </aside>
  );
}

function ExpandedSection({
  section,
  pathname,
  open,
  onToggle,
}: {
  section: NavSection;
  pathname: string;
  open: boolean;
  onToggle: () => void;
}) {
  // Leaf section (Home, and the unbuilt placeholders): a plain link, no chevron.
  if (!section.children) {
    const active = section.href ? isNavItemActive(section.href, pathname) : false;
    return (
      <Link
        href={section.href ?? "/"}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          active ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <NavIcon name={section.icon} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{section.label}</span>
        {section.unbuilt && <SoonChip />}
      </Link>
    );
  }

  const containsActive = section.children.some((c) => isNavItemActive(c.href, pathname));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
          containsActive ? "text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        <NavIcon name={section.icon} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 pb-1 pl-6">
          {section.children.map((child) => {
            const active = isNavItemActive(child.href, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={active ? "page" : undefined}
                className={`truncate rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-white/15 font-semibold text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SoonChip() {
  return (
    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300">
      Soon
    </span>
  );
}
