"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createInstanceManually } from "./actions";

type TemplateOpt = { id: string; name: string; scope: string };
type RoomOpt = { id: string; roomNumber: string; zone: string | null };
type UserOpt = { id: string; name: string };

export function ManualCreateClient({
  templates,
  rooms,
  assignees,
  activePropertyId,
  defaultTitleFor,
}: {
  templates: TemplateOpt[];
  rooms: RoomOpt[];
  assignees: UserOpt[];
  activePropertyId: string | null;
  defaultTitleFor: Record<string, string>; // templateId -> default title
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [title, setTitle] = useState(
    templates[0] ? (defaultTitleFor[templates[0].id] ?? "") : "",
  );
  const [roomId, setRoomId] = useState("");
  const [roomLabel, setRoomLabel] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");

  const selected = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );
  const perRoom = selected?.scope === "PER_ROOM";

  function onTemplateChange(id: string) {
    setTemplateId(id);
    setTitle(defaultTitleFor[id] ?? "");
  }

  function submit() {
    setError(null);
    if (!activePropertyId) {
      setError("Select a single property in the header first.");
      return;
    }
    if (perRoom && !roomId) {
      setError("This checklist is per-room — choose a room.");
      return;
    }
    startTransition(async () => {
      const res = await createInstanceManually({
        templateId,
        propertyId: activePropertyId,
        roomId: perRoom ? roomId || null : null,
        roomLabel: !perRoom ? roomLabel.trim() || undefined : undefined,
        assignedUserId: assignedUserId || null,
        title,
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
        <p className="text-sm text-slate-600">
          No templates available for this property.
        </p>
        <Link
          href="/templates/new"
          className="mt-3 inline-block rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white"
        >
          Create a checklist template first
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {error && (
        <div className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}
      <label className="text-sm font-medium text-slate-700">
        Template
        <select
          value={templateId}
          onChange={(e) => onTemplateChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {perRoom && (
        <label className="text-sm font-medium text-slate-700">
          Room
          <select
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select a room…</option>
            {/* Grouped by zone (building). A property here has 127-167 rooms,
                so a flat list of numbers is a scroll with no landmarks; the
                building is how staff actually locate a room. Rooms with no zone
                fall into a trailing group rather than disappearing. */}
            {groupRoomsByZone(rooms).map(([zone, group]) => (
              <optgroup key={zone} label={zone}>
                {group.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.roomNumber}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {!perRoom && (
        <label className="text-sm font-medium text-slate-700">
          Room label (optional)
          <input
            value={roomLabel}
            onChange={(e) => setRoomLabel(e.target.value)}
            placeholder='e.g. "Lobby", "Suite", "-"'
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}
      <label className="text-sm font-medium text-slate-700">
        Assign to (optional)
        <select
          value={assignedUserId}
          onChange={(e) => setAssignedUserId(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Unassigned</option>
          {assignees.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create now"}
        </button>
        <Link
          href="/templates"
          className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300"
        >
          Edit a template instead
        </Link>
      </div>
    </div>
  );
}

/** Rooms by zone, zones alphabetical, unzoned last. */
function groupRoomsByZone(rooms: RoomOpt[]): [string, RoomOpt[]][] {
  const groups = new Map<string, RoomOpt[]>();
  for (const room of rooms) {
    const key = room.zone ?? "Unassigned";
    const bucket = groups.get(key);
    if (bucket) bucket.push(room);
    else groups.set(key, [room]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });
}
