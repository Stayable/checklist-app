// Invalidation — closing out an assignment that stopped being needed or doable.
//
// ADR-014 made self-invalidation a request that a MANAGER or ADMIN approves.
// Amended by Kyle 2026-08-22 after Bea's test-round feedback: the approval step
// was aimed at a field user silently dropping work that still needs doing, and
// a stayover is not that — the work ceased to exist. So the split is by what
// the reason is a fact ABOUT:
//
//   about the ROOM   (stayover, not needed, duplicate)  -> closes immediately
//   about the PERSON (unavailable, no access, other)    -> needs approval
//
// Immediate closure is still fully audited and still notifies a manager; what
// it skips is the wait, not the record. OTHER needs approval on purpose: an
// unclassified reason is precisely the case a human should read.

import { InstanceStatus, InvalidationReason, Role } from "@prisma/client";

/**
 * Statuses an instance can be closed from. Submitted work is deliberately
 * excluded: a checklist that was filled in and reviewed is a record, and
 * "this shouldn't have been done" is a review outcome (flag / re-do), not an
 * invalidation. Written as an explicit allow-list rather than "not terminal"
 * so a future status has to be considered rather than silently admitted.
 */
export const INVALIDATABLE_STATUSES: readonly InstanceStatus[] = [
  InstanceStatus.SCHEDULED,
  InstanceStatus.ASSIGNED,
  InstanceStatus.IN_PROGRESS,
] as const;

/** Reasons that close the instance the moment they are given. */
export const IMMEDIATE_REASONS: readonly InvalidationReason[] = [
  InvalidationReason.STAYOVER,
  InvalidationReason.ROOM_NOT_NEEDED,
  InvalidationReason.DUPLICATE,
] as const;

/** True when this reason closes without waiting for a manager. */
export function closesImmediately(reason: InvalidationReason): boolean {
  return IMMEDIATE_REASONS.includes(reason);
}

/** Minimal instance shape the decisions need. */
export type InvalidatableInstance = {
  status: InstanceStatus;
  assignedUserId: string | null;
  lockedAt: Date | null;
  invalidationRequestedAt: Date | null;
};

export type Actor = { id: string; role: Role };

/** Portfolio + property management roles decide requests and close directly. */
export function canDecideInvalidation(role: Role): boolean {
  return role === Role.MANAGER || role === Role.CORPORATE || role === Role.ADMIN;
}

export type CloseOutcome =
  /** Closes now: either an immediate reason, or an actor who is the authority. */
  | { kind: "close" }
  /** Files a request for a manager to decide. */
  | { kind: "request" }
  | { kind: "denied"; reason: CloseDenial };

export type CloseDenial =
  | "locked"
  | "not_open"
  | "already_requested"
  | "not_yours";

/**
 * What happens when `actor` asks to close `instance` for `reason`.
 *
 * Property scope is NOT decided here — it needs a DB read of the actor's
 * memberships, so callers pair this with canAccessProperty. This function owns
 * only the parts that are pure, which is what makes them testable.
 */
export function decideClose(
  instance: InvalidatableInstance,
  actor: Actor,
  reason: InvalidationReason,
): CloseOutcome {
  // Lock first: a verified instance is immutable regardless of who is asking
  // or why (lib/review-lock.ts is the single enforcement anchor).
  if (instance.lockedAt != null) return { kind: "denied", reason: "locked" };
  if (!INVALIDATABLE_STATUSES.includes(instance.status)) {
    return { kind: "denied", reason: "not_open" };
  }

  const authority = canDecideInvalidation(actor.role);

  // A manager closing directly is not "approving their own request" — they ARE
  // the approval authority, so routing them through a pending state would be
  // theatre. They may also close an instance assigned to someone else.
  if (authority) return { kind: "close" };

  // Everyone else may only close their own assignment.
  if (instance.assignedUserId !== actor.id) {
    return { kind: "denied", reason: "not_yours" };
  }

  // An immediate reason wins even over an open request. Ordering matters: a
  // housekeeper who filed "could not access the room" and then learns the guest
  // extended would otherwise be trapped behind their own pending request until
  // a manager got to it. Closing resolves the instance outright, so there is no
  // pending reason left for it to overwrite.
  if (closesImmediately(reason)) return { kind: "close" };

  // One open request at a time, so a second tap cannot replace the reason a
  // manager is in the middle of reading.
  if (instance.invalidationRequestedAt != null) {
    return { kind: "denied", reason: "already_requested" };
  }

  return { kind: "request" };
}

/** True when this instance is waiting on a manager's decision. */
export function isInvalidationPending(instance: {
  status: InstanceStatus;
  invalidationRequestedAt: Date | null;
}): boolean {
  return (
    instance.invalidationRequestedAt != null &&
    instance.status !== InstanceStatus.INVALIDATED
  );
}

export const REASON_LABELS: Record<InvalidationReason, string> = {
  STAYOVER: "Stayover — guest extended",
  ROOM_NOT_NEEDED: "Room not needed today",
  DUPLICATE: "Duplicate checklist",
  STAFF_UNAVAILABLE: "Staff unavailable",
  NO_ACCESS: "Could not access the room",
  OTHER: "Other",
};

/** Message-catalog key per reason, for the bilingual field-facing picker. */
export const REASON_MESSAGE_KEY: Record<InvalidationReason, string> = {
  STAYOVER: "reasonStayover",
  ROOM_NOT_NEEDED: "reasonRoomNotNeeded",
  DUPLICATE: "reasonDuplicate",
  STAFF_UNAVAILABLE: "reasonStaffUnavailable",
  NO_ACCESS: "reasonNoAccess",
  OTHER: "reasonOther",
};

/** Display order: the everyday cases first, the catch-all last. */
export const REASON_ORDER: readonly InvalidationReason[] = [
  InvalidationReason.STAYOVER,
  InvalidationReason.ROOM_NOT_NEEDED,
  InvalidationReason.NO_ACCESS,
  InvalidationReason.STAFF_UNAVAILABLE,
  InvalidationReason.DUPLICATE,
  InvalidationReason.OTHER,
] as const;
