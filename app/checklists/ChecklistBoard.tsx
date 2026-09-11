"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { deleteChecklists } from "./actions";

// The dispatch board, plus a selection mode for deleting mis-created work.
//
// Selection is OFF by default and the rows stay plain links. This is the
// surface on-site managers open on a phone to see what is outstanding; a column
// of checkboxes on every row, every day, would tax the common case to serve a
// rare one. "Select" turns the board into a picker, and while it is on the rows
// stop navigating — a half-armed state where some taps open a checklist and
// others tick it is how the wrong thing gets deleted.
//
// Rendering lives here rather than in page.tsx because selection has to reach
// each row. The view models are built server-side and passed in as primitives,
// so this component holds no formatting rules and cannot disagree with the
// rest of the app about what a status is called.

export type BoardRow = {
  id: string;
  templateName: string;
  /** Room number or free-text label; empty when the checklist is property-wide. */
  subject: string;
  propertyShortCode: string;
  assigneeLabel: string;
  statusWord: string;
  railClass: string;
  textClass: string;
  /** "Took 12m" once submitted, else empty. */
  tookLabel: string;
};

export type BoardDay = {
  ymd: string;
  heading: string;
  dateLabel: string;
  late: boolean;
  rows: BoardRow[];
};

export function ChecklistBoard({
  days,
  showingProperty,
}: {
  days: BoardDay[];
  showingProperty: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<
    | { kind: "ok"; text: string; refused: { title: string; reason: string }[] }
    | { kind: "err"; text: string }
    | null
  >(null);

  const allIds = useMemo(() => days.flatMap((d) => d.rows.map((r) => r.id)), [days]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function onDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !confirm(
        `Delete ${ids.length} checklist${ids.length === 1 ? "" : "s"}? This can't be undone.\n\n` +
          `Anything already started, submitted, or with an issue raised from it will be kept.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteChecklists({ ids });
      if (!res.ok) {
        setResult({ kind: "err", text: res.error });
        return;
      }
      setResult({
        kind: "ok",
        text:
          (res.deleted === 0
            ? "Nothing was deleted."
            : `Deleted ${res.deleted} checklist${res.deleted === 1 ? "" : "s"}.`) +
          // A stale page is the ordinary cause — somebody else deleted or
          // moved them between the render and the click.
          (res.skipped > 0 ? ` ${res.skipped} were already gone.` : ""),
        refused: res.refused,
      });
      exitSelect();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {result && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            result.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{result.text}</span>
            <button onClick={() => setResult(null)} className="shrink-0 text-xs underline">
              dismiss
            </button>
          </div>
          {/* Naming what was KEPT, and why, is the point of the partial-batch
              design — a silent "deleted 28 of 30" would leave someone hunting
              for the two. */}
          {result.kind === "ok" && result.refused.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
              {result.refused.map((r) => (
                <li key={r.title}>
                  <span className="font-semibold">{r.title}</span> — kept, {r.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {selecting ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                {selected.size} selected
              </span>
              <button
                onClick={() => setSelected(new Set(allIds))}
                className="rounded-md px-2 py-1 text-xs font-semibold text-navy ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Select all {allIds.length} on this page
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => setSelected(new Set())}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exitSelect}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                disabled={pending || selected.size === 0}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                Delete {selected.size > 0 ? selected.size : ""}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setSelecting(true)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            Select to delete
          </button>
        )}
      </div>

      {selecting && (
        <p className="text-xs text-slate-500">
          For checklists created by mistake. Anything already started, submitted, or with an issue
          raised from it is kept — to cancel work that was real but is no longer needed, open it and
          close it out instead.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {days.map((day) => (
          <section key={day.ymd}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 className={`text-sm font-bold ${day.late ? "text-red-600" : "text-slate-900"}`}>
                {day.heading}
                {day.late && <span className="ml-2 font-semibold">— overdue</span>}
              </h2>
              <span className="text-xs text-slate-400">{day.dateLabel}</span>
            </div>

            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
              {day.rows.map((r) => {
                const checked = selected.has(r.id);
                const body = (
                  <>
                    {/* Status as a rail: scannable down the left edge without
                        adding a column. */}
                    <span aria-hidden className={`w-1 shrink-0 ${r.railClass}`} />
                    {selecting && (
                      <span className="flex items-center pl-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          tabIndex={-1}
                          className="pointer-events-none size-4 accent-red-600"
                        />
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-3 pr-3">
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-slate-900">
                            {r.templateName}
                          </span>
                          {r.subject && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                              {r.subject}
                            </span>
                          )}
                          {/* Only when the scope spans properties — otherwise
                              every row says the same thing. */}
                          {showingProperty && (
                            <span className="rounded bg-navy/5 px-1.5 py-0.5 text-xs font-semibold text-navy">
                              {r.propertyShortCode}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-slate-500">
                          {r.assigneeLabel}
                          {r.tookLabel && <> · {r.tookLabel}</>}
                        </span>
                      </span>
                      <span className={`text-sm font-semibold ${r.textClass}`}>{r.statusWord}</span>
                      {!selecting && (
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate-300" />
                      )}
                    </span>
                  </>
                );

                return (
                  <li key={r.id}>
                    {selecting ? (
                      <button
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggle(r.id)}
                        className={`flex w-full items-stretch gap-3 text-left focus:outline-none ${
                          checked ? "bg-red-50" : "hover:bg-slate-50"
                        }`}
                      >
                        {body}
                      </button>
                    ) : (
                      <Link
                        href={`/checklists/${r.id}`}
                        className="flex items-stretch gap-3 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
