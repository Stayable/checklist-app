import { describe, expect, it } from "vitest";
import { InstanceStatus, InvalidationReason, Role } from "@prisma/client";
import {
  closesImmediately,
  decideClose,
  canDecideInvalidation,
  IMMEDIATE_REASONS,
  INVALIDATABLE_STATUSES,
  isInvalidationPending,
  REASON_LABELS,
  REASON_MESSAGE_KEY,
  REASON_ORDER,
  type InvalidatableInstance,
} from "./invalidation";

const HK = { id: "u-hk", role: Role.HK };
const OTHER_HK = { id: "u-other", role: Role.PA };
const MGR = { id: "u-mgr", role: Role.MANAGER };

const OPEN: InvalidatableInstance = {
  status: InstanceStatus.ASSIGNED,
  assignedUserId: HK.id,
  lockedAt: null,
  invalidationRequestedAt: null,
};

describe("closesImmediately", () => {
  it("closes on facts about the room", () => {
    expect(closesImmediately(InvalidationReason.STAYOVER)).toBe(true);
    expect(closesImmediately(InvalidationReason.ROOM_NOT_NEEDED)).toBe(true);
    expect(closesImmediately(InvalidationReason.DUPLICATE)).toBe(true);
  });

  it("requires approval for facts about the person", () => {
    expect(closesImmediately(InvalidationReason.STAFF_UNAVAILABLE)).toBe(false);
    expect(closesImmediately(InvalidationReason.NO_ACCESS)).toBe(false);
  });

  it("requires approval for OTHER", () => {
    // An unclassified reason is the case most worth a human reading, so the
    // catch-all must never be the cheap way to skip review.
    expect(closesImmediately(InvalidationReason.OTHER)).toBe(false);
  });
});

describe("decideClose — field staff", () => {
  it("closes their own assignment for a stayover", () => {
    expect(decideClose(OPEN, HK, InvalidationReason.STAYOVER)).toEqual({ kind: "close" });
  });

  it("files a request for a staffing reason", () => {
    expect(decideClose(OPEN, HK, InvalidationReason.STAFF_UNAVAILABLE)).toEqual({
      kind: "request",
    });
  });

  it("refuses someone else's assignment even for an immediate reason", () => {
    expect(decideClose(OPEN, OTHER_HK, InvalidationReason.STAYOVER)).toEqual({
      kind: "denied",
      reason: "not_yours",
    });
  });

  it("refuses a second request while one is open", () => {
    const pending = { ...OPEN, invalidationRequestedAt: new Date() };
    expect(decideClose(pending, HK, InvalidationReason.NO_ACCESS)).toEqual({
      kind: "denied",
      reason: "already_requested",
    });
  });

  it("still allows an immediate close while a request is open", () => {
    // Someone who filed "could not access the room" and then learns the guest
    // extended must not be trapped behind their own pending request. Closing
    // resolves the instance, so there is no pending reason left to overwrite.
    const pending = { ...OPEN, invalidationRequestedAt: new Date() };
    expect(decideClose(pending, HK, InvalidationReason.STAYOVER)).toEqual({ kind: "close" });
  });
});

describe("decideClose — managers", () => {
  it("closes directly, without a pending state, whatever the reason", () => {
    // A manager routed through their own approval queue is theatre.
    for (const reason of Object.values(InvalidationReason)) {
      expect(decideClose(OPEN, MGR, reason)).toEqual({ kind: "close" });
    }
  });

  it("may close an instance assigned to someone else", () => {
    expect(decideClose({ ...OPEN, assignedUserId: "someone-else" }, MGR, InvalidationReason.OTHER))
      .toEqual({ kind: "close" });
  });

  it("may close an unassigned instance", () => {
    expect(decideClose({ ...OPEN, assignedUserId: null }, MGR, InvalidationReason.ROOM_NOT_NEEDED))
      .toEqual({ kind: "close" });
  });
});

