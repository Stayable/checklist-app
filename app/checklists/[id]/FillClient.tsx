"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { QuestionType } from "@prisma/client";
import {
  isVisible,
  validateAll,
  type AnswerMap,
  type AnswerValue,
  type PhotoRef,
  type QuestionLike,
} from "@/lib/checklist-logic";
import { acquirePosition, compressImage, type GeoFailure, type Position } from "@/lib/image";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-store";
import { type CheckoutFlags } from "@/lib/checkout-flags";
import { SignaturePad } from "@/components/checklist/SignaturePad";
import { submitChecklist } from "./actions";
import { CloseOutPanel } from "./CloseOutPanel";
import { markOpened } from "./mark-opened.action";

export type FillQuestion = QuestionLike & { prompt: string };

// One captured photo: compressed bytes, preview URL, GPS fix taken with its
// batch, and the client-side capture timestamp (ADR-015 + ADR-021 photo metadata).
// capturedAt is epoch ms recorded once per batch — iOS strips EXIF so this is
// the only reliable capture time.
type PhotoItem = {
  blob: Blob;
  url: string;
  position: Position | null;
  capturedAt: number;
  gps: GpsState;
};
type PhotoState = Record<string, PhotoItem[]>;

/** UI-only view of the location request. Not persisted in the draft: the fix
 *  itself is worth keeping across a reload, the reason it failed is not. A
 *  restored draft with no fix is `unknown`, never `failed` — we cannot know
 *  which it was, and guessing would put a wrong explanation on screen. */
type GpsState =
  | { kind: "pending" }
  | { kind: "ok" }
  | { kind: "failed"; reason: GeoFailure }
  | { kind: "unknown" };

/** How long submit will wait on a location request that is still in flight.
 *  Bounded well under the 25s acquisition deadline: a field user who has taken
 *  their photo and pressed Submit must not be held for half a minute. Whatever
 *  has not landed by then is simply absent, exactly as before. */
const GPS_SUBMIT_GRACE_MS = 6_000;

/** Worst state across a question's photos, for the one status line under the
 *  grid. Ordered by how much it should worry the user: something they can fix
 *  outranks something they cannot, and both outrank "still working". */
const GPS_SEVERITY: Record<string, number> = {
  denied: 5,
  unsupported: 4,
  unavailable: 3,
  timeout: 2,
  pending: 1,
  ok: 0,
  unknown: 0,
};

/** Each failure gets its own sentence, because the remedies differ: a blocked
 *  permission needs a settings change, a timeout needs another try, and an
 *  unsupported device needs neither. A single "no location" line would tell a
 *  housekeeper nothing they could act on. */
const GPS_MESSAGE_KEY: Record<GeoFailure, "gpsDenied" | "gpsUnavailable" | "gpsTimeout" | "gpsUnsupported"> = {
  denied: "gpsDenied",
  unavailable: "gpsUnavailable",
  timeout: "gpsTimeout",
  unsupported: "gpsUnsupported",
};

function gpsKey(g: GpsState): string {
  return g.kind === "failed" ? g.reason : g.kind;
}

function worstGps(items: PhotoItem[]): GpsState | null {
  let worst: GpsState | null = null;
  for (const it of items) {
    if (!worst || GPS_SEVERITY[gpsKey(it.gps)] > GPS_SEVERITY[gpsKey(worst)]) worst = it.gps;
  }
  return worst;
}

