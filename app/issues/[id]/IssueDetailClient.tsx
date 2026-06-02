"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { IssuePriority, IssueStatus, Role } from "@prisma/client";
import { closeIssue, updateIssue } from "../actions";

// Open-issue controls: assignee / status / priority + the resolution flow.
// Resolution photo capture is R2-gated — note-only until upload lands.

type Assignee = { id: string; name: string; role: Role };

const OPEN_STATUSES = [IssueStatus.OPEN, IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS];

export function IssueDetailClient({
  issueId,
  status,
  priority,
  assignedUserId,
  assignees,
}: {
  issueId: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignedUserId: string | null;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [closing, setClosing] = useState<"RESOLVED" | "WONT_FIX" | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Manage</h2>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-700">
            Assignee
            <select
              disabled={pending}
              value={assignedUserId ?? ""}
              onChange={(e) =>
                run(() => updateIssue(issueId, { assignedUserId: e.target.value || null }))
              }
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              <option value="">Unassigned</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.role})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Status
            <select
              disabled={pending}
              value={status}
              onChange={(e) => run(() => updateIssue(issueId, { status: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              {OPEN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-700">
            Priority
            <select
              disabled={pending}
              value={priority}
              onChange={(e) => run(() => updateIssue(issueId, { priority: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
            >
              {Object.values(IssuePriority).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Changing priority re-anchors the SLA target from the creation time.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Resolve</h2>
        <textarea
          value={resolveNote}
          onChange={(e) => setResolveNote(e.target.value)}
          rows={3}
          placeholder="Resolution note (required)"
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
        <p className="mt-1 text-xs text-amber-600">
          Resolution photo capture lands with R2 — note-only for now.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            disabled={pending || resolveNote.trim().length === 0}
            onClick={() => {
              setClosing("RESOLVED");
              run(() => closeIssue(issueId, { status: IssueStatus.RESOLVED, note: resolveNote }));
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending && closing === "RESOLVED" ? "Resolving…" : "Mark resolved"}
          </button>
          <button
            disabled={pending || resolveNote.trim().length === 0}
            onClick={() => {
              setClosing("WONT_FIX");
              run(() => closeIssue(issueId, { status: IssueStatus.WONT_FIX, note: resolveNote }));
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {pending && closing === "WONT_FIX" ? "Closing…" : "Won't fix"}
          </button>
        </div>
      </div>
    </div>
  );
}
