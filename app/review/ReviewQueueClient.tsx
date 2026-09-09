"use client";

import { SelectField } from "@/components/ui/select";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { CompletionCheck, InstanceStatus, IssuePriority } from "@prisma/client";
import { formatMinutes } from "@/lib/review";
import { approveSubmission, flagSubmission } from "./actions";

// ADR-011 queue table: row-level Closed / Flag (Kyle 2026-09-10 — "Approve"
// became "Closed"; the server action and status keep their old names, see
// ./actions.ts).
//
// Both row actions open the dialog here, because both now need the manager's
// Pass/Fail before an outcome exists and the queue row has nowhere to put one:
// the detail page has the Completion check card, a table row does not. So the
// dialog collects it. Note is required whenever the outcome is Fail or Flag.
// Request Re-do was removed 2026-09-09 — see ./actions.ts.

export type QueueRow = {
  id: string;
  status: InstanceStatus;
  template: string;
  shortCode: string;
  user: string;
  date: string;
  unit: string | null;
  minutes: number | null;
  photoSlots: { prompt: string; count: number; thumbUrl: string | null }[];
};

type DialogState = { kind: "close" | "flag"; row: QueueRow } | null;

const STATUS_BADGE: Record<string, string> = {
  SUBMITTED: "bg-amber-50 text-amber-700",
  FLAGGED: "bg-red-50 text-red-700",
  REVIEWED: "bg-emerald-50 text-emerald-700",
};

