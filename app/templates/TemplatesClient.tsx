"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplate, setTemplatePublished } from "./actions";
import {
  applyTemplateFilter,
  canPublish,
  countMatching,
  lifecycleOf,
  FILTER_LABEL,
  LIFECYCLE_LABEL,
  type TemplateFilter,
} from "@/lib/template-filters";

type Row = {
  id: string;
  code: string;
  name: string;
  scope: string;
  allProperties: boolean;
  propertyIds: string[];
  questionCount: number;
  instanceCount: number;
  canManage: boolean;
  active: boolean;
  publishedAt: string | null;
  /** Manager-or-above may publish, even where they may not edit the questions. */
  canPublish: boolean;
};

export function TemplatesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState<TemplateFilter>("ALL");

  const visible = applyTemplateFilter(rows, filter);

  function onPublish(id: string, name: string, next: boolean) {
    if (!next && !confirm(`Unpublish "${name}"? Field staff will stop seeing it.`)) return;
    startTransition(async () => {
      const res = await setTemplatePublished(id, next);
      setBanner(
        res.ok
          ? { kind: "ok", text: next ? `Published "${name}".` : `Unpublished "${name}".` }
          : { kind: "err", text: res.error },
      );
      if (res.ok) router.refresh();
    });
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteTemplate(id);
      setBanner(res.ok ? { kind: "ok", text: res.message ?? "Deleted." } : { kind: "err", text: res.error });
      if (res.ok) router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-sm text-slate-600">No templates for this property yet.</p>
        <Link
          href="/templates/new"
          className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
        >
          Create a checklist template
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {banner && (
        <div className={`rounded-md p-2 text-sm ${banner.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
          {banner.text}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(["ALL", "NEEDS_QUESTIONS", "READY_TO_PUBLISH", "PUBLISHED"] as const).map((f) => (
          <FilterChip
            key={f}
            label={`${FILTER_LABEL[f]} (${f === "ALL" ? rows.length : countMatching(rows, f)})`}
            selected={filter === f}
            onClick={() => setFilter(f)}
          />
        ))}
      </div>
      {visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">
          Nothing in this view.
        </p>
      )}
      {visible.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-lg bg-white p-4 ring-1 ring-slate-200 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{t.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t.code}</span>
              {t.allProperties && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">All properties</span>}
              <LifecycleBadge row={t} />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.questionCount} question{t.questionCount === 1 ? "" : "s"} · {t.scope} · {t.instanceCount} checklist{t.instanceCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {t.canPublish && canPublish(t) && (
              <button
                onClick={() => onPublish(t.id, t.name, true)}
                disabled={pending}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                Publish
              </button>
            )}
            {t.canPublish && t.active && (
              <button
                onClick={() => onPublish(t.id, t.name, false)}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Unpublish
              </button>
            )}
            {t.canManage ? (
              <Link href={`/templates/${t.id}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-navy ring-1 ring-slate-300 hover:bg-slate-50">
                Edit
              </Link>
            ) : (
              <span className="text-xs text-slate-400">View only</span>
            )}
            {t.canManage && (
              <button
                onClick={() => onDelete(t.id, t.name)}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${
        selected
          ? "bg-navy text-white ring-navy"
          : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

const BADGE_CLASS: Record<string, string> = {
  EMPTY_DRAFT: "bg-amber-50 text-amber-800",
  FILLED_DRAFT: "bg-sky-50 text-sky-800",
  PUBLISHED: "bg-emerald-50 text-emerald-800",
  RETIRED: "bg-slate-100 text-slate-500",
};

function LifecycleBadge({ row }: { row: Row }) {
  const l = lifecycleOf(row);
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE_CLASS[l]}`}
      title={
        l === "FILLED_DRAFT"
          ? "Questions are written. Review them, then Publish to put it in front of field staff."
          : l === "EMPTY_DRAFT"
            ? "No questions yet — this template cannot be filled until it has at least one."
            : undefined
      }
    >
      {LIFECYCLE_LABEL[l]}
    </span>
  );
}
