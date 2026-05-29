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
  type QuestionLike,
} from "@/lib/checklist-logic";
import { compressImage } from "@/lib/image";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft-store";
import { SignaturePad } from "@/components/checklist/SignaturePad";
import { submitChecklist } from "./actions";

export type FillQuestion = QuestionLike & { prompt: string };

type PhotoState = Record<string, { blobs: Blob[]; urls: string[] }>;

export function FillClient({
  instanceId,
  label,
  questions,
  initialAnswers,
  submitted,
}: {
  instanceId: string;
  label: string;
  questions: FillQuestion[];
  initialAnswers: AnswerMap;
  submitted: boolean;
}) {
  const t = useTranslations("Checklist");
  const [answers, setAnswers] = useState<AnswerMap>(initialAnswers);
  const [photos, setPhotos] = useState<PhotoState>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);

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
          restored[qid] = { blobs, urls: blobs.map((b) => URL.createObjectURL(b)) };
        }
        setPhotos(restored);
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
    for (const [qid, p] of Object.entries(photos)) photoBlobs[qid] = p.blobs;
    void saveDraft({ instanceId, answers, photos: photoBlobs, signatures });
  }, [answers, photos, questions, instanceId, submitted]);

  const setAnswer = useCallback((qid: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
  }, []);

  const addPhotos = useCallback(
    async (q: FillQuestion, files: FileList) => {
      const max = q.photoMax ?? 10;
      const current = photos[q.id]?.blobs ?? [];
      const room = Math.max(0, max - current.length);
      const picked = Array.from(files).slice(0, room);
      const compressed = await Promise.all(picked.map((f) => compressImage(f)));
      setPhotos((prev) => {
        const existing = prev[q.id] ?? { blobs: [], urls: [] };
        const blobs = [...existing.blobs, ...compressed.map((c) => c.blob)];
        const urls = [...existing.urls, ...compressed.map((c) => URL.createObjectURL(c.blob))];
        return { ...prev, [q.id]: { blobs, urls } };
      });
      setAnswer(q.id, { count: current.length + picked.length, pendingUpload: true });
    },
    [photos, setAnswer],
  );

  const removePhoto = useCallback(
    (q: FillQuestion, index: number) => {
      setPhotos((prev) => {
        const existing = prev[q.id];
        if (!existing) return prev;
        const blobs = existing.blobs.filter((_, i) => i !== index);
        const urls = existing.urls.filter((_, i) => i !== index);
        setAnswer(q.id, { count: blobs.length, pendingUpload: true });
        return { ...prev, [q.id]: { blobs, urls } };
      });
    },
    [setAnswer],
  );

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
      const res = await submitChecklist(instanceId, answers);
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
        <Link href="/" className="mt-2 rounded-lg bg-slate-900 px-5 py-3 text-base font-semibold text-white">
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
          photos={photos[q.id]?.urls ?? []}
          onChange={(v) => setAnswer(q.id, v)}
          onAddPhotos={(files) => void addPhotos(q, files)}
          onRemovePhoto={(i) => removePhoto(q, i)}
        />
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto max-w-md">
          {submitError && <p className="mb-2 text-sm text-red-600">{submitError}</p>}
          <button
            onClick={onSubmit}
            disabled={pending}
            className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
  onChange,
  onAddPhotos,
  onRemovePhoto,
}: {
  q: FillQuestion;
  value: AnswerValue;
  error?: string;
  photos: string[];
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
    `rounded-lg border px-4 py-2.5 text-sm font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600"}`;

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
            {photos.map((url, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-slate-900 text-xs text-white"
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