describe("decideClose — guards that outrank everything", () => {
  it("refuses a locked instance even for a manager", () => {
    const locked = { ...OPEN, lockedAt: new Date() };
    expect(decideClose(locked, MGR, InvalidationReason.STAYOVER)).toEqual({
      kind: "denied",
      reason: "locked",
    });
  });

  it("checks the lock before the status", () => {
    // A verified instance is REVIEWED, so both guards would fire; the lock is
    // the more accurate explanation and must win.
    const locked = { ...OPEN, status: InstanceStatus.REVIEWED, lockedAt: new Date() };
    expect(decideClose(locked, MGR, InvalidationReason.STAYOVER)).toEqual({
      kind: "denied",
      reason: "locked",
    });
  });

  const CLOSED_STATUSES = [
    InstanceStatus.SUBMITTED,
    InstanceStatus.REVIEWED,
    InstanceStatus.FLAGGED,
    InstanceStatus.INVALIDATED,
    InstanceStatus.EXPIRED,
  ];
  for (const status of CLOSED_STATUSES) {
    it(`refuses ${status}: submitted work is a record, not a schedule slot`, () => {
      expect(decideClose({ ...OPEN, status }, MGR, InvalidationReason.STAYOVER)).toEqual({
        kind: "denied",
        reason: "not_open",
      });
    });
  }

  it("allows every status on the allow-list", () => {
    for (const status of INVALIDATABLE_STATUSES) {
      expect(decideClose({ ...OPEN, status }, MGR, InvalidationReason.STAYOVER)).toEqual({
        kind: "close",
      });
    }
  });
});

describe("isInvalidationPending", () => {
  it("is true while a request is unanswered", () => {
    expect(
      isInvalidationPending({
        status: InstanceStatus.ASSIGNED,
        invalidationRequestedAt: new Date(),
      }),
    ).toBe(true);
  });

  it("is false once the instance is invalidated", () => {
    // An approved request keeps its requestedAt as history; without the status
    // check the pending lane would show every closed stayover forever.
    expect(
      isInvalidationPending({
        status: InstanceStatus.INVALIDATED,
        invalidationRequestedAt: new Date(),
      }),
    ).toBe(false);
  });

  it("is false when nothing was ever requested", () => {
    expect(
      isInvalidationPending({ status: InstanceStatus.ASSIGNED, invalidationRequestedAt: null }),
    ).toBe(false);
  });
});

describe("role authority", () => {
  it("is the portfolio and property management roles", () => {
    expect(canDecideInvalidation(Role.MANAGER)).toBe(true);
    expect(canDecideInvalidation(Role.CORPORATE)).toBe(true);
    expect(canDecideInvalidation(Role.ADMIN)).toBe(true);
  });

  it("excludes field staff and AGENT", () => {
    // AGENT is a checklist tester, not an approver — it must not inherit the
    // decision right just because it can reach manager checklist surfaces.
    for (const role of [Role.HK, Role.PA, Role.MT, Role.AGENT]) {
      expect(canDecideInvalidation(role)).toBe(false);
    }
  });
});

describe("reason tables stay complete", () => {
  const ALL = Object.values(InvalidationReason);

  it("labels every reason", () => {
    for (const r of ALL) expect(REASON_LABELS[r]).toBeTruthy();
  });

  it("maps every reason to a message key", () => {
    for (const r of ALL) expect(REASON_MESSAGE_KEY[r]).toBeTruthy();
  });

  it("orders every reason exactly once", () => {
    // A plain array cannot be checked by the compiler the way a Record can, so
    // a new enum member would silently vanish from the picker.
    expect([...REASON_ORDER].sort()).toEqual([...ALL].sort());
    expect(new Set(REASON_ORDER).size).toBe(REASON_ORDER.length);
  });

  it("keeps every immediate reason inside the enum", () => {
    for (const r of IMMEDIATE_REASONS) expect(ALL).toContain(r);
  });
});
