// S1 (StayCheck v1.1) — review-immutability core.
//
// Once a manager verifies a checklist (Task 3), `lockedAt` is stamped and the
// instance becomes immutable: no approve/flag/re-do and no (re)submit. Only an
// ADMIN unlock (which clears the verify fields incl. `lockedAt`) reopens it.
// `lockedAt` is the single enforcement anchor — every mutation path checks it.

/** Minimal shape needed to decide lock state. */
export type Lockable = { lockedAt: Date | null };

/** True once the instance has been verified-and-locked. */
export function isLocked(instance: Lockable): boolean {
  return instance.lockedAt != null;
}

/** Thrown by throw-based mutation paths when an instance is locked. */
export class InstanceLockedError extends Error {
  constructor() {
    super(
      "This checklist has been verified and locked. An admin must unlock it before it can be changed.",
    );
    this.name = "InstanceLockedError";
  }
}

/** Guard for throw-based paths; no-op when unlocked. */
export function assertUnlocked(instance: Lockable): void {
  if (isLocked(instance)) throw new InstanceLockedError();
}
