"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { InstanceStatus, IssuePriority } from "@prisma/client";
import { formatMinutes } from "@/lib/review";
import { approveSubmission, flagSubmission, requestRedo } from "./actions";

// ADR-011 queue table: row-level Approve / Flag / Request Re-do. Flag and Re-do
// open a note dialog (note required); Flag also picks an Issue priority.

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

type DialogState =
  | { kind: "flag"; row: QueueRow }
  | { kind: "redo"; row: QueueRow }
  | null;

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
                      onClick={() => run(() => approveSubmission(row.id))}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    {row.status === InstanceStatus.SUBMITTED && (
                      <button
                        disabled={pending}
                        onClick={() => setDialog({ kind: "flag", row })}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Flag
                      </button>
                    )}
                    <button
                      disabled={pending}
                      onClick={() => setDialog({ kind: "redo", row })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Re-do
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog && (
        <NoteDialog
          title={
            dialog.kind === "flag"
              ? `Flag — ${dialog.row.template}${dialog.row.unit ? ` Rm ${dialog.row.unit}` : ""}`
              : `Request re-do — ${dialog.row.template}${dialog.row.unit ? ` Rm ${dialog.row.unit}` : ""}`
          }
          showPriority={dialog.kind === "flag"}
          showNotify={dialog.kind === "flag"}
          pending={pending}
          onCancel={() => setDialog(null)}
          onConfirm={(note, priority, notifyStaff) =>
            run(() =>
              dialog.kind === "flag"
                ? flagSubmission(dialog.row.id, { note, priority, notifyStaff })
                : requestRedo(dialog.row.id, note),
            )
          }
        />
      )}
    </div>
  );
}

export function NoteDialog({
  title,
  showPriority,
  showNotify = false,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  showPriority: boolean;
  // Show a "notify staff" toggle (flag). Re-do always notifies, so it omits this.
  showNotify?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (note: string, priority: IssuePriority, notifyStaff: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<IssuePriority>(IssuePriority.MEDIUM);
  const [notifyStaff, setNotifyStaff] = useState(true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-3 font-bold text-slate-900">{title}</h2>
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Note for the submitter (required)"
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
        {showPriority && (
          <label className="mt-3 block text-sm text-slate-700">
            Issue priority
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as IssuePriority)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              {Object.values(IssuePriority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        )}
        {showNotify && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={notifyStaff}
              onChange={(e) => setNotifyStaff(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Notify staff by email
          </label>
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
            onClick={() => onConfirm(note, priority, notifyStaff)}
            disabled={pending || note.trim().length === 0}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
