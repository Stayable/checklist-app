"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NOTE_BODY_MAX } from "@/lib/contractors";
import { appendDailyNote } from "./actions";

type PropertyOption = { id: string; shortCode: string; name: string };

// The portfolio-wide option is a real <option> rather than a checkbox, and it
// exists ONLY for portfolio roles. A scoped manager therefore always has a
// concrete property selected: getCurrentPropertyId returns null for a
// multi-property manager with no picker selection, and defaulting that to
// "portfolio-wide" would send them into a write the server correctly refuses.

const PORTFOLIO = "__portfolio__";

export function DailyNoteComposer({
  forDate,
  properties,
  defaultPropertyId,
  canPostPortfolioWide,
}: {
  forDate: string;
  properties: PropertyOption[];
  defaultPropertyId: string | null;
  canPostPortfolioWide: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string>(
    defaultPropertyId ?? (canPostPortfolioWide ? PORTFOLIO : (properties[0]?.id ?? PORTFOLIO)),
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await appendDailyNote({
        body,
        propertyId: target === PORTFOLIO ? null : target,
        forDate,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        Add a written entry
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Entries are append-only. Once posted, an entry cannot be edited or deleted.
      </p>

      {error && <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Applies to</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5"
        >
          {canPostPortfolioWide && <option value={PORTFOLIO}>All properties (portfolio)</option>}
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.shortCode} — {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-2 flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Entry</span>
        <textarea
          value={body}
          maxLength={NOTE_BODY_MAX}
          rows={3}
          onChange={(e) => setBody(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5"
        />
      </label>

      <button
        onClick={submit}
        disabled={pending || body.trim().length === 0}
        className="mt-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        Post entry
      </button>
    </div>
  );
}
