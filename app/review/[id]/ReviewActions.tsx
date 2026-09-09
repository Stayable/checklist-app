"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CompletionCheck, InstanceStatus } from "@prisma/client";
import { NoteDialog } from "../ReviewQueueClient";
import {
  approveSubmission,
  flagSubmission,
  unlockSubmission,
  verifySubmission,
} from "../actions";

// Left-rail action buttons for the single-submission review (ADR-011 + S1).
//
// The flow Kyle specified 2026-09-10 is a GATE, not a sidebar: the manager sets
// the completion check (Pass/Fail) in the Completion check card above, and only
// then are the two outcomes — Closed / Flag — available. Both buttons stay
// disabled until the check is set, with a line saying why: a disabled button
// with no explanation reads as broken software, not as a rule.
//
// Outcome matrix (enforced server-side too — see ../actions.ts):
//   PASS + Closed → note optional, taken inline from the textarea below,
//                   silent unless "Notify staff" is ticked
//   FAIL + Closed → note REQUIRED, so it goes through the popup, always notifies
//   any  + Flag   → note REQUIRED, popup with an Issue priority, always notifies
//
// SUBMITTED/FLAGGED → Closed / Flag. REVIEWED → Verify (PM sign-off + lock).
// Locked → read-only, with an admin-only Unlock. English-only manager surface
// (ADR-013). Request Re-do was removed 2026-09-09 — see ../actions.ts.

export function ReviewActions({
  instanceId,
  status,
  locked,
  isAdmin,
  completionCheck,
}: {
  instanceId: string;
  status: InstanceStatus;
  locked: boolean;
  isAdmin: boolean;
  /** The manager's Pass/Fail, or null when they have not set it yet. */
  completionCheck: CompletionCheck | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flagOpen, setFlagOpen] = useState(false);
  const [failCloseOpen, setFailCloseOpen] = useState(false);
  const [note, setNote] = useState("");
  const [notifyStaff, setNotifyStaff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else {
        setFlagOpen(false);
        setFailCloseOpen(false);
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
  const checkSet = completionCheck != null;
  const failing = completionCheck === CompletionCheck.FAIL;
  const gated = reviewable && !checkSet;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
      {gated && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          Mark this submission Pass or Fail in the Completion check above before you close or
          flag it.
        </p>
      )}
      {/* One note for the WHOLE submission (`managerNote`), not per question —
          Kyle: "the note as a whole for the Submission". Only reachable for the
          outcomes where a note is optional; a required reason is collected in
          the popup instead, so there is exactly one field in play at a time. */}
      <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="manager-note">
        Note on this submission
      </label>
      <textarea
        id="manager-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder={
          canVerify ? "Optional — applies to the whole submission" : "Optional for a Pass"
        }
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
              disabled={pending || !checkSet}
              aria-label="Close this submission"
              title={
                gated ? "Set the completion check (Pass or Fail) first" : "Close this submission"
              }
              onClick={() => {
                // A Fail needs a reason, so it detours through the popup; a
                // Pass can go straight out with the inline note.
                if (failing) setFailCloseOpen(true);
                else
                  run(() =>
                    approveSubmission(instanceId, {
                      completionCheck: CompletionCheck.PASS,
                      note,
                      notifyStaff,
                    }),
                  );
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Closed
            </button>
            {status === InstanceStatus.SUBMITTED && (
              <button
                disabled={pending || !checkSet}
                aria-label="Flag this submission"
                title={
                  gated ? "Set the completion check (Pass or Fail) first" : "Flag this submission"
                }
                onClick={() => setFlagOpen(true)}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Flag
              </button>
            )}
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

      {failCloseOpen && (
        <NoteDialog
          title="Closed — Fail"
          requireNote
          pending={pending}
          onCancel={() => setFailCloseOpen(false)}
          onConfirm={({ note: dialogNote }) =>
            run(() =>
              approveSubmission(instanceId, {
                completionCheck: CompletionCheck.FAIL,
                note: dialogNote,
              }),
            )
          }
        />
      )}

      {flagOpen && (
        <NoteDialog
          title="Flag this submission"
          showPriority
          requireNote
          pending={pending}
          onCancel={() => setFlagOpen(false)}
          onConfirm={({ note: dialogNote, priority }) =>
            run(() =>
              flagSubmission(instanceId, {
                // Whatever the manager set in the gate travels with the flag,
                // so the check and the outcome are one audited write.
                completionCheck: completionCheck ?? undefined,
                note: dialogNote,
                priority,
              }),
            )
          }
        />
      )}
    </div>
  );
}
