"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { JobStatus } from "@prisma/client";
import { JOB_PHOTO_MAX, jobStatusLabel, requiresCompletionNote } from "@/lib/contractor-jobs";
import { compressImage, getCurrentPosition } from "@/lib/image";
import { addJobPhotos, assignContractor, updateJobStatus } from "../actions";

export type DispatchTarget = {
  id: string;
  name: string;
  contracted: boolean;
  /** Pre-filled wa.me link, or null when the contractor has no WhatsApp. */
  waUrl: string | null;
  /** tel: link, or null when there's no phone on file. */
  telUrl: string | null;
};

type Candidate = {
  id: string;
  name: string;
  company: string | null;
  trades: string;
  contracted: boolean;
  onCall: boolean;
  whatsapp: string | null;
  phone: string | null;
};

// Right-rail controls for a contractor job: assign (contracted-first order from
// T3), advance status, add photos. T4 adds the one-tap WhatsApp/call send here.
export function JobControls({
  jobId,
  status,
  jobUrl,
  dispatchTargets,
  closed,
  assignedContractorId,
  photoCount,
  candidates,
}: {
  jobId: string;
  status: JobStatus;
  jobUrl: string | null;
  dispatchTargets: DispatchTarget[];
  closed: boolean;
  assignedContractorId: string | null;
  photoCount: number;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      else router.refresh();
    });
  }

  // Photo upload: presign -> PUT bytes straight to R2 -> persist refs. Same
  // pipeline as checklist and issue photos, including the GPS capture that
  // drives server-side geofence evaluation.
  async function onPickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const remaining = JOB_PHOTO_MAX - photoCount;
      const picked = Array.from(files).slice(0, Math.max(0, remaining));
      if (picked.length === 0) {
        setError(`This job already has the maximum ${JOB_PHOTO_MAX} photos.`);
        return;
      }

      const compressed = await Promise.all(picked.map((f) => compressImage(f)));

      // GPS is best-effort: a denied or slow fix must not block the upload. The
      // server records NO_GPS in that case rather than guessing a location.
      const gps = await getCurrentPosition(10_000).catch(() => null);

      const res = await fetch("/api/photos/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "contractorJob", jobId, count: compressed.length }),
      });
      if (!res.ok) {
        setError("Could not start the upload. Try again.");
        return;
      }
      const { uploads } = (await res.json()) as { uploads: { key: string; uploadUrl: string }[] };

      const refs: unknown[] = [];
      for (let i = 0; i < compressed.length; i++) {
        const target = uploads[i];
        const image = compressed[i];
        if (!target || !image) continue;
        const put = await fetch(target.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: image.blob,
        });
        if (!put.ok) {
          setError("A photo failed to upload. Try again.");
          return;
        }
        refs.push({
          key: target.key,
          lat: gps?.latitude ?? null,
          lng: gps?.longitude ?? null,
          accuracy: gps?.accuracy ?? null,
          sizeBytes: image.compressedBytes,
          capturedAt: new Date().toISOString(),
        });
      }

      const saved = await addJobPhotos(jobId, { photos: refs });
      if (!saved.ok) setError(saved.error);
      else router.refresh();
    } catch {
      setError("Could not process the photos on this device.");
    } finally {
      setUploading(false);
    }
  }

  const nextStatuses = ([JobStatus.IN_PROGRESS, JobStatus.COMPLETED, JobStatus.CANCELLED] as const)
    .filter((s) => s !== status);

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dispatch</h2>

      {closed ? (
        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This job is {jobStatusLabel(status).toLowerCase()} and can no longer be changed.
        </p>
      ) : (
        <>
          <label className="text-sm font-medium text-slate-700">
            Contractor
            {candidates.length === 0 ? (
              <p className="mt-1 rounded-md bg-amber-50 px-3 py-2 text-sm font-normal text-amber-900 ring-1 ring-amber-200">
                No contractor in the directory covers this property and trade. Add one in{" "}
                <a href="/contractors" className="font-semibold underline">
                  Contractors
                </a>
                .
              </p>
            ) : (
              <select
                value={assignedContractorId ?? ""}
                disabled={pending}
                onChange={(e) =>
                  run(() => assignContractor(jobId, { contractorId: e.target.value || null }))
                }
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contracted ? "★ " : ""}
                    {c.name}
                    {c.company ? ` (${c.company})` : ""}
                    {c.onCall ? "" : " — off call"}
                  </option>
                ))}
              </select>
            )}
          </label>
          {candidates.length > 0 && (
            <p className="-mt-2 text-xs text-slate-400">
              ★ = under contract, called first in an emergency. Ordered contracted → on-call →
              reachable.
            </p>
          )}

          {dispatchTargets.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <span className="text-sm font-semibold text-emerald-900">
                {assignedContractorId ? "Send the job" : "Send to the best match"}
              </span>
              {dispatchTargets.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-emerald-900">
                    {t.contracted ? "★ " : ""}
                    {t.name}
                  </span>
                  {t.waUrl ? (
                    <a
                      href={t.waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <span className="text-xs text-emerald-800">no WhatsApp on file</span>
                  )}
                  {t.telUrl && (
                    <a
                      href={t.telUrl}
                      className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                    >
                      Call
                    </a>
                  )}
                </div>
              ))}
              <p className="text-xs text-emerald-800">
                Opens WhatsApp with the message already written, in the contractor&apos;s language.
                You still press send — nothing goes out on its own.
              </p>
              {jobUrl ? (
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(jobUrl).then(() => setCopied(true))}
                  className="self-start text-xs font-semibold text-emerald-900 underline"
                >
                  {copied ? "Link copied" : "Copy the job link"}
                </button>
              ) : (
                <p className="text-xs text-amber-800">
                  Job link unavailable — check NEXT_PUBLIC_APP_URL and AUTH_SECRET.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-700">Status</span>
            {status === JobStatus.OPEN && (
              <button
                type="button"
                disabled={pending || assignedContractorId === null}
                onClick={() => run(() => updateJobStatus(jobId, { status: JobStatus.DISPATCHED }))}
                className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Mark dispatched
              </button>
            )}
            {status === JobStatus.OPEN && assignedContractorId === null && (
              <p className="text-xs text-slate-400">Assign a contractor first.</p>
            )}

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Closing note (required to complete or cancel)"
              className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={pending || (requiresCompletionNote(s) && note.trim().length === 0)}
                  onClick={() =>
                    run(() => updateJobStatus(jobId, { status: s, completionNote: note }))
                  }
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  {jobStatusLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <label className="text-sm font-medium text-slate-700">
            Add photos{" "}
            <span className="font-normal text-slate-400">
              ({photoCount}/{JOB_PHOTO_MAX})
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={uploading || pending || photoCount >= JOB_PHOTO_MAX}
              onChange={(e) => void onPickPhotos(e.target.files)}
              className="mt-1 block w-full text-sm"
            />
          </label>
          {uploading && <p className="text-xs text-slate-500">Uploading…</p>}
        </>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
