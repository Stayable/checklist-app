"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ContractorJobStatus } from "@prisma/client";
import {
  CLOSE_NOTE_MAX,
  JOB_STATUS_ORDER,
  jobStatusLabel,
  requiresCloseNote,
} from "@/lib/contractors";
import { assignContractor, rescheduleJob, updateJobStatus } from "../actions";

type EligibleContractor = { id: string; name: string; company: string | null };

export function JobControls({
  jobId,
  status,
  terminal,
  contractorId,
  contractorName,
  scheduledFor,
  eligible,
}: {
  jobId: string;
  status: ContractorJobStatus;
  terminal: boolean;
  contractorId: string | null;
  contractorName: string | null;
  scheduledFor: string;
  eligible: EligibleContractor[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nextStatus, setNextStatus] = useState<ContractorJobStatus>(status);
  const [closeNote, setCloseNote] = useState("");
  const [nextContractorId, setNextContractorId] = useState(contractorId ?? "");
  const [nextDate, setNextDate] = useState(scheduledFor);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  // A closed job's own fields are frozen (design §6). Notes stay open — the
  // thread below this rail is unaffected.
  if (terminal) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
        <p className="text-sm text-slate-600">
          This job is {jobStatusLabel(status).toLowerCase()}. Its status, contractor and scheduled
          date are locked and cannot be changed. You can still add notes below.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Status</h2>
        <select
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as ContractorJobStatus)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          {JOB_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {jobStatusLabel(s)}
            </option>
          ))}
        </select>
        {requiresCloseNote(nextStatus) && (
          <label className="mt-2 flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">Closing note (required)</span>
            <textarea
              value={closeNote}
              maxLength={CLOSE_NOTE_MAX}
              rows={3}
              onChange={(e) => setCloseNote(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5"
            />
            <span className="text-xs text-slate-500">
              Completing or cancelling a job closes it for good — its fields can&apos;t be changed
              afterwards.
            </span>
          </label>
        )}
        <button
          onClick={() =>
            run(() =>
              updateJobStatus(jobId, {
                status: nextStatus,
                closeNote: closeNote.trim() ? closeNote.trim() : undefined,
              }),
            )
          }
          disabled={pending || nextStatus === status}
          className="mt-2 w-full rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Save status
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          Contractor
        </h2>
        <select
          value={nextContractorId}
          onChange={(e) => setNextContractorId(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Unassigned</option>
          {eligible.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` (${c.company})` : ""}
            </option>
          ))}
        </select>
        {eligible.length === 0 && (
          <p className="mt-1 text-xs text-slate-500">
            No active contractor covers this trade at this property yet.
          </p>
        )}
        {contractorId !== null && !eligible.some((c) => c.id === contractorId) && (
          <p className="mt-1 text-xs text-amber-700">
            Currently assigned to {contractorName ?? "a contractor"}, who no longer matches this
            job&apos;s trade or property. Reassigning is possible; restoring them is not.
          </p>
        )}
        <button
          onClick={() =>
            run(() =>
              assignContractor(jobId, {
                contractorId: nextContractorId ? nextContractorId : null,
              }),
            )
          }
          disabled={pending || (nextContractorId || null) === contractorId}
          className="mt-2 w-full rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          Save contractor
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Assigning records the plan here. Nothing is sent to the contractor.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Schedule</h2>
        <input
          type="date"
          value={nextDate}
          onChange={(e) => setNextDate(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-slate-500">
          Date only — no time of day. Clearing it returns the job to the unscheduled backlog.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => run(() => rescheduleJob(jobId, { scheduledFor: nextDate || null }))}
            disabled={pending || nextDate === scheduledFor}
            className="flex-1 rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Save date
          </button>
          <button
            onClick={() => {
              setNextDate("");
              run(() => rescheduleJob(jobId, { scheduledFor: null }));
            }}
            disabled={pending || scheduledFor === ""}
            className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
