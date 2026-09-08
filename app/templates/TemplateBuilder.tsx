"use client";

import { SelectField } from "@/components/ui/select";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  InstanceMultiplicity,
  QuestionType,
  Role,
  ReviewLevel,
  TemplateScope,
} from "@prisma/client";
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
  copies: InstanceMultiplicity;
  reviewLevel: ReviewLevel;
  allProperties: boolean;
  propertyIds: string[];
  questions: BuilderQuestion[];
};

// A stable per-row id so React keys survive reorder/delete (index keys misrender
// on move/remove). Client-only — stripped before the payload hits the action.
type QRow = BuilderQuestion & { _uid: string };
const newUid = () => crypto.randomUUID();

// Plain-language labels. The raw enum names are shown to nobody: whoever writes
// a template is describing operations, not reading the schema.
const SCOPE_LABEL: Record<TemplateScope, string> = {
  [TemplateScope.PER_ROOM]: "One room",
  [TemplateScope.PER_PROPERTY]: "The whole property",
  [TemplateScope.AD_HOC]: "Ad hoc",
};

const COPIES_LABEL: Record<InstanceMultiplicity, string> = {
  [InstanceMultiplicity.ONE]: "One checklist",
  [InstanceMultiplicity.PER_ASSIGNEE]: "One per person on shift",
  [InstanceMultiplicity.PER_TASK]: "One per task",
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
  const [copies, setCopies] = useState(initial.copies);

  // A per-room checklist cannot also be per-person or per-task -- that is one
  // instance per room PER person, which nothing asks for and which
  // subjectKindFor rejects server-side. Disabling the control is not enough:
  // without this reset, picking "one per task" and then switching to "one room"
  // would submit the stale value and be refused on save with no obvious cause.
  function changeScope(next: TemplateScope) {
    setScope(next);
    if (next === TemplateScope.PER_ROOM) setCopies(InstanceMultiplicity.ONE);
  }
  const [reviewLevel, setReviewLevel] = useState(initial.reviewLevel);
  const [allProperties, setAllProperties] = useState(initial.allProperties);
  const [propertyIds, setPropertyIds] = useState<string[]>(initial.propertyIds);
  const [questions, setQuestions] = useState<QRow[]>(() =>
    initial.questions.map((q) => ({ ...q, _uid: newUid() })),
  );

  function toggleProperty(id: string) {
    setPropertyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function addQuestion() {
    setQuestions((q) => [...q, { type: QuestionType.SHORT_TEXT, prompt: "", required: true, _uid: newUid() }]);
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
      copies,
      reviewLevel,
      allProperties,
      propertyIds: allProperties ? [] : propertyIds,
      // Strip the client-only _uid before sending to the action.
      questions: questions.map((q) => ({
        type: q.type,
        prompt: q.prompt,
        required: q.required,
        photoMax: q.photoMax,
        failFlagsIssue: q.failFlagsIssue,
      })),
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
            <div className="mt-1">
              <SelectField
                ariaLabel="Default role"
                value={defaultRole}
                onChange={(next) => setDefaultRole(next as Role)}
                options={Object.values(Role).map((r) => ({ value: r, label: r }))}
              />
            </div>
          </label>
          <label className="text-sm font-medium text-slate-700">What it covers
            <div className="mt-1">
              <SelectField
                ariaLabel="What it covers"
                value={scope}
                onChange={(next) => changeScope(next as TemplateScope)}
                options={Object.values(TemplateScope).map((s) => ({
                  value: s,
                  label: SCOPE_LABEL[s],
                }))}
              />
            </div>
          </label>
          <label className="text-sm font-medium text-slate-700">How many per day
            <div className="mt-1">
              <SelectField
                ariaLabel="How many per day"
                value={copies}
                onChange={(next) => setCopies(next as InstanceMultiplicity)}
                disabled={scope === TemplateScope.PER_ROOM}
                options={Object.values(InstanceMultiplicity).map((c) => ({
                  value: c,
                  label: COPIES_LABEL[c],
                }))}
              />
            </div>
          </label>
          <label className="text-sm font-medium text-slate-700">Review level
            <div className="mt-1">
              <SelectField
                ariaLabel="Review level"
                value={reviewLevel}
                onChange={(next) => setReviewLevel(next as ReviewLevel)}
                options={Object.values(ReviewLevel).map((r) => ({ value: r, label: r }))}
              />
            </div>
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
          <div key={q._uid} className="flex flex-col gap-2 rounded-md border border-slate-200 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{i + 1}</span>
              {/* Inline in a question row, so it sizes to its content rather
                  than filling the row like the settings selects above. */}
              <SelectField
                ariaLabel={`Question ${i + 1} type`}
                value={q.type}
                onChange={(next) => updateQuestion(i, { type: next as QuestionType })}
                options={QUESTION_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                triggerClassName="flex items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 hover:bg-slate-50 focus:border-slate-900 focus:outline-none"
              />
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
