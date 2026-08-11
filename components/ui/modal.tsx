"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

// Centered modal dialog. Same mechanics as components/shell/MobileSheet: closes
// on Escape and on backdrop click, and moves focus into the panel so a keyboard
// or screen-reader user lands on what just opened instead of staying behind it.
//
// Deliberately not a <dialog> element: showModal() has to be driven from an
// effect, which fights React's declarative open/closed state and leaves the
// element out of sync when the tree re-renders. A plain overlay with the right
// ARIA is less machinery for the same behaviour.

export function Modal({
  title,
  subtitle,
  onClose,
  onBack,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** When set, renders a back arrow — used to return to the day list from a job. */
  onBack?: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-slate-900/40"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl outline-none sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back"
                className="mt-0.5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold text-navy">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
