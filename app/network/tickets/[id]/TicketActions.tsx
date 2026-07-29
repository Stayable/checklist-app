"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TicketStatus } from "@prisma/client";
import { addTicketNote, updateTicket } from "../actions";

// Right-rail edit controls for the ticket detail page (Task 6): status /
// assignee / resolution-notes save, plus an "add note" box. Mirrors the
// ReviewActions client-island pattern (useTransition + router.refresh() on
// success). No Teams posting here — Task 7 owns automated notifications;
// manual edits are audit-logged only.

export function TicketActions({
  ticketId,
  status,
  assignedTo,
  resolutionNotes,
}: {
  ticketId: string;
  status: TicketStatus;
  assignedTo: string | null;
  resolutionNotes: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusValue, setStatusValue] = useState<TicketStatus>(status);
  const [assignedToValue, setAssignedToValue] = useState(assignedTo ?? "");
  const [notesValue, setNotesValue] = useState(resolutionNotes ?? "");
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else router.refresh();
    });
  };

  function saveTicket() {
    run(() =>
      updateTicket({
        ticketId,
        status: statusValue,
        assignedTo: assignedToValue.trim() || null,
        resolutionNotes: notesValue.trim() || null,
      }),
    );
  }

  function submitNote() {
    const content = noteText.trim();
    if (content.length === 0) return;
    run(async () => {
      const result = await addTicketNote({ ticketId, content });
      if (result.ok) setNoteText("");
      return result;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Manage</h2>
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <label className="mb-3 block text-sm text-slate-700">
          Status
          <select
            disabled={pending}
            value={statusValue}
            onChange={(e) => setStatusValue(e.target.value as TicketStatus)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          >
            {Object.values(TicketStatus).map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="mb-3 block text-sm text-slate-700">
          Assigned to
          <input
            type="text"
            disabled={pending}
            value={assignedToValue}
            onChange={(e) => setAssignedToValue(e.target.value)}
            placeholder="IT staff or MSP name"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
        <label className="mb-3 block text-sm text-slate-700">
          Resolution notes
          <textarea
            disabled={pending}
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={saveTicket}
          className="w-full rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add note</h2>
        <textarea
          disabled={pending}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          rows={3}
          placeholder="Add a note…"
          className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || noteText.trim().length === 0}
          onClick={submitNote}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Add note
        </button>
      </div>
    </div>
  );
}