export function FillClient({
  instanceId,
  label,
  questions,
  initialAnswers,
  submitted,
  collectsCheckoutFlags,
  initialFlags,
  canCloseOut,
  closeOutPending,
}: {
  instanceId: string;
  label: string;
  questions: FillQuestion[];
  initialAnswers: AnswerMap;
  submitted: boolean;
  collectsCheckoutFlags: boolean;
  initialFlags: CheckoutFlags;
  canCloseOut: boolean;
  closeOutPending: boolean;
}) {
  const t = useTranslations("Checklist");
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [photos, setPhotos] = useState<PhotoState>({});
  const [flags, setFlags] = useState<CheckoutFlags>(initialFlags);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);
  /** Location requests still in flight, so Submit can give them a bounded
   *  moment to land instead of racing them and silently losing the fix. */
  const pendingGps = useRef<Set<Promise<void>>>(new Set());
  /** Mirror of `photos` for read-at-submit. `uploadPhotoAnswers` runs inside a
   *  transition and closes over the render's snapshot, so a fix that lands
   *  during the grace wait would otherwise be dropped on the floor — the exact
   *  race this change exists to close. */
  const photosRef = useRef<PhotoState>({});

  // Restore any offline draft once on mount, layering it over server answers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const draft = await loadDraft(instanceId);
      if (cancelled) return;
      if (draft) {
        setAnswers((prev) => ({ ...prev, ...draft.answers }));
        const restored: PhotoState = {};
        for (const [qid, blobs] of Object.entries(draft.photos)) {
          const positions = draft.photoPositions?.[qid] ?? [];
          const timestamps = draft.photoTimestamps?.[qid] ?? [];
          restored[qid] = blobs.map((b, i) => ({
            blob: b,
            url: URL.createObjectURL(b),
            position: positions[i] ?? null,
            gps: (positions[i] ? { kind: "ok" } : { kind: "unknown" }) as GpsState,
            // Legacy drafts lack photoTimestamps — fall back to now so the field
            // is always a valid epoch ms (informational only, not enforcement).
            capturedAt: timestamps[i] ?? Date.now(),
          }));
        }
        setPhotos(restored);
        if (draft.flags) setFlags(draft.flags);
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  // Auto-save the draft on every change (after hydration so we don't clobber it).
  useEffect(() => {
    if (!hydrated.current || submitted) return;
    const signatures: Record<string, string> = {};
    for (const q of questions) {
      if (q.type === QuestionType.SIGNATURE && typeof answers[q.id] === "string") {
        signatures[q.id] = answers[q.id] as string;
      }
    }
    const photoBlobs: Record<string, Blob[]> = {};
    const photoPositions: Record<string, (Position | null)[]> = {};
    const photoTimestamps: Record<string, (number | null)[]> = {};
    for (const [qid, items] of Object.entries(photos)) {
      photoBlobs[qid] = items.map((it) => it.blob);
      photoPositions[qid] = items.map((it) => it.position);
      photoTimestamps[qid] = items.map((it) => it.capturedAt);
    }
    void saveDraft({
      instanceId,
      answers,
      photos: photoBlobs,
      photoPositions,
      photoTimestamps,
      signatures,
      flags: collectsCheckoutFlags ? flags : undefined,
    });
  }, [answers, photos, questions, instanceId, submitted, collectsCheckoutFlags, flags]);

  // Stamp openedAt + flip to IN_PROGRESS on first open. Fire-and-forget; the
  // server action is a no-op for non-assignees (managers, wrong user, already opened).
  useEffect(() => {
    void markOpened(instanceId);
  }, [instanceId]);

  const setAnswer = useCallback((qid: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const addPhotos = useCallback(
    async (q: FillQuestion, files: FileList) => {
      const max = q.photoMax ?? 10;
      const current = photos[q.id] ?? [];
      const room = Math.max(0, max - current.length);
      const picked = Array.from(files).slice(0, room);
      const compressed = await Promise.all(picked.map((f) => compressImage(f)));
      // One timestamp for the batch — the moment addPhotos runs is the capture
      // instant. Recorded before any async work so it is not skewed by compress time.
      const capturedAt = Date.now();
      const items: PhotoItem[] = compressed.map((c) => ({
        blob: c.blob,
        url: URL.createObjectURL(c.blob),
        position: null,
        capturedAt,
        gps: { kind: "pending" },
      }));
      setPhotos((prev) => ({ ...prev, [q.id]: [...(prev[q.id] ?? []), ...items] }));
      setAnswer(q.id, { count: current.length + items.length, pendingUpload: true });

      // GPS is captured with the batch but never blocks the preview — attach
      // the fix to these items when (if) it resolves. No fix → position stays
      // null → photo lands NO_GPS, which is informational, not enforcement.
      //
      // The outcome is now RECORDED rather than swallowed. The previous version
      // ended in `.catch(() => {})`, so a blocked permission and a timed-out
      // cold start were indistinguishable on screen and in the database.
      const inFlight = acquirePosition().then((res) => {
        setPhotos((prev) => ({
          ...prev,
          [q.id]: (prev[q.id] ?? []).map((it) =>
            items.includes(it)
              ? res.ok
                ? { ...it, position: res.position, gps: { kind: "ok" } as GpsState }
                : { ...it, gps: { kind: "failed", reason: res.reason } as GpsState }
              : it,
          ),
        }));
      });
      pendingGps.current.add(inFlight);
      void inFlight.finally(() => pendingGps.current.delete(inFlight));
    },
    [photos, setAnswer],
  );

  const removePhoto = useCallback(
    (q: FillQuestion, index: number) => {
      setPhotos((prev) => {
        const items = (prev[q.id] ?? []).filter((_, i) => i !== index);
        setAnswer(q.id, { count: items.length, pendingUpload: true });
        return { ...prev, [q.id]: items };
      });
    },
    [setAnswer],
  );

  // Upload photo blobs for visible PHOTO questions via presigned PUTs and
  // return answers with {count, photos: PhotoRef[]} substituted in (ADR-015).
  // Throws on any failure — the draft is untouched, so retry is safe.
  /** Give any in-flight location request a bounded moment to finish. Without
   *  this, pressing Submit a few seconds after the shutter discards a fix that
   *  was about to arrive — the likeliest way a photo ended up NO_GPS. */
  async function settlePendingGps(): Promise<void> {
    if (pendingGps.current.size === 0) return;
    await Promise.race([
      Promise.allSettled([...pendingGps.current]),
      new Promise((r) => setTimeout(r, GPS_SUBMIT_GRACE_MS)),
    ]);
  }

  async function uploadPhotoAnswers(visibleQuestions: FillQuestion[]): Promise<AnswerMap> {
    await settlePendingGps();
    const finalAnswers: AnswerMap = { ...answers };
    for (const q of visibleQuestions) {
      if (q.type !== QuestionType.PHOTO) continue;
      const items = photosRef.current[q.id] ?? [];
      if (items.length === 0) continue;

      const presignRes = await fetch("/api/photos/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: "response",
          instanceId,
          questionId: q.id,
          count: items.length,
        }),
      });
      if (!presignRes.ok) throw new Error(`presign ${presignRes.status}`);
      const { uploads } = (await presignRes.json()) as {
        uploads: { key: string; uploadUrl: string }[];
      };

      await Promise.all(
        items.map(async (it, i) => {
          const put = await fetch(uploads[i].uploadUrl, {
            method: "PUT",
            headers: { "content-type": "image/jpeg" },
            body: it.blob,
          });
          if (!put.ok) throw new Error(`PUT ${put.status}`);
        }),
      );

      const refs: PhotoRef[] = items.map((it, i) => ({
        key: uploads[i].key,
        lat: it.position?.latitude ?? null,
        lng: it.position?.longitude ?? null,
        accuracy: it.position?.accuracy ?? null,
        sizeBytes: it.blob.size,
        capturedAt: it.capturedAt,
      }));
      finalAnswers[q.id] = { count: refs.length, photos: refs };
    }
    return finalAnswers;
  }

  function onSubmit() {
    const visibleQuestions = questions.filter((q) => isVisible(q, answers));
    const found = validateAll(visibleQuestions, answers);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSubmitError(t("errorsSummary"));
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      let finalAnswers: AnswerMap;
      try {
        finalAnswers = await uploadPhotoAnswers(visibleQuestions);
      } catch {
        setSubmitError(t("photoUploadFailed"));
        return;
      }
      const res = await submitChecklist(
        instanceId,
        finalAnswers,
        collectsCheckoutFlags ? flags : undefined,
      );
      if (res.ok) {
        await clearDraft(instanceId);
        setDone(true);
      } else {
        setSubmitError(res.error);
      }
    });
  }

  if (submitted || done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-5xl">✓</div>
        <h1 className="text-xl font-bold text-slate-900">{t("submitted")}</h1>
        <p className="text-sm text-slate-500">{label}</p>
        <Link href="/" className="mt-2 rounded-lg bg-navy px-5 py-3 text-base font-semibold text-white">
          {t("returnHome")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5 pb-28">
      <header className="sticky top-0 -mx-5 -mt-5 border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur">
        <Link href="/" className="text-xs font-semibold text-slate-400">← {t("returnHome")}</Link>
        <h1 className="mt-1 text-lg font-bold text-slate-900">{label}</h1>
      </header>

      {questions.filter((q) => isVisible(q, answers)).map((q) => (
        <QuestionField
          key={q.id}
          q={q}
          value={answers[q.id]}
          error={errors[q.id]}
          photos={(photos[q.id] ?? []).map((it) => ({ url: it.url, gps: it.gps }))}
          gpsStatus={worstGps(photos[q.id] ?? [])}
          onChange={(v) => setAnswer(q.id, v)}
          onAddPhotos={(files) => void addPhotos(q, files)}
          onRemovePhoto={(i) => removePhoto(q, i)}
        />
      ))}

      {collectsCheckoutFlags && <CheckoutFlagsBlock flags={flags} onChange={setFlags} />}

      {/* After the questions and before the fixed Submit bar: completing the
          work is the normal path, so close-out must be findable without
          competing with it. */}
      {canCloseOut && <CloseOutPanel instanceId={instanceId} pending={closeOutPending} />}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto max-w-md">
          {submitError && <p className="mb-2 text-sm text-red-600">{submitError}</p>}
          <button
            onClick={onSubmit}
            disabled={pending}
            className="w-full rounded-lg bg-navy px-4 py-3 text-base font-semibold text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {pending ? t("submitting") : t("submit")}
          </button>
        </div>
      </div>
    </main>
  );
}

