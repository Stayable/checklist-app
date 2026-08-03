// components/shell/MobileSheet.tsx
"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { isNavItemActive, type NavSection } from "@/lib/nav";
import { NavIcon } from "./NavIcon";

// The children of one section, as a bottom sheet. Closes on Escape, backdrop
// tap, or picking a destination.
export function MobileSheet({
  section,
  pathname,
  onClose,
}: {
  section: NavSection;
  pathname: string;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Move focus into the sheet so a keyboard or screen-reader user lands on the
    // thing that just opened rather than staying behind it on the tab bar.
    panelRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-slate-900/40"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={section.label}
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-navy">
            <NavIcon name={section.icon} className="h-4 w-4" />
            {section.label}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col p-2">
          {section.children?.map((child) => {
            const active = isNavItemActive(child.href, pathname);
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                  active ? "bg-slate-100 text-navy" : "text-slate-600"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
