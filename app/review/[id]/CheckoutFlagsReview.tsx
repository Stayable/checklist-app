"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CheckoutFlags } from "@/lib/checkout-flags";
import { saveCheckoutFlags } from "../actions";

// S1 checkout flags on the review detail (manager confirms / edits the
// staff-captured values, Q2=B). English-only manager surface (ADR-013). Locked
// (verified) instances are read-only. `placeOOO` room-lifecycle wiring is S2.

const LABELS: Record<"notifyCorporate" | "returnDeposit" | "itemsToReplace" | "placeOOO", string> = {
  notifyCorporate: "Notify corporate",
  returnDeposit: "Return deposit",
  itemsToReplace: "Items need replacing",
  placeOOO: "Place room out of order",
};

export function CheckoutFlagsReview({
  instanceId,
  initial,
  locked,
}: {
  instanceId: string;
  initial: CheckoutFlags;
  locked: boolean;
}) {
  const router = useRouter();
  const [flags, setFlags] = useState<CheckoutFlags>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof CheckoutFlags>(key: K, value: CheckoutFlags[K]) => {
    setSaved(false);
    setFlags((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveCheckoutFlags(instanceId, flags);
      if (!res.ok) setError(res.error ?? "Action failed.");
      else {
        setSaved(true);
        router.refresh();
      }
    });
  };

  const row = (key: keyof typeof LABELS) => (
    <label className="flex items-center gap-2 py-1 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={flags[key]}
        disabled={locked || pending}
        onChange={(e) => set(key, e.target.checked)}
        className="h-4 w-4 rounded border-slate-300"
      />
      {LABELS[key]}
    </label>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        Checkout flags
      </h2>
      {row("notifyCorporate")}
      {row("returnDeposit")}
      {row("itemsToReplace")}
      {flags.itemsToReplace && (
        <input
          type="text"
          value={flags.itemsToReplaceList}
          disabled={locked || pending}
          onChange={(e) => set("itemsToReplaceList", e.target.value)}
          placeholder="What needs replacing?"
          className="my-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}
      {row("placeOOO")}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      {!locked && (
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          {saved ? "Saved ✓" : "Save flags"}
        </button>
      )}
    </div>
  );
}
