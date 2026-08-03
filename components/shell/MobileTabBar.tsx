// components/shell/MobileTabBar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  isNavItemActive,
  sectionForPathname,
  type NavSection,
  type SectionId,
} from "@/lib/nav";
import { NavIcon } from "./NavIcon";
import { MobileSheet } from "./MobileSheet";

// Bottom bar carrying the same top-level sections as the desktop rail, so both
// breakpoints teach one structure. Admin is excluded upstream
// (mobileSectionsForRole), which also holds this at five items so it never
// scrolls.
//
// Renders nothing when there is only one section: field staff have a single
// destination, and a one-item bar is chrome that teaches nothing.
export function MobileTabBar({
  sections,
  pathname,
}: {
  sections: NavSection[];
  pathname: string;
}) {
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const activeSection = sectionForPathname(pathname);

  if (sections.length < 2) return null;

  const open = sections.find((s) => s.id === openSection) ?? null;

  return (
    <>
      {open?.children && (
        <MobileSheet
          section={open}
          pathname={pathname}
          onClose={() => setOpenSection(null)}
        />
      )}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {sections.map((section) => {
            const active =
              activeSection === section.id ||
              (section.href ? isNavItemActive(section.href, pathname) : false);
            const tone = active ? "text-navy" : "text-slate-400";

            // Leaf section navigates; a section with children opens the sheet.
            return section.children ? (
              <button
                key={section.id}
                type="button"
                onClick={() => setOpenSection(section.id)}
                aria-expanded={openSection === section.id}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tone}`}
              >
                <NavIcon name={section.icon} className="h-5 w-5" />
                <span className="truncate">{section.label}</span>
              </button>
            ) : (
              <Link
                key={section.id}
                href={section.href ?? "/"}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${tone}`}
              >
                <NavIcon name={section.icon} className="h-5 w-5" />
                <span className="truncate">{section.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
