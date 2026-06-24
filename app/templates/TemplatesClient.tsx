"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteTemplate } from "./actions";

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
};

export function TemplatesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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
      {rows.map((t) => (
        <div key={t.id} className="flex items-center justify-between rounded-lg bg-white p-4 ring-1 ring-slate-200 shadow-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900">{t.name}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{t.code}</span>
              {t.allProperties && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">All properties</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {t.questionCount} question{t.questionCount === 1 ? "" : "s"} · {t.scope} · {t.instanceCount} checklist{t.instanceCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
