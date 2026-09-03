"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TicketStatus } from "@prisma/client";
import { addTicketNote, setDeviceSuppressed, updateTicket } from "../actions";

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
  device,
}: {
  ticketId: string;
  status: TicketStatus;
  assignedTo: string | null;
  resolutionNotes: string | null;
  /**
   * The device this ticket names, when it names one. A MASS_OUTAGE parent
   * carries no device, so the acknowledge control does not render for it —
   * silencing a whole property is not a thing this button should be able to do.
   */
  device: {
    id: string;
    name: string;
    isOffline: boolean;
    suppressedAt: string | null;
    suppressedReason: string | null;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [statusValue, setStatusValue] = useState<TicketStatus>(status);
  const [assignedToValue, setAssignedToValue] = useState(assignedTo ?? "");
  const [notesValue, setNotesValue] = useState(resolutionNotes ?? "");
  const [noteText, setNoteText] = useState("");
  const [suppressReason, setSuppressReason] = useState("");
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

  function acknowledge(next: boolean) {
    if (!device) return;
    if (
      next &&
      !confirm(
        `Stop opening tickets for "${device.name}"? Monitoring continues — if it comes back online you will see it.`,
      )
    ) {
      return;
    }
    run(async () => {
      const result = await setDeviceSuppressed(device.id, next, suppressReason);
      if (result.ok) setSuppressReason("");
      return result;
    });
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
        {/* Free text, and deliberately labelled as such. `Ticket.assignedTo` is
            a String with no relation to `User`, and no code path reads it to
            notify anyone — so an email typed here would look like a delivery
            address while sending nothing. Saying so is the fix; a picker that
            actually notifies is a separate decision (there is a standing "no
            email" call on network escalation). */}
        <label className="mb-3 block text-sm text-slate-700">
          Assigned to (name)
          <input
            type="text"
            disabled={pending}
            value={assignedToValue}
            onChange={(e) => setAssignedToValue(e.target.value)}
            placeholder="IT staff or MSP name"
            className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
          />
          <span className="mt-1 block text-xs text-slate-500">
            A label for the board only. Nothing is emailed or messaged from this field, so an
            address typed here would notify nobody.
          </span>
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

      {/* Acknowledge — the escape hatch for the re-arm sweep.
          The sweep re-opens a ticket for any device that is OFFLINE with no
          open ticket, which is right for something somebody will repair and a
          loop for something nobody will. Only a person can tell those apart,
          so this is where they say so. Renders only for a ticket that names a
          device: a MASS_OUTAGE parent has none, and silencing a whole property
          is not something this button should be able to do. */}
      {device && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Device
          </h2>
          {device.suppressedAt ? (
            <>
              <p className="mb-2 text-sm text-slate-700">
                <span className="font-semibold">{device.name}</span> is acknowledged
                as won&apos;t-fix — no new tickets will open for it.
              </p>
              {device.suppressedReason && (
                <p className="mb-2 rounded bg-slate-50 p-2 text-xs text-slate-600">
                  {device.suppressedReason}
                </p>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => acknowledge(false)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Resume monitoring
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-600">
                {device.isOffline
                  ? "Still offline. Resolving this ticket will re-open a new one in about 7 minutes unless the device is fixed or acknowledged."
                  : "Acknowledge this device to stop tickets opening for it."}
              </p>
              <textarea
                disabled={pending}
                value={suppressReason}
                onChange={(e) => setSuppressReason(e.target.value)}
                rows={2}
                placeholder="Why will this not be fixed? e.g. decommissioned, removed from service"
                className="mb-2 w-full rounded-lg border border-slate-300 p-2 text-sm"
              />
              <button
                type="button"
                disabled={pending || suppressReason.trim().length < 3}
                onClick={() => acknowledge(true)}
                className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Acknowledge — stop tickets for this device
              </button>
              <p className="mt-2 text-xs text-slate-400">
                Monitoring continues. If it comes back online you will see it.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
