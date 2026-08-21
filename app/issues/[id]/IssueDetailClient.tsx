"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { IssuePriority, IssueStatus, Role } from "@prisma/client";
import type { PhotoRef } from "@/lib/checklist-logic";
import { acquirePosition, compressImage, type GeoFailure, type Position } from "@/lib/image";
import { closeIssue, updateIssue } from "../actions";

// Open-issue controls: assignee / status / priority + the resolution flow.
// Resolution evidence photos are optional, captured + uploaded at close
// (ADR-015): same compress + per-batch GPS flow as the checklist filler.

type Assignee = { id: string; name: string; role: Role };
type PhotoItem = {
  blob: Blob;
  url: string;
  position: Position | null;
  /** null while the request is in flight. English-only surface (ADR-013): this
   *  is a manager screen, unlike the field-facing checklist filler. */
  gpsFailure: GeoFailure | null;
};

const GPS_MESSAGE: Record<GeoFailure, string> = {
  denied: "Location is blocked for this site — allow it in your browser settings.",
  unavailable: "Your device could not determine a location.",
  timeout: "Could not get a location in time.",
  unsupported: "This device cannot report a location.",
};

const OPEN_STATUSES = [IssueStatus.OPEN, IssueStatus.ASSIGNED, IssueStatus.IN_PROGRESS];
const PHOTO_MAX = 5;

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
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Action failed.");
      else router.refresh();
    });
  };

  const addPhotos = async (files: FileList) => {
    const room = Math.max(0, PHOTO_MAX - photos.length);
    const picked = Array.from(files).slice(0, room);
    const compressed = await Promise.all(picked.map((f) => compressImage(f)));
    const items: PhotoItem[] = compressed.map((c) => ({
      blob: c.blob,
      url: URL.createObjectURL(c.blob),
      position: null,
      gpsFailure: null,
    }));
    setPhotos((prev) => [...prev, ...items]);
    // GPS captured with the batch, never blocks the preview. The failure reason
    // is kept rather than swallowed — see lib/image.ts acquirePosition.
    void acquirePosition().then((res) => {
      setPhotos((prev) =>
        prev.map((it) =>
          items.includes(it)
            ? res.ok
              ? { ...it, position: res.position, gpsFailure: null }
              : { ...it, gpsFailure: res.reason }
            : it,
        ),
      );
    });
  };

  // Upload any captured photos via presigned PUTs, returning their PhotoRefs.
  // Throws on failure so the close is aborted and the photos stay for retry.
  async function uploadPhotos(): Promise<PhotoRef[]> {
    if (photos.length === 0) return [];
    const presignRes = await fetch("/api/photos/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "issue", issueId, count: photos.length }),
    });
    if (!presignRes.ok) throw new Error(`presign ${presignRes.status}`);
    const { uploads } = (await presignRes.json()) as {
      uploads: { key: string; uploadUrl: string }[];
    };
    await Promise.all(
      photos.map(async (it, i) => {
        const put = await fetch(uploads[i].uploadUrl, {
          method: "PUT",
          headers: { "content-type": "image/jpeg" },
          body: it.blob,
        });
        if (!put.ok) throw new Error(`PUT ${put.status}`);
      }),
    );
    return photos.map((it, i) => ({
      key: uploads[i].key,
      lat: it.position?.latitude ?? null,
      lng: it.position?.longitude ?? null,
      accuracy: it.position?.accuracy ?? null,
      sizeBytes: it.blob.size,
    }));
  }

  function onClose(target: "RESOLVED" | "WONT_FIX") {
    setError(null);
    setClosing(target);
    startTransition(async () => {
      let refs: PhotoRef[];
      try {
        refs = await uploadPhotos();
      } catch {
        setError("Photo upload failed. Try again.");
        return;
      }
      const result = await closeIssue(issueId, {
        status: target === "RESOLVED" ? IssueStatus.RESOLVED : IssueStatus.WONT_FIX,
        note: resolveNote,
        photos: refs,
      });
      if (!result.ok) setError(result.error ?? "Action failed.");
      else router.refresh();
    });
  }

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

        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">
            Resolution photos (optional, up to {PHOTO_MAX})
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((it, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                {/* Per-photo, because each capture makes its own request: one
                    photo can carry a fix while the next does not. */}
                <span
                  aria-hidden
                  className={`absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    it.gpsFailure ? "bg-amber-500" : it.position ? "bg-emerald-500" : "animate-pulse bg-slate-400"
                  }`}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-slate-900 text-xs text-white disabled:opacity-50"
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < PHOTO_MAX && (
              <button
                type="button"
                disabled={pending}
                onClick={() => fileInput.current?.click()}
                className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-400 disabled:opacity-50"
              >
                +
              </button>
            )}
          </div>
          {(() => {
            // One line for the grid, naming the first real failure. Silence
            // when every photo has a fix — a confirmation per thumbnail is
            // noise on a screen whose subject is the issue, not the photo.
            const failed = photos.find((it) => it.gpsFailure);
            return failed?.gpsFailure ? (
              <p className="text-xs text-amber-700">
                {GPS_MESSAGE[failed.gpsFailure]} The photo is still saved.
              </p>
            ) : null;
          })()}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addPhotos(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <button
            disabled={pending || resolveNote.trim().length === 0}
            onClick={() => onClose("RESOLVED")}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending && closing === "RESOLVED" ? "Resolving…" : "Mark resolved"}
          </button>
          <button
            disabled={pending || resolveNote.trim().length === 0}
            onClick={() => onClose("WONT_FIX")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {pending && closing === "WONT_FIX" ? "Closing…" : "Won't fix"}
          </button>
        </div>
      </div>
    </div>
  );
}
