import { InstanceStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DUE_SOON_WINDOW_MINUTES,
  OVERDUE_BACKLOG_CUTOFF_HOURS,
  REMINDABLE_STATUSES,
  isRemindableStatus,
  reminderWindow,
  selectReminders,
  type RemindableInstance,
} from "./checklist-reminders";

// 2026-09-09 15:00 ET == 19:00 UTC (EDT, UTC-4).
const NOW = new Date("2026-09-09T19:00:00Z");

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

function row(overrides: Partial<RemindableInstance> & { id: string }): RemindableInstance {
  return {
    dueAt: null,
    status: InstanceStatus.ASSIGNED,
    remindedBeforeAt: null,
    remindedDueAt: null,
    ...overrides,
  };
}

function ids(rows: readonly RemindableInstance[]): string[] {
  return rows.map((r) => r.id);
}

describe("reminderWindow", () => {
  it("spans the backlog floor to the one-hour horizon", () => {
    const { backlogFloor, soonHorizon } = reminderWindow(NOW);
    expect(soonHorizon.getTime() - NOW.getTime()).toBe(DUE_SOON_WINDOW_MINUTES * MIN);
    expect(NOW.getTime() - backlogFloor.getTime()).toBe(OVERDUE_BACKLOG_CUTOFF_HOURS * HOUR);
  });
});

describe("isRemindableStatus", () => {
  it("admits exactly the three open statuses", () => {
    expect([...REMINDABLE_STATUSES]).toEqual([
      InstanceStatus.SCHEDULED,
      InstanceStatus.ASSIGNED,
      InstanceStatus.IN_PROGRESS,
    ]);
    for (const s of REMINDABLE_STATUSES) expect(isRemindableStatus(s)).toBe(true);
  });

  it("rejects every closed status", () => {
    // Enumerated rather than derived from the enum on purpose: if someone adds
    // a member to InstanceStatus, this test keeps passing and the ALLOW-list
    // below is what silently excludes it — which is the safe direction. The
    // hazard being guarded is the opposite one (a `notIn` list that silently
    // INCLUDES a new member and starts emailing about it).
    const closed = [
      InstanceStatus.SUBMITTED,
      InstanceStatus.REVIEWED,
      InstanceStatus.FLAGGED,
      InstanceStatus.INVALIDATED,
      InstanceStatus.EXPIRED,
    ];
    for (const s of closed) expect(isRemindableStatus(s)).toBe(false);
  });
});

