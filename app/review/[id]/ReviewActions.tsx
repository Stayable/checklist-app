"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { InstanceStatus } from "@prisma/client";
import { NoteDialog } from "../ReviewQueueClient";
import {
  approveSubmission,
  flagSubmission,
  requestRedo,
  unlockSubmission,
  verifySubmission,
} from "../actions";

// Left-rail action buttons for the single-submission review (ADR-011 + S1).
// SUBMITTED/FLAGGED → Approve / Flag / Re-do. REVIEWED → Verify (PM sign-off +
// lock). Locked → read-only, with an admin-only Unlock. Approve + Verify take an
// optional note and a "notify staff" toggle (internal by default per S1);
// Flag/Re-do use the required-note dialog (Flag notifies by default; Re-do
// always notifies). English-only manager surface (ADR-013).

export function ReviewActions({
  instanceId,
  status,
  locked,
  isAdmin,
}: {
  instanceId: string;
  status: InstanceStatus;
  locked: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"flag" | "redo" | null>(null);
  const [note, setNote] = useState("");
  const [notifyStaff, setNotifyStaff] = useState(false);
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

  // Verified-and-locked: read-only, admin can unlock.
  if (locked) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
          ✓ Verified &amp; locked
        </p>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {isAdmin && (
          <button
            disabled={pending}
            onClick={() => run(() => unlockSubmission(instanceId))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Unlock (admin)
          </button>
        )}
      </div>
    );
  }

  const reviewable =
    status === InstanceStatus.SUBMITTED || status === InstanceStatus.FLAGGED;
  const canVerify = status === InstanceStatus.REVIEWED;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={canVerify ? "Manager note (optional for verify)" : "Manager note (optional for approve)"}
        className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
      />
      <label className="mb-3 flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={notifyStaff}
          onChange={(e) => setNotifyStaff(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Notify staff by email
      </label>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex flex-col gap-2">
        {reviewable && (
          <>
            <button
              disabled={pending}
              onClick={() => run(() => approveSubmission(instanceId, note, notifyStaff))}
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
          </>
        )}
        {canVerify && (
          <button
            disabled={pending}
            onClick={() => run(() => verifySubmission(instanceId, { note, notifyStaff }))}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Verify &amp; lock
          </button>
        )}
      </div>

      {dialog && (
        <NoteDialog
          title={dialog === "flag" ? "Flag this submission" : "Request a re-do"}
          showPriority={dialog === "flag"}
          showNotify={dialog === "flag"}
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={(dialogNote, priority, notifyStaff) =>
            run(() =>
              dialog === "flag"
                ? flagSubmission(instanceId, { note: dialogNote, priority, notifyStaff })
                : requestRedo(instanceId, dialogNote),
            )
          }
        />
      )}
    </div>
  );
}
