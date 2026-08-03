// components/shell/SectionFlyout.tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { isNavItemActive, type NavSection } from "@/lib/nav";
import { NavIcon } from "./NavIcon";
import { SoonChip } from "./SidebarRail";

// One icon in the collapsed rail, plus the panel of children it opens.
//
// Opens on hover, focus AND click. Hover alone would strand keyboard users and
// touch-capable laptops, which is most of the office. Escape closes and returns
// focus to the trigger.
export function SectionFlyout({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const containsActive = section.children
    ? section.children.some((c) => isNavItemActive(c.href, pathname))
    : section.href
      ? isNavItemActive(section.href, pathname)
      : false;

  const iconClasses = `flex h-9 w-9 items-center justify-center rounded-lg transition ${
    containsActive ? "bg-white/15 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"
  }`;

  // Leaf section: navigate straight there, with the label as a tooltip.
  if (!section.children) {
    return (
      <Link
        href={section.href ?? "/"}
        title={section.unbuilt ? `${section.label} — not built yet` : section.label}
        aria-label={section.label}
        aria-current={containsActive ? "page" : undefined}
        className={`${iconClasses} mx-auto`}
      >
        <NavIcon name={section.icon} className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        // Only close when focus leaves the trigger AND the panel.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={section.label}
        title={section.label}
        className={`${iconClasses} mx-auto`}
      >
        <NavIcon name={section.icon} className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-full top-0 z-50 pl-2">
          <div className="min-w-44 rounded-xl border border-white/10 bg-navy p-2 shadow-xl">
            <p className="flex items-center gap-2 px-2 pb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
              {section.label}
              {section.unbuilt && <SoonChip />}
            </p>
            {section.children.map((child) => {
              const active = isNavItemActive(child.href, pathname);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`block truncate rounded-lg px-2 py-1.5 text-sm transition ${
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
        </div>
      )}
    </div>
  );
}
