"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trade } from "@prisma/client";
import { ALL_TRADES, tradeLabel } from "@/lib/contractors";
import { PROBLEM_MAX, ROOM_LABEL_MAX } from "@/lib/contractor-jobs";
import { createContractorJob } from "../actions";

type Property = { id: string; shortCode: string; name: string };

export function NewJobForm({
  properties,
  defaultPropertyId,
}: {
  properties: Property[];
  defaultPropertyId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [trade, setTrade] = useState<Trade>(Trade.PLUMBING);
  const [roomLabel, setRoomLabel] = useState("");
  const [problem, setProblem] = useState("");
  const [urgent, setUrgent] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createContractorJob({ propertyId, trade, roomLabel, problem, urgent });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Straight to the detail page: that's where photos get added and where the
      // contractor gets assigned, so it's the next thing the dispatcher needs.
      router.push(`/dispatch/${res.id}`);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex max-w-2xl flex-col gap-4 rounded-lg bg-white p-5 ring-1 ring-slate-200"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Property
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            required
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortCode} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Trade
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value as Trade)}
            className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            required
          >
            {ALL_TRADES.map((t) => (
              <option key={t} value={t}>
                {tradeLabel(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="text-sm font-medium text-slate-700">
        Where <span className="font-normal text-slate-400">(room, area — free text)</span>
        <input
          value={roomLabel}
          onChange={(e) => setRoomLabel(e.target.value)}
          maxLength={ROOM_LABEL_MAX}
          placeholder="Rm 212, lobby, roof…"
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
        />
      </label>

      <label className="text-sm font-medium text-slate-700">
        Problem
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          maxLength={PROBLEM_MAX}
          rows={4}
          placeholder="What's wrong? This text goes to the contractor."
          className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
          required
        />
      </label>

      <label className="flex items-start gap-3 rounded-md bg-red-50 p-3 ring-1 ring-red-200">
        <input
          type="checkbox"
          checked={urgent}
          onChange={(e) => setUrgent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
        />
        <span className="text-sm">
          <span className="font-semibold text-red-900">Urgent / emergency</span>
          <span className="block text-red-800">
            Sorts to the top of the dispatch queue. Use for no water, no power, no hot water, or
            anything a guest cannot wait on.
          </span>
        </span>
      </label>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || problem.trim().length === 0}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create job"}
        </button>
        <span className="text-xs text-slate-500">
          Photos and the contractor are added on the next screen.
        </span>
      </div>
    </form>
  );
}
