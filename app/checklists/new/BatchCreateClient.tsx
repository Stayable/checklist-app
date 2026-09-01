"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InstanceMultiplicity, Role, TemplateScope } from "@prisma/client";

import { subjectKindFor, type SubjectKind } from "@/lib/manual-create";
import {
  MAX_INSTANCES_PER_CREATE,
  planBatches,
  type BatchInput,
} from "@/lib/batch-create";
import { buildInstanceName, type ScopeToken } from "@/lib/instance-name";
import { etYYYYMMDD } from "@/lib/datetime";
import { createChecklistBatches } from "./batch.actions";

// W4 — the batch create wizard.
//
// One or more batches, each a template plus its subjects plus its dates. The
// preview is computed with the SAME planBatches/buildInstanceName the server
// action uses, so the names shown are the names written — a preview that
// recomputes its own list is a confirmation of something else.

export type TemplateOpt = {
  id: string;
  name: string;
  scope: TemplateScope;
  copies: InstanceMultiplicity;
  defaultRole: Role;
};
export type RoomOpt = { id: string; roomNumber: string; zone: string | null };
export type UserOpt = { id: string; name: string; role: Role };

type Batch = {
  uid: string;
  templateId: string;
  roomIds: string[];
  assigneeIds: string[];
  taskText: string;
  dates: string[];
  assignedUserId: string | null;
  dueTime: string;
};

const newUid = () => crypto.randomUUID();

function emptyBatch(templateId: string): Batch {
  return {
    uid: newUid(),
    templateId,
    roomIds: [],
    assigneeIds: [],
    taskText: "",
    dates: [etYYYYMMDD()],
    assignedUserId: null,
    dueTime: "",
  };
}

/** Rooms grouped by zone. A property here has 127–167 rooms; a flat list of
 *  numbers is a scroll with no landmarks, and "Building A today" is how the
 *  work is actually split. */
