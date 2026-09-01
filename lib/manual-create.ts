import { InstanceMultiplicity, TemplateScope } from "@prisma/client";

/**
 * Upper bound on subjects (rooms, people, tasks) in a single batch.
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
 *
 * The SUBMISSION-wide cap is MAX_INSTANCES_PER_CREATE in lib/batch-create.ts;
 * subjects multiply by dates and by batches.
 */
export const MAX_ROOMS_PER_CREATE = 200;

/**
 * What a template enumerates when you create it.
 *
 * Replaces the `perRoom` boolean, which could only express two of four cases
 * and silently treated everything that was not PER_ROOM as "one instance, no
 * subject" -- wrong for a per-PA or per-task template.
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
  if (copies === InstanceMultiplicity.PER_ASSIGNEE)
    return { ok: true, kind: "ASSIGNEE" };
  if (copies === InstanceMultiplicity.PER_TASK) return { ok: true, kind: "TASK" };
  if (scope === TemplateScope.PER_ROOM) return { ok: true, kind: "ROOM" };
  return { ok: true, kind: "NONE" };
}
