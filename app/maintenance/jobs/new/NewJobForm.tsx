"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trade } from "@prisma/client";
import { DESCRIPTION_MAX, ROOM_LABEL_MAX, TRADES_ORDERED, tradeLabel } from "@/lib/contractors";
import { createJob } from "../actions";

type PropertyOption = { id: string; shortCode: string; name: string };

export function NewJobForm({
  properties,
  defaultPropertyId,
  defaultScheduledFor,
}: {
  properties: PropertyOption[];
  defaultPropertyId: string;
  defaultScheduledFor: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [propertyId, setPropertyId] = useState(defaultPropertyId);
  const [trade, setTrade] = useState<Trade>(Trade.GENERAL);
  const [roomLabel, setRoomLabel] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  // A native date input emits dashed "yyyy-MM-dd" — exactly the shape
  // createJobSchema accepts, and an empty string when cleared.
  const [scheduledFor, setScheduledFor] = useState(defaultScheduledFor);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createJob({
        propertyId,
        trade,
        description,
        roomLabel: roomLabel.trim() ? roomLabel.trim() : undefined,
        urgent,
        scheduledFor: scheduledFor ? scheduledFor : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/maintenance/jobs/${res.id}`);
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {error && <div className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Property</span>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.shortCode} — {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Trade</span>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value as Trade)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          >
            {TRADES_ORDERED.map((t) => (
              <option key={t} value={t}>
                {tradeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Where (optional)</span>
          <input
            value={roomLabel}
            maxLength={ROOM_LABEL_MAX}
            onChange={(e) => setRoomLabel(e.target.value)}
            placeholder="Rm 212, lobby, roof…"
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Scheduled date</span>
          <input
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
          <span className="text-xs text-slate-500">
            Leave blank to add this to the unscheduled backlog. Date only — no time of day.
          </span>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">What needs doing</span>
          <textarea
            value={description}
            maxLength={DESCRIPTION_MAX}
            rows={4}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
        Urgent
      </label>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Create job
        </button>
        <button
          onClick={() => router.back()}
          disabled={pending}
          className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Creating a job schedules it here. Nothing is sent to the contractor from this app.
      </p>
    </div>
  );
}