function groupRoomsByZone(rooms: RoomOpt[]): [string, RoomOpt[]][] {
  const by = new Map<string, RoomOpt[]>();
  for (const r of rooms) {
    const z = r.zone ?? "Unzoned";
    if (!by.has(z)) by.set(z, []);
    by.get(z)!.push(r);
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function taskLabelsFrom(text: string): string[] {
  return text
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function BatchCreateClient({
  templates,
  rooms,
  assignees,
  activePropertyId,
  propertyShortCode,
}: {
  templates: TemplateOpt[];
  rooms: RoomOpt[];
  assignees: UserOpt[];
  activePropertyId: string | null;
  propertyShortCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [batches, setBatches] = useState<Batch[]>(() =>
    templates.length > 0 ? [emptyBatch(templates[0]!.id)] : [],
  );

  const templateById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates],
  );
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const userById = useMemo(
    () => new Map(assignees.map((u) => [u.id, u])),
    [assignees],
  );
  const zones = useMemo(() => groupRoomsByZone(rooms), [rooms]);

  function kindOf(batch: Batch): SubjectKind | null {
    const t = templateById.get(batch.templateId);
    if (!t) return null;
    const s = subjectKindFor(t.scope, t.copies);
    return s.ok ? s.kind : null;
  }

  function patch(uid: string, next: Partial<Batch>) {
    setBatches((bs) => bs.map((b) => (b.uid === uid ? { ...b, ...next } : b)));
  }

  // ---- preview: the exact rows the action will write ------------------------
  const preview = useMemo(() => {
    const inputs: BatchInput[] = [];
    const kinds: SubjectKind[] = [];
    for (const b of batches) {
      // Resolved from templateById directly rather than through kindOf, so the
      // memo's dependencies are the data it actually reads.
      const t = templateById.get(b.templateId);
      if (!t) return { ok: false as const, error: "Pick a template." };
      const resolved = subjectKindFor(t.scope, t.copies);
      if (!resolved.ok) return { ok: false as const, error: resolved.error };
      const k = resolved.kind;
      inputs.push({
        templateId: b.templateId,
        roomIds: b.roomIds,
        assigneeIds: b.assigneeIds,
        taskLabels: taskLabelsFrom(b.taskText),
        dates: b.dates,
        assignedUserId: b.assignedUserId,
      });
      kinds.push(k);
    }
    const plan = planBatches(inputs, kinds);
    if (!plan.ok) return plan;
    const named = plan.instances.map((p) => {
      const t = templateById.get(p.templateId)!;
      const token: ScopeToken = p.roomId
        ? { kind: "ROOM", roomNumber: roomById.get(p.roomId)?.roomNumber ?? "?" }
        : p.assigneeId
          ? { kind: "ASSIGNEE", name: userById.get(p.assigneeId)?.name ?? "?" }
          : p.taskLabel
            ? { kind: "TASK", label: p.taskLabel }
            : { kind: "NONE" };
      return {
        key: `${p.batchIndex}-${p.date}-${p.roomId ?? p.assigneeId ?? p.taskLabel ?? ""}`,
        batchIndex: p.batchIndex,
        name: buildInstanceName({
          templateName: t.name,
          shortCode: propertyShortCode,
          token,
          // Parse as an ET calendar day at midday so the format cannot slip a
          // day either side of a timezone boundary.
          date: new Date(`${p.date}T12:00:00Z`),
        }),
      };
    });
    return { ok: true as const, instances: named };
  }, [batches, templateById, roomById, userById, propertyShortCode]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createChecklistBatches({
        propertyId: activePropertyId,
        allowDuplicates,
        batches: batches.map((b) => ({
          templateId: b.templateId,
          roomIds: b.roomIds,
          assigneeIds: b.assigneeIds,
          taskLabels: taskLabelsFrom(b.taskText),
          dates: b.dates,
          assignedUserId: b.assignedUserId,
          dueTime: b.dueTime || null,
        })),
      });
      if (!res.ok) {
        setConfirming(false);
        setError(res.error);
        return;
      }
      router.push(res.created === 1 && res.firstId ? `/checklists/${res.firstId}` : "/checklists");
      router.refresh();
    });
  }

  if (!activePropertyId) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        Pick a property in the header to create checklists.
      </p>
    );
  }
  if (templates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
        No active templates at this property yet. Add questions to a draft
        template to activate it.
      </p>
    );
  }

  const total = preview.ok ? preview.instances.length : 0;

  return (
    <div className="flex flex-col gap-5">
      {batches.map((batch, i) => {
        const kind = kindOf(batch);
        const template = templateById.get(batch.templateId);
        const pool = template
          ? assignees.filter((u) => u.role === template.defaultRole)
          : [];
        const batchPreview = preview.ok
          ? preview.instances.filter((p) => p.batchIndex === i)
          : [];

        return (
          <section
            key={batch.uid}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Batch {i + 1}
              </h2>
              {batches.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setBatches((bs) => bs.filter((b) => b.uid !== batch.uid))
                  }
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </header>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Checklist
                <select
                  value={batch.templateId}
                  onChange={(e) =>
                    // Subjects belong to the old template's shape; carrying them
                    // across would submit rooms for a per-person checklist.
                    patch(batch.uid, {
                      templateId: e.target.value,
                      roomIds: [],
                      assigneeIds: [],
                      taskText: "",
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Assign to
                  <select
                    value={batch.assignedUserId ?? ""}
                    onChange={(e) =>
                      patch(batch.uid, { assignedUserId: e.target.value || null })
                    }
                    disabled={kind === "ASSIGNEE"}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">Unassigned</option>
                    {assignees.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Due (ET)
                  <input
                    type="time"
                    value={batch.dueTime}
                    onChange={(e) => patch(batch.uid, { dueTime: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>

            {/* ---- subjects, by kind ---- */}
            <div className="mt-4">
              {kind === "ROOM" && (
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Rooms ({batch.roomIds.length} selected)
                  </legend>
                  <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-slate-200 p-2">
                    {zones.map(([zone, group]) => {
                      const ids = group.map((r) => r.id);
                      const allOn = ids.every((id) => batch.roomIds.includes(id));
                      return (
                        <div key={zone} className="mb-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {zone}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                patch(batch.uid, {
                                  roomIds: allOn
                                    ? batch.roomIds.filter((id) => !ids.includes(id))
                                    : [...new Set([...batch.roomIds, ...ids])],
                                })
                              }
                              className="text-xs font-medium text-navy hover:underline"
                            >
                              {allOn ? "Clear" : `Select all ${group.length}`}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.map((r) => {
                              const on = batch.roomIds.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() =>
                                    patch(batch.uid, {
                                      roomIds: on
                                        ? batch.roomIds.filter((x) => x !== r.id)
                                        : [...batch.roomIds, r.id],
                                    })
                                  }
                                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                                    on
                                      ? "bg-navy text-white"
                                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  {r.roomNumber}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {kind === "ASSIGNEE" && (
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700">
                    Who is on shift ({batch.assigneeIds.length} selected)
                  </legend>
                  {pool.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      Nobody with the {template?.defaultRole} role is assigned to
                      this property.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {pool.map((u) => {
                        const on = batch.assigneeIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() =>
                              patch(batch.uid, {
                                assigneeIds: on
                                  ? batch.assigneeIds.filter((x) => x !== u.id)
                                  : [...batch.assigneeIds, u.id],
                              })
                            }
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                              on
                                ? "bg-navy text-white"
                                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            {u.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              )}

              {kind === "TASK" && (
                <label className="text-sm font-medium text-slate-700">
                  Tasks — one per line
                  <textarea
                    value={batch.taskText}
                    onChange={(e) => patch(batch.uid, { taskText: e.target.value })}
                    rows={4}
                    placeholder={"Pool gate\nJetting drain lines"}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}

              {kind === "NONE" && (
                <p className="text-sm text-slate-500">
                  Covers the whole property — nothing to select.
                </p>
              )}
            </div>

            {/* ---- dates ---- */}
            <div className="mt-4">
              <span className="text-sm font-medium text-slate-700">Dates</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {batch.dates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                  >
                    {d}
                    <button
                      type="button"
                      onClick={() =>
                        patch(batch.uid, {
                          dates: batch.dates.filter((x) => x !== d),
                        })
                      }
                      aria-label={`Remove ${d}`}
                      className="text-slate-400 hover:text-red-600"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="date"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (!batch.dates.includes(v)) {
                      patch(batch.uid, { dates: [...batch.dates, v].sort() });
                    }
                    e.target.value = "";
                  }}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                />
              </div>
            </div>

            {/* ---- name preview ---- */}
            {batchPreview.length > 0 && (
              <div className="mt-4 rounded-md bg-slate-50 p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview — {batchPreview.length} checklist
                  {batchPreview.length === 1 ? "" : "s"}
                </p>
                <ul className="max-h-32 overflow-y-auto font-mono text-xs text-slate-700">
                  {batchPreview.slice(0, 40).map((p) => (
                    <li key={p.key}>{p.name}</li>
                  ))}
                  {batchPreview.length > 40 && (
                    <li className="text-slate-400">
                      …and {batchPreview.length - 40} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </section>
        );
      })}

      <button
        type="button"
        onClick={() =>
          setBatches((bs) => [...bs, emptyBatch(templates[0]!.id)])
        }
        className="self-start rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        + Add another batch
      </button>

      {!preview.ok && (
        <p className="text-sm text-amber-700">{preview.error}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={allowDuplicates}
          onChange={(e) => setAllowDuplicates(e.target.checked)}
        />
        Create even if one already exists that day
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={!preview.ok || total === 0 || pending}
          onClick={() => setConfirming(true)}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Create {total > 0 ? total : ""}
        </button>
        <span className="text-sm text-slate-500">
          {total > MAX_INSTANCES_PER_CREATE
            ? `Over the ${MAX_INSTANCES_PER_CREATE} limit`
            : total > 0
              ? `${total} checklist${total === 1 ? "" : "s"} will be created`
              : ""}
        </span>
      </div>

      {/* ---- confirm ---- */}
      {confirming && preview.ok && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">
                Create {total} checklist{total === 1 ? "" : "s"}?
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                These exact names will be created at {propertyShortCode}.
              </p>
            </div>
            <ul className="max-h-[45vh] overflow-y-auto p-4 font-mono text-xs text-slate-700">
              {preview.instances.map((p) => (
                <li key={p.key}>{p.name}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
