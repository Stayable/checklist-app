import { InstanceMultiplicity, TemplateScope } from "@prisma/client";

import { formatDateInET } from "./datetime";

/**
 * Default title for a manually-created checklist instance:
 * "{template name} — {Mon D, YYYY}" formatted in ET.
 *
 * Uses formatDateInET (no "ET" suffix) — the suffix is for time displays only.
 */
export function nextManualLabelDefault(templateName: string, date: Date): string {
  return `${templateName} — ${formatDateInET(date, "MMM d, yyyy")}`;
}

/**
 * Upper bound on rooms per manual create. Each selected room becomes its own
 * ChecklistInstance (ADR-009: one instance = one room, one system ID, one PDF,
 * one review row), so a large selection is a large write batch.
 *
 * 200 clears the largest property with headroom. Measured from
 * scripts/data/RoomZoning_Stayable_081226.json (1,172 rooms loaded 2026-08-12):
 * KE 167, KW 160, LL 157, DP 153, SA 140, OR 135, JW 133, JN 127, and the
 * largest single zone is 80 (DP Building B).
 *
 * This was 60, with a comment claiming 60 was above the biggest property. That
 * was wrong -- it was written when the dev DB held 5 demo rooms. At 60 the cap
 * blocked not just a whole-property create but a single building, which is the
 * "Building A today" case the zone grouping exists to serve.
 */
export const MAX_ROOMS_PER_CREATE = 200;

export type RoomPlan = {
  /** Room ids to create, de-duplicated, in the order given. */
  create: string[];
  /** Room ids skipped because a live instance already exists today. */
  duplicates: string[];
};

/**
 * Decide which of the selected rooms actually get an instance.
 *
 * A room is a duplicate when it already has a live (non-INVALIDATED,
 * non-EXPIRED) instance of the same template on the same ET day. Duplicates
 * are skipped unless the caller explicitly forces them (ADR-009 keeps a
 * force-create path), so the common case can't silently double-book a room.
 */
export function planRoomInstances({
  selectedRoomIds,
  existingRoomIds = [],
  allowDuplicates = false,
}: {
  selectedRoomIds: readonly string[];
  existingRoomIds?: readonly string[];
  allowDuplicates?: boolean;
}): RoomPlan {
  const existing = new Set(existingRoomIds);
  const seen = new Set<string>();
  const create: string[] = [];
  const duplicates: string[] = [];

  for (const id of selectedRoomIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (!allowDuplicates && existing.has(id)) {
      duplicates.push(id);
      continue;
    }
    create.push(id);
  }
  return { create, duplicates };
}

/**
 * What a template enumerates when you create it.
 *
 * Replaces the `perRoom` boolean, which could only express two of four cases
 * and silently treated everything that was not PER_ROOM as "one instance, no
 * subject" -- which is wrong for a per-PA or per-task template.
 */
export type SubjectKind = "ROOM" | "ASSIGNEE" | "TASK" | "NONE";

export type SubjectPlan =
  | { ok: true; kind: SubjectKind }
  | { ok: false; error: string };

/**
 * Resolve the two scope axes into the one thing the create screen enumerates.
 *
 * `copies` wins when it is not ONE, because the multiplicity axis names the
 * thing you tick: a PER_ASSIGNEE template enumerates people even though its
 * subject is the property.
 *
 * PER_ROOM combined with a non-ONE multiplicity is REJECTED rather than
 * resolved. It would mean one instance per room per person -- a cross product
 * nothing in the estate asks for, and quietly picking one of the two axes would
 * create a confidently wrong number of checklists.
 */
export function subjectKindFor(
  scope: TemplateScope,
  copies: InstanceMultiplicity,
): SubjectPlan {
  if (scope === TemplateScope.PER_ROOM && copies !== InstanceMultiplicity.ONE) {
    return {
      ok: false,
      error:
        "A per-room checklist cannot also be per-person or per-task. Set the template to one copy per room.",
    };
  }
  if (copies === InstanceMultiplicity.PER_ASSIGNEE) return { ok: true, kind: "ASSIGNEE" };
  if (copies === InstanceMultiplicity.PER_TASK) return { ok: true, kind: "TASK" };
  if (scope === TemplateScope.PER_ROOM) return { ok: true, kind: "ROOM" };
  return { ok: true, kind: "NONE" };
}

/** Noun for a subject kind, singular and plural, for user-facing messages. */
const SUBJECT_NOUN: Record<Exclude<SubjectKind, "NONE">, [string, string]> = {
  ROOM: ["room", "rooms"],
  ASSIGNEE: ["person", "people"],
  TASK: ["task", "tasks"],
};

/**
 * Validation message for a subject selection, or null when it's acceptable.
 * A template that enumerates something needs at least one; everything is capped.
 */
export function validateSubjectSelection({
  kind,
  count,
}: {
  kind: SubjectKind;
  count: number;
}): string | null {
  if (kind === "NONE") {
    return count > 0
      ? "This checklist covers the whole property — there is nothing to select."
      : null;
  }
  const [one, many] = SUBJECT_NOUN[kind];
  if (count === 0) {
    return `This checklist is per-${one} — select at least one ${one}.`;
  }
  if (count > MAX_ROOMS_PER_CREATE) {
    return `Select at most ${MAX_ROOMS_PER_CREATE} ${many} at once.`;
  }
  return null;
}

/** Human summary of a batch create, for the success toast / redirect message. */
export function summarizeCreateResult({
  created,
  duplicates = 0,
  failed = 0,
}: {
  created: number;
  duplicates?: number;
  failed?: number;
}): string {
  const parts = [
    `Created ${created} checklist${created === 1 ? "" : "s"}.`,
  ];
  if (duplicates > 0) {
    parts.push(
      `${duplicates} room${duplicates === 1 ? "" : "s"} skipped — already had one today.`,
    );
  }
  if (failed > 0) {
    parts.push(`${failed} failed.`);
  }
  return parts.join(" ");
}

/**
 * Normalise the two room-selection shapes the create action accepts.
 *
 * The multi-select client posts `roomIds: string[]`; the older client posts a
 * single `roomId`. Zod strips unknown keys, so when the action only knew about
 * `roomIds` the old client's room silently vanished and every PER_ROOM create
 * was rejected with "select at least one room" -- while typecheck stayed clean,
 * because the mismatch lives across the form boundary where types do not reach.
 *
 * `roomIds` wins whenever it is non-empty, so a new client is never overridden
 * by a stale singular field. Drop the `roomId` parameter once no client sends it.
 */
export function resolveRoomIds({
  roomIds,
  roomId,
}: {
  roomIds?: readonly string[] | null;
  roomId?: string | null;
}): string[] {
  if (roomIds && roomIds.length > 0) return [...roomIds];
  return roomId ? [roomId] : [];
}