export function ReviewQueueClient({ rows, filter }: { rows: QueueRow[]; filter: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState>(null);
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

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-400">
        Nothing {filter === "pending" ? "awaiting review" : `in “${filter}”`} right now.
      </div>
    );
  }

  const rowLabel = (row: QueueRow) => `${row.template}${row.unit ? ` Rm ${row.unit}` : ""}`;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      {error && (
        <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Checklist</th>
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Unit #</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Photos</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/review/${row.id}`} className="font-semibold text-slate-900 hover:underline">
                  {row.template}
                </Link>
                <span className="block text-xs text-slate-500">{row.shortCode}</span>
              </td>
              <td className="px-4 py-3 text-slate-700">{row.user}</td>
              <td className="px-4 py-3 text-slate-700">{row.date}</td>
              <td className="px-4 py-3 text-slate-700">{row.unit ?? "—"}</td>
              <td className="px-4 py-3 text-slate-700">{formatMinutes(row.minutes)}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  {row.photoSlots.length === 0 ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    row.photoSlots.map((slot, i) =>
                      slot.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not an optimizable asset
                        <img
                          key={i}
                          src={slot.thumbUrl}
                          alt={slot.prompt}
                          title={`${slot.prompt} — ${slot.count} photo${slot.count === 1 ? "" : "s"}`}
                          className="h-9 w-9 rounded border border-slate-200 object-cover"
                        />
                      ) : (
                        <span
                          key={i}
                          title={`${slot.prompt} — ${slot.count} captured${slot.count > 0 ? " (no upload — legacy)" : ""}`}
                          className={`flex h-9 w-9 items-center justify-center rounded border text-[10px] font-semibold ${
                            slot.count > 0
                              ? "border-slate-300 bg-slate-100 text-slate-600"
                              : "border-dashed border-slate-300 text-slate-300"
                          }`}
                        >
                          {slot.count > 0 ? `📷${slot.count}` : "—"}
                        </span>
                      ),
                    )
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                {row.status === InstanceStatus.REVIEWED ? (
                  <span className="block text-right text-xs text-slate-400">Done</span>
                ) : (
                  <div className="flex justify-end gap-1">
                    <button
                      disabled={pending}
                      aria-label={`Close ${rowLabel(row)}`}
                      onClick={() => setDialog({ kind: "close", row })}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Closed
                    </button>
                    {row.status === InstanceStatus.SUBMITTED && (
                      <button
                        disabled={pending}
                        aria-label={`Flag ${rowLabel(row)}`}
                        onClick={() => setDialog({ kind: "flag", row })}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Flag
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog?.kind === "close" && (
        <NoteDialog
          title={`Closed — ${rowLabel(dialog.row)}`}
          showCompletionCheck
          showNotify
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={({ note, notifyStaff, completionCheck }) =>
            run(() =>
              approveSubmission(dialog.row.id, {
                // `?? undefined` rather than `?? PASS`: Confirm is unreachable
                // without a choice, and if that ever breaks the server should
                // refuse the review, not invent a pass.
                completionCheck: completionCheck ?? undefined,
                note,
                notifyStaff,
              }),
            )
          }
        />
      )}

      {dialog?.kind === "flag" && (
        <NoteDialog
          title={`Flag — ${rowLabel(dialog.row)}`}
          showCompletionCheck
          showPriority
          requireNote
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={({ note, priority, completionCheck }) =>
            run(() =>
              flagSubmission(dialog.row.id, {
                completionCheck: completionCheck ?? undefined,
                note,
                priority,
              }),
            )
          }
        />
      )}
    </div>
  );
}

export type NoteDialogResult = {
  note: string;
  priority: IssuePriority;
  notifyStaff: boolean;
  completionCheck: CompletionCheck | null;
};

/**
 * The shared review popup. Collects, in the order the manager decides them:
 * Pass/Fail (when the caller has not already got one), the submission-level
 * note, and — for a flag — the Issue priority.
 *
 * Confirm is blocked until the dialog is answerable: a completion check when
 * one is asked for, and a note whenever the outcome is Fail or Flag. That is a
 * convenience, not the rule — ../actions.ts enforces the same two things.
 */
export function NoteDialog({
  title,
  showPriority = false,
  showNotify = false,
  showCompletionCheck = false,
  requireNote = false,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  /** Ask for an Issue priority (flag only — a close opens no Issue). */
  showPriority?: boolean;
  /** Offer the notify opt-in. Only meaningful for a Pass close; a Fail or a
   *  flag always notifies, and the dialog says so instead. */
  showNotify?: boolean;
  /** Ask for Pass/Fail here, for callers with no completion-check control of
   *  their own (the queue rows). */
  showCompletionCheck?: boolean;
  /** Note is required regardless of the completion check (flag). */
  requireNote?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (result: NoteDialogResult) => void;
}) {
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<IssuePriority>(IssuePriority.MEDIUM);
  const [notifyStaff, setNotifyStaff] = useState(false);
  const [completionCheck, setCompletionCheck] = useState<CompletionCheck | null>(null);

  const failing = completionCheck === CompletionCheck.FAIL;
  const mustNote = requireNote || failing;
  const alwaysNotifies = mustNote;
  const blocked =
    pending ||
    (mustNote && note.trim().length === 0) ||
    (showCompletionCheck && completionCheck == null);

  const checkBtn = (value: CompletionCheck, activeClass: string) =>
    `flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${
      completionCheck === value
        ? activeClass
        : "border border-slate-300 text-slate-700 hover:bg-slate-100"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 font-bold text-slate-900">{title}</h2>
        {showCompletionCheck && (
          <div className="mb-3">
            <p className="mb-1 text-xs font-semibold text-slate-600">Completion check</p>
            <div className="flex gap-2" role="group" aria-label="Completion check">
              <button
                type="button"
                aria-pressed={completionCheck === CompletionCheck.PASS}
                onClick={() => setCompletionCheck(CompletionCheck.PASS)}
                className={checkBtn(CompletionCheck.PASS, "bg-emerald-600 text-white")}
              >
                Pass
              </button>
              <button
                type="button"
                aria-pressed={failing}
                onClick={() => setCompletionCheck(CompletionCheck.FAIL)}
                className={checkBtn(CompletionCheck.FAIL, "bg-red-600 text-white")}
              >
                Fail
              </button>
            </div>
            {completionCheck == null && (
              <p className="mt-1 text-xs text-amber-700">
                Mark Pass or Fail before you can confirm.
              </p>
            )}
          </div>
        )}
        <label className="mb-1 block text-xs font-semibold text-slate-600" htmlFor="review-note">
          Note on this submission
        </label>
        <textarea
          id="review-note"
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder={
            mustNote
              ? "Reason for the submitter (required)"
              : "Note for the submitter (optional)"
          }
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
        {showPriority && (
          <label className="mt-3 block text-sm text-slate-700">
            Issue priority
            <div className="mt-1">
              <SelectField
                ariaLabel="Issue priority"
                value={priority}
                onChange={(next) => setPriority(next as IssuePriority)}
                options={Object.values(IssuePriority).map((p) => ({ value: p, label: p }))}
              />
            </div>
          </label>
        )}
        {alwaysNotifies ? (
          // Not a toggle: the whole point of a fail or a flag is that the
          // person who did the work hears the reason.
          <p className="mt-3 text-xs text-slate-600">
            The submitter is emailed this reason automatically.
          </p>
        ) : (
          showNotify && (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={notifyStaff}
                onChange={(e) => setNotifyStaff(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Notify staff by email
            </label>
          )
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ note, priority, notifyStaff, completionCheck })}
            disabled={blocked}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