function QuestionField({
  q,
  value,
  error,
  photos,
  gpsStatus,
  onChange,
  onAddPhotos,
  onRemovePhoto,
}: {
  q: FillQuestion;
  value: AnswerValue;
  error?: string;
  photos: { url: string; gps: GpsState }[];
  gpsStatus: GpsState | null;
  onChange: (v: AnswerValue) => void;
  onAddPhotos: (files: FileList) => void;
  onRemovePhoto: (index: number) => void;
}) {
  const t = useTranslations("Checklist");
  const fileInput = useRef<HTMLInputElement | null>(null);

  if (q.type === QuestionType.SECTION_DIVIDER) {
    return <h2 className="mt-2 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-500">{q.prompt}</h2>;
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:border-slate-900 focus:outline-none";
  const chip = (active: boolean) =>
    `rounded-lg border px-4 py-2.5 text-sm font-semibold ${active ? "border-slate-900 bg-navy text-white" : "border-slate-300 text-slate-600"}`;

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-800">
        {q.prompt}
        {q.required ? <span className="text-red-500"> *</span> : <span className="ml-1 text-xs text-slate-400">({t("optional")})</span>}
      </label>

      {q.type === QuestionType.SHORT_TEXT && (
        <input className={input} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {q.type === QuestionType.LONG_TEXT && (
        <textarea className={input} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {q.type === QuestionType.NUMBER && (
        <input
          type="number"
          inputMode="decimal"
          className={input}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )}
      {q.type === QuestionType.DATE && (
        <input type="date" className={input} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
      {q.type === QuestionType.YESNO && (
        <div className="flex gap-2">
          <button type="button" className={chip(value === true)} onClick={() => onChange(true)}>{t("yes")}</button>
          <button type="button" className={chip(value === false)} onClick={() => onChange(false)}>{t("no")}</button>
        </div>
      )}
      {q.type === QuestionType.PASSFAIL && (
        <div className="flex gap-2">
          <button type="button" className={chip(value === "PASS")} onClick={() => onChange("PASS")}>{t("pass")}</button>
          <button type="button" className={chip(value === "FAIL")} onClick={() => onChange("FAIL")}>{t("fail")}</button>
        </div>
      )}
      {q.type === QuestionType.SINGLE && (
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((opt) => (
            <button key={opt} type="button" className={chip(value === opt)} onClick={() => onChange(opt)}>{opt}</button>
          ))}
        </div>
      )}
      {q.type === QuestionType.MULTI && (
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((opt) => {
            const arr = Array.isArray(value) ? value : [];
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                className={chip(active)}
                onClick={() => onChange(active ? arr.filter((x) => x !== opt) : [...arr, opt])}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
      {q.type === QuestionType.SIGNATURE && (
        <SignaturePad value={(value as string) ?? ""} onChange={onChange} clearLabel={t("clearSignature")} />
      )}
      {q.type === QuestionType.PHOTO && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {photos.map((ph, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                {/* Per-photo dot: each capture makes its own location request,
                    so one photo can carry a fix while the next does not. */}
                {ph.gps.kind !== "unknown" && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1 left-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                      ph.gps.kind === "ok"
                        ? "bg-emerald-500"
                        : ph.gps.kind === "pending"
                          ? "animate-pulse bg-slate-400"
                          : "bg-amber-500"
                    }`}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-navy text-xs text-white"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-300 text-2xl text-slate-400"
            >
              +
            </button>
          </div>
          {gpsStatus && gpsStatus.kind !== "unknown" && (
            <p
              className={`text-xs ${
                gpsStatus.kind === "ok"
                  ? "text-slate-500"
                  : gpsStatus.kind === "pending"
                    ? "text-slate-500"
                    : "text-amber-700"
              }`}
            >
              {gpsStatus.kind === "ok"
                ? t("gpsOk")
                : gpsStatus.kind === "pending"
                  ? t("gpsPending")
                  : t(GPS_MESSAGE_KEY[gpsStatus.reason])}
            </p>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onAddPhotos(e.target.files)}
          />
          <p className="text-xs text-amber-600">{t("photoPending")}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{t(`err_${error}` as never)}</p>}
    </div>
  );
}

// S1 structured checkout flags, captured by field staff at fill (bilingual per
// ADR-013). Only rendered for templates that collect them. Manager confirms /
// edits these at review; values lock at Verify.
function CheckoutFlagsBlock({
  flags,
  onChange,
}: {
  flags: CheckoutFlags;
  onChange: (next: CheckoutFlags) => void;
}) {
  const t = useTranslations("Checkout");
  const set = <K extends keyof CheckoutFlags>(key: K, value: CheckoutFlags[K]) =>
    onChange({ ...flags, [key]: value });

  const row = (key: "notifyCorporate" | "returnDeposit" | "itemsToReplace" | "placeOOO") => (
    <label className="flex items-center gap-3 py-2 text-base text-slate-800">
      <input
        type="checkbox"
        checked={flags[key]}
        onChange={(e) => set(key, e.target.checked)}
        className="h-5 w-5 rounded border-slate-300"
      />
      {t(key)}
    </label>
  );

  return (
    <section className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-500">
        {t("heading")}
      </h2>
      {row("notifyCorporate")}
      {row("returnDeposit")}
      {row("itemsToReplace")}
      {flags.itemsToReplace && (
        <input
          type="text"
          value={flags.itemsToReplaceList}
          onChange={(e) => set("itemsToReplaceList", e.target.value)}
          placeholder={t("itemsToReplaceList")}
          className="mb-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:border-slate-900 focus:outline-none"
        />
      )}
      {row("placeOOO")}
    </section>
  );
}
