"use client";

import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";

// One dropdown for the whole app.
//
// Native <select> is not usable here. Chrome on Windows draws the popup with
// the OS widget, so neither `font-family` nor padding on <option> reaches it —
// the list rendered in Times with its own spacing while the closed control was
// Nunito. A CSS fix was shipped, confirmed live, and ignored. Owning the
// rendering is the only way to control either, so this wraps Base UI's Select:
// a real listbox in our own DOM, with keyboard nav, typeahead and ARIA already
// handled.
//
// Spacing is deliberately tight (py-1 on a 14px line): these lists are up to
// ~9 properties or a roster of people, and at py-2 a short list looked padded
// out and a long one needed scrolling that it did not need.

export type SelectOption = { value: string; label: string };

export function SelectField({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  disabled,
  className,
  triggerClassName,
}: {
  value: string;
  options: SelectOption[];
  onChange: (next: string) => void;
  ariaLabel: string;
  /** Shown when `value` matches no option — e.g. an unchosen "Assign to". */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const selected = options.find((o) => o.value === value);

  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      // Base UI types an item value as unknown, since it may be any
      // serialisable thing; ours are always strings.
      onValueChange={(next) => onChange(String(next ?? ""))}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={
          triggerClassName ??
          `flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50 focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400 ${className ?? ""}`
        }
      >
        <BaseSelect.Value className="truncate">
          {selected ? (
            selected.label
          ) : (
            <span className="text-slate-400">{placeholder ?? "Select…"}</span>
          )}
        </BaseSelect.Value>
        <BaseSelect.Icon>
          <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        {/* Portalled to <body>, which sits inside the font-variable class on
            <html> — so the popup inherits Nunito, which is the entire point. */}
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-900 shadow-lg">
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item
                  key={o.value || "__empty__"}
                  value={o.value}
                  className="flex cursor-default items-center gap-1.5 py-1 pl-2 pr-3 outline-none data-[highlighted]:bg-slate-100 data-[selected]:font-semibold"
                >
                  {/* Fixed-width slot so labels align whether or not the row is
                      the selected one — without it the list shifts sideways as
                      the tick moves. */}
                  <span className="flex w-4 shrink-0 justify-center">
                    <BaseSelect.ItemIndicator>
                      <Check className="size-3.5" />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText>{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
