"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuestionType, Role, ReviewLevel, TemplateScope } from "@prisma/client";
import { createTemplate, updateTemplate } from "./actions";

export type BuilderProperty = { id: string; shortCode: string; name: string };
export type BuilderQuestion = {
  type: QuestionType;
  prompt: string;
  required: boolean;
  photoMax?: number | null;
  failFlagsIssue?: boolean;
};
export type BuilderInitial = {
  id?: string;
  name: string;
  defaultRole: Role;
  scope: TemplateScope;
  reviewLevel: ReviewLevel;
  allProperties: boolean;
  propertyIds: string[];
  questions: BuilderQuestion[];
};

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: QuestionType.SHORT_TEXT, label: "Single line text" },
  { value: QuestionType.LONG_TEXT, label: "Multi line text" },
  { value: QuestionType.SINGLE, label: "Radio (one)" },
  { value: QuestionType.MULTI, label: "Checkbox (multiple)" },
  { value: QuestionType.YESNO, label: "Yes / No" },
  { value: QuestionType.PASSFAIL, label: "Pass / Fail" },
  { value: QuestionType.NUMBER, label: "Number" },
  { value: QuestionType.DATE, label: "Date" },
  { value: QuestionType.PHOTO, label: "Upload photo" },
  { value: QuestionType.SIGNATURE, label: "Signature" },
  { value: QuestionType.SECTION_DIVIDER, label: "Section divider" },
];

export function TemplateBuilder({
  initial,
  properties,
  canUseAllProperties,
}: {
  initial: BuilderInitial;
  properties: BuilderProperty[];
  canUseAllProperties: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [defaultRole, setDefaultRole] = useState(initial.defaultRole);
  const [scope, setScope] = useState(initial.scope);
  const [reviewLevel, setReviewLevel] = useState(initial.reviewLevel);
  const [allProperties, setAllProperties] = useState(initial.allProperties);
  const [propertyIds, setPropertyIds] = useState<string[]>(initial.propertyIds);
  const [questions, setQuestions] = useState<BuilderQuestion[]>(initial.questions);

  function toggleProperty(id: string) {
    setPropertyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function addQuestion() {
    setQuestions((q) => [...q, { type: QuestionType.SHORT_TEXT, prompt: "", required: true }]);
  }
  function updateQuestion(i: number, patch: Partial<BuilderQuestion>) {
    setQuestions((q) => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function removeQuestion(i: number) {
    setQuestions((q) => q.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    setQuestions((q) => {
      const j = i + dir;
      if (j < 0 || j >= q.length) return q;
      const copy = [...q];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function save() {
    setError(null);
    const payload = {
      name,
      defaultRole,
      scope,
      reviewLevel,
      allProperties,
      propertyIds: allProperties ? [] : propertyIds,
      questions,
    };
    startTransition(async () => {
      const res = initial.id
        ? await updateTemplate(initial.id, payload)
        : await createTemplate(payload);
      if (res.ok) {
        router.push("/templates");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {error && <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">{error}</div>}

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <label className="text-sm font-medium text-slate-700">Title
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. Pool Safety Check" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Default role
            <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(Role).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Scope
            <select value={scope} onChange={(e) => setScope(e.target.value as TemplateScope)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(TemplateScope).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">Review level
            <select value={reviewLevel} onChange={(e) => setReviewLevel(e.target.value as ReviewLevel)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {Object.values(ReviewLevel).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm font-semibold text-slate-800">Available at properties</p>
        {canUseAllProperties && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={allProperties} onChange={(e) => setAllProperties(e.target.checked)} />
            All properties
          </label>
        )}
        {!allProperties && (
          <div className="flex flex-wrap gap-2">
            {properties.map((p) => (
              <label key={p.id} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm ring-1 ${propertyIds.includes(p.id) ? "bg-sky-50 ring-sky-300" : "ring-slate-300"}`}>
                <input type="checkbox" checked={propertyIds.includes(p.id)} onChange={() => toggleProperty(p.id)} />
                {p.shortCode}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Questions</p>
          <button onClick={addQuestion} className="rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-200">+ Add question</button>
        </div>
        {questions.map((q, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{i + 1}</span>
              <select value={q.type} onChange={(e) => updateQuestion(i, { type: e.target.value as QuestionType })}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm">
                {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => move(i, -1)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">&#8593;</button>
                <button onClick={() => move(i, 1)} className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">&#8595;</button>
                <button onClick={() => removeQuestion(i)} className="rounded px-2 py-1 text-sm text-red-500 hover:bg-red-50">&#10005;</button>
              </div>
            </div>
            <input value={q.prompt} onChange={(e) => updateQuestion(i, { prompt: e.target.value })}
              placeholder="Question prompt" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex items-center gap-4">
              {q.type !== QuestionType.SECTION_DIVIDER && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} /> Required
                </label>
              )}
              {q.type === QuestionType.PHOTO && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  Max photos
                  <input type="number" min={1} max={10} value={q.photoMax ?? 1}
                    onChange={(e) => updateQuestion(i, { photoMax: Number(e.target.value) })}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-sm" />
                </label>
              )}
              {q.type === QuestionType.PASSFAIL && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={q.failFlagsIssue ?? false} onChange={(e) => updateQuestion(i, { failFlagsIssue: e.target.checked })} /> Fail raises an issue
                </label>
              )}
            </div>
          </div>
        ))}
      </section>

      <div className="flex gap-2">
        <button onClick={save} disabled={pending}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {pending ? "Saving…" : initial.id ? "Save template" : "Create template"}
        </button>
        <button onClick={() => router.push("/templates")} className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300">Cancel</button>
      </div>
    </div>
  );
}
