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
 * Validation message for a room selection, or null when it's acceptable.
 * PER_ROOM templates need at least one room; everything is capped.
 */
export function validateRoomSelection({
  perRoom,
  count,
}: {
  perRoom: boolean;
  count: number;
}): string | null {
  if (perRoom && count === 0) {
    return "This checklist is per-room — select at least one room.";
  }
  if (count > MAX_ROOMS_PER_CREATE) {
    return `Select at most ${MAX_ROOMS_PER_CREATE} rooms at once.`;
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
