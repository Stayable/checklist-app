"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InstanceStatus } from "@prisma/client";
import { NoteDialog } from "../ReviewQueueClient";
import { approveSubmission, flagSubmission, requestRedo } from "../actions";

// Left-rail action buttons for the single-submission review (ADR-011). Approve
// takes an optional note (uses the one typed below); Flag / Re-do require one.

export function ReviewActions({
  instanceId,
  status,
}: {
  instanceId: string;
  status: InstanceStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"flag" | "redo" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else {
        setDialog(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Manager note (optional for approve)"
        className="mb-3 w-full rounded-lg border border-slate-300 p-2 text-sm"
      />
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-2">
        <button
          disabled={pending}
          onClick={() => run(() => approveSubmission(instanceId, note))}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve
        </button>
        {status === InstanceStatus.SUBMITTED && (
          <button
            disabled={pending}
            onClick={() => setDialog("flag")}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Flag
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => setDialog("redo")}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Request re-do
        </button>
      </div>

      {dialog && (
        <NoteDialog
          title={dialog === "flag" ? "Flag this submission" : "Request a re-do"}
          showPriority={dialog === "flag"}
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={(dialogNote, priority) =>
            run(() =>
              dialog === "flag"
                ? flagSubmission(instanceId, { note: dialogNote, priority })
                : requestRedo(instanceId, dialogNote),
            )
          }
        />
      )}
    </div>
  );
}
