"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NOTE_BODY_MAX } from "@/lib/contractors";
import { appendJobNote } from "../actions";

// Append-only history. Notes are ordered oldest-first so the thread reads as
// a chronological record, and there is deliberately no edit or delete
// affordance anywhere in here — the tables carry no `updatedAt` and no
// soft-delete column, so there is nothing an edit could be written into.

export type ThreadNote = {
  id: string;
  isSystem: boolean;
  author: string;
  body: string;
  createdAtLabel: string;
};

export function JobThread({ jobId, notes }: { jobId: string; notes: ThreadNote[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await appendJobNote(jobId, { body });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">History</h2>
      <p className="mb-3 text-xs text-slate-500">
        Notes are append-only. Once added, a note cannot be edited or deleted. Status, assignment
        and schedule changes are recorded here automatically.
      </p>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {notes.map((n) => (
            <li
              key={n.id}
              className={`border-l-2 pl-3 ${
                n.isSystem ? "border-slate-300" : "border-blue-300"
              }`}
            >
              <p
                className={`whitespace-pre-wrap text-sm ${
                  n.isSystem ? "italic text-slate-600" : "text-slate-900"
                }`}
              >
                {n.body}
              </p>
              <p className="text-xs text-slate-500">
                {n.author}
                {n.isSystem ? " · automatic" : ""} · {n.createdAtLabel}
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3">
        {error && <div className="mb-2 rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Add a note</span>
          <textarea
            value={body}
            maxLength={NOTE_BODY_MAX}
            rows={3}
            onChange={(e) => setBody(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5"
          />
        </label>
        <button
          onClick={submit}
          disabled={pending || body.trim().length === 0}
          className="mt-2 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Add note
        </button>
      </div>
    </div>
  );
}