describe("selectReminders — due_soon", () => {
  it("picks a deadline inside the next hour", () => {
    const rows = [row({ id: "a", dueAt: at(30 * MIN) })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(ids(dueSoon)).toEqual(["a"]);
    expect(dueNow).toEqual([]);
  });

  it("includes the exact 60-minute edge and excludes one millisecond beyond it", () => {
    const rows = [
      row({ id: "edge", dueAt: at(60 * MIN) }),
      row({ id: "beyond", dueAt: at(60 * MIN + 1) }),
    ];
    expect(ids(selectReminders(rows, NOW).dueSoon)).toEqual(["edge"]);
  });

  it("does not re-warn a row already stamped", () => {
    const rows = [row({ id: "a", dueAt: at(30 * MIN), remindedBeforeAt: at(-15 * MIN) })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(dueSoon).toEqual([]);
    expect(dueNow).toEqual([]);
  });

  it("ignores remindedDueAt when deciding the before-warning", () => {
    // Not a realistic row (a future deadline cannot have been chased) but the
    // two stamps must stay independent — either can be the one that failed.
    const rows = [row({ id: "a", dueAt: at(10 * MIN), remindedDueAt: at(-HOUR) })];
    expect(ids(selectReminders(rows, NOW).dueSoon)).toEqual(["a"]);
  });
});

describe("selectReminders — due_now", () => {
  it("picks a deadline that has just passed", () => {
    const rows = [row({ id: "a", dueAt: at(-MIN) })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(dueSoon).toEqual([]);
    expect(ids(dueNow)).toEqual(["a"]);
  });

  it("treats a deadline landing exactly on now as due, not due-soon", () => {
    const rows = [row({ id: "a", dueAt: NOW })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(dueSoon).toEqual([]);
    expect(ids(dueNow)).toEqual(["a"]);
  });

  it("never sends due_soon for something already overdue", () => {
    // Cron down through the deadline: the hour-before warning is now a lie, so
    // it is dropped and only the chase goes out.
    const rows = [row({ id: "a", dueAt: at(-5 * MIN), remindedBeforeAt: null })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(dueSoon).toEqual([]);
    expect(ids(dueNow)).toEqual(["a"]);
  });

  it("does not re-chase a row already stamped", () => {
    const rows = [row({ id: "a", dueAt: at(-2 * HOUR), remindedDueAt: at(-2 * HOUR) })];
    expect(selectReminders(rows, NOW).dueNow).toEqual([]);
  });
});

describe("selectReminders — 12h backlog cutoff", () => {
  it("chases up to and including the floor, and drops anything older", () => {
    const rows = [
      row({ id: "inside", dueAt: at(-(OVERDUE_BACKLOG_CUTOFF_HOURS * HOUR) + 1) }),
      row({ id: "floor", dueAt: at(-(OVERDUE_BACKLOG_CUTOFF_HOURS * HOUR)) }),
      row({ id: "stale", dueAt: at(-(OVERDUE_BACKLOG_CUTOFF_HOURS * HOUR) - 1) }),
    ];
    expect(ids(selectReminders(rows, NOW).dueNow)).toEqual(["inside", "floor"]);
  });

  it("does not blast a pile of history on first deploy", () => {
    // The scenario the cutoff exists for: every pre-column row has a null
    // remindedDueAt, so without a floor all of them look un-chased.
    const history = Array.from({ length: 50 }, (_, i) =>
      row({ id: `old-${i}`, dueAt: at(-(i + 1) * 24 * HOUR) }),
    );
    expect(selectReminders(history, NOW).dueNow).toEqual([]);
  });
});

describe("selectReminders — rows that never qualify", () => {
  it("skips a null dueAt in both directions", () => {
    // Deliberate: no deadline means nobody is reminded. Most instances have no
    // dueAt, so a fallback here would turn a quiet backlog into a broadcast.
    const rows = [row({ id: "a", dueAt: null })];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(dueSoon).toEqual([]);
    expect(dueNow).toEqual([]);
  });

  it("skips every closed status on both sides of the deadline", () => {
    const closed = [
      InstanceStatus.SUBMITTED,
      InstanceStatus.REVIEWED,
      InstanceStatus.FLAGGED,
      InstanceStatus.INVALIDATED,
      InstanceStatus.EXPIRED,
    ];
    for (const status of closed) {
      const rows = [
        row({ id: `soon-${status}`, status, dueAt: at(20 * MIN) }),
        row({ id: `late-${status}`, status, dueAt: at(-20 * MIN) }),
      ];
      const { dueSoon, dueNow } = selectReminders(rows, NOW);
      expect({ status, dueSoon: ids(dueSoon), dueNow: ids(dueNow) }).toEqual({
        status,
        dueSoon: [],
        dueNow: [],
      });
    }
  });

  it("reminds on each open status", () => {
    for (const status of REMINDABLE_STATUSES) {
      const rows = [row({ id: "a", status, dueAt: at(20 * MIN) })];
      expect(ids(selectReminders(rows, NOW).dueSoon)).toEqual(["a"]);
    }
  });
});

describe("selectReminders — idempotency across ticks", () => {
  it("goes quiet once both stamps are set", () => {
    // The 15-minute cron re-reads the same rows four times an hour. Walk one
    // checklist through warn -> chase -> silence, stamping as the route does.
    const due = at(45 * MIN);
    const instance = row({ id: "a", dueAt: due });

    const warn = selectReminders([instance], NOW);
    expect(ids(warn.dueSoon)).toEqual(["a"]);
    instance.remindedBeforeAt = NOW;

    // Two more ticks before the deadline: nothing further.
    for (const tick of [at(15 * MIN), at(30 * MIN)]) {
      const quiet = selectReminders([instance], tick);
      expect(quiet.dueSoon).toEqual([]);
      expect(quiet.dueNow).toEqual([]);
    }

    const afterDue = at(50 * MIN);
    const chase = selectReminders([instance], afterDue);
    expect(ids(chase.dueNow)).toEqual(["a"]);
    instance.remindedDueAt = afterDue;

    const silent = selectReminders([instance], at(65 * MIN));
    expect(silent.dueSoon).toEqual([]);
    expect(silent.dueNow).toEqual([]);
  });
});

describe("selectReminders — DST agnosticism", () => {
  // The windows are absolute-instant arithmetic, so the March spring-forward
  // and the November fall-back must not move them. ET wall clocks jump an hour
  // on these dates; "one hour before the deadline" does not.
  const springForward = new Date("2027-03-14T06:45:00Z"); // 01:45 EST, 15 min before the jump
  const fallBack = new Date("2026-11-01T05:45:00Z"); // 01:45 EDT, 15 min before the fall back

  for (const [label, moment] of [
    ["spring forward", springForward],
    ["fall back", fallBack],
  ] as const) {
    it(`keeps a 60-minute window across ${label}`, () => {
      const rows = [
        row({ id: "in", dueAt: new Date(moment.getTime() + 59 * MIN) }),
        row({ id: "edge", dueAt: new Date(moment.getTime() + 60 * MIN) }),
        row({ id: "out", dueAt: new Date(moment.getTime() + 61 * MIN) }),
      ];
      expect(ids(selectReminders(rows, moment).dueSoon)).toEqual(["in", "edge"]);
    });

    it(`keeps a 12-hour backlog floor across ${label}`, () => {
      const rows = [
        row({ id: "in", dueAt: new Date(moment.getTime() - 11 * HOUR) }),
        row({ id: "out", dueAt: new Date(moment.getTime() - 13 * HOUR) }),
      ];
      expect(ids(selectReminders(rows, moment).dueNow)).toEqual(["in"]);
    });
  }
});

describe("selectReminders — mixed batch", () => {
  it("routes a realistic tick correctly and preserves input order", () => {
    const rows = [
      row({ id: "warn-1", dueAt: at(45 * MIN) }),
      row({ id: "no-due", dueAt: null }),
      row({ id: "chase-1", dueAt: at(-10 * MIN) }),
      row({ id: "far-off", dueAt: at(4 * HOUR) }),
      row({ id: "warn-2", dueAt: at(5 * MIN) }),
      row({ id: "done", status: InstanceStatus.SUBMITTED, dueAt: at(-10 * MIN) }),
      row({ id: "chase-2", dueAt: at(-3 * HOUR) }),
      row({ id: "ancient", dueAt: at(-40 * HOUR) }),
      row({ id: "warned", dueAt: at(20 * MIN), remindedBeforeAt: at(-5 * MIN) }),
    ];
    const { dueSoon, dueNow } = selectReminders(rows, NOW);
    expect(ids(dueSoon)).toEqual(["warn-1", "warn-2"]);
    expect(ids(dueNow)).toEqual(["chase-1", "chase-2"]);
  });
});
