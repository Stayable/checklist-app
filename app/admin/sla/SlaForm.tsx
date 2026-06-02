"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IssuePriority } from "@prisma/client";
import { saveSlaDefaults } from "./actions";

const ORDER: IssuePriority[] = [
  IssuePriority.URGENT,
  IssuePriority.HIGH,
  IssuePriority.MEDIUM,
  IssuePriority.LOW,
];

export function SlaForm({
  initial,
  seeded,
}: {
  initial: Record<IssuePriority, number>;
  seeded: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await saveSlaDefaults({ hours: values });
      if (!result.ok) setError(result.error);
      else {
        setMessage("Saved.");
        router.refresh();
      }
    });
  };

  return (
    <div className="max-w-md rounded-xl border border-slate-200 bg-white p-5">
      {!seeded && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Defaults are not saved to the database yet — showing placeholders. Save to persist.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {ORDER.map((p) => (
          <label key={p} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold text-slate-700">{p}</span>
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={values[p]}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [p]: Math.max(1, Number(e.target.value) || 1) }))
                }
                className="w-24 rounded-lg border border-slate-300 p-2 text-right text-sm"
              />
              <span className="text-slate-500">hours</span>
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-600">{message}</p>}
      <button
        onClick={save}
        disabled={pending}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save defaults"}
      </button>
    </div>
  );
}
