"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { REASON_LABELS } from "@/lib/invalidation";
import type { InvalidationReason } from "@prisma/client";
import { decideInvalidation } from "../checklists/[id]/invalidate.action";

// Pending close-out requests, shown above the review tabs.
//
// Not a status tab. A pending request is still ASSIGNED work, so it has no
// status of its own — see the migration note on why adding one would silently
// redefine every existing `status: { in: [...] }` filter in the app. English
// only: this is a manager surface (ADR-013).

export type CloseOutRequestRow = {
  instanceId: string;
  label: string;
  shortCode: string;
  requestedBy: string;
  requestedAt: string;
  reasonCode: InvalidationReason | null;
  note: string | null;
};

export function CloseOutRequests({ rows }: { rows: CloseOutRequestRow[] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // Render nothing at all when the queue is empty. An empty panel headed
  // "Close-out requests" reads as a feature that is broken rather than idle.
  if (rows.length === 0) return null;

  function decide(instanceId: string, approve: boolean, note?: string) {
    setError(null);
    startTransition(async () => {
      const res = await decideInvalidation({ instanceId, approve, note });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDeclining(null);
      setDeclineNote("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <h2 className="text-sm font-bold text-amber-900">
        Close-out requests ({rows.length})
      </h2>
      <p className="mt-0.5 text-xs text-amber-800">
        Staff asked to close these without completing them. Approving removes the
        checklist from the completion rate; declining hands it back to them.
      </p>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.instanceId} className="rounded-lg border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/checklists/${r.instanceId}`}
                  className="text-sm font-semibold text-slate-900 underline"
                >
                  {r.label}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500">
                  {r.shortCode} · {r.requestedBy} · {r.requestedAt}
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  <span className="font-semibold">
                    {r.reasonCode ? REASON_LABELS[r.reasonCode] : "No reason given"}
                  </span>
                  {r.note ? ` — ${r.note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(r.instanceId, true)}
                  className="rounded-lg bg-navy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setDeclining((cur) => (cur === r.instanceId ? null : r.instanceId))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  {declining === r.instanceId ? "Cancel" : "Decline"}
                </button>
              </div>
            </div>

            {declining === r.instanceId && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                <input
                  type="text"
                  value={declineNote}
                  onChange={(e) => setDeclineNote(e.target.value)}
                  maxLength={500}
                  placeholder="Why? (sent to them)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide(r.instanceId, false, declineNote)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Send decline
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
