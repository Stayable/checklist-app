"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CompletionCheck } from "@prisma/client";
import { setCompletionCheck } from "../actions";

// S1 completion check (Q1): manager's manual Pass/Fail in the review left rail,
// with the auto-derived hint shown beside it. English-only manager surface.

export function CompletionCheckControl({
  instanceId,
  current,
  hint,
  disabled,
}: {
  instanceId: string;
  current: CompletionCheck | null;
  hint: CompletionCheck;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (value: CompletionCheck) => {
    if (value === current) return;
    setError(null);
    startTransition(async () => {
      const res = await setCompletionCheck(instanceId, value);
      if (!res.ok) setError(res.error ?? "Action failed.");
      else router.refresh();
    });
  };

  const btn = (value: CompletionCheck, activeClass: string) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
      current === value
        ? activeClass
        : "border border-slate-300 text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Completion check
      </h2>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => set(CompletionCheck.PASS)}
          className={btn(CompletionCheck.PASS, "bg-emerald-600 text-white")}
        >
          Pass
        </button>
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => set(CompletionCheck.FAIL)}
          className={btn(CompletionCheck.FAIL, "bg-red-600 text-white")}
        >
          Fail
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Suggested: <span className="font-semibold">{hint}</span>
        {current == null && " · not set"}
      </p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
