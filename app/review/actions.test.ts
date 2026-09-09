import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompletionCheck, InstanceStatus, IssuePriority } from "@prisma/client";

// Under test: the four rows of the review state machine (see ../actions.ts) and
// the two rules the UI only *hints* at — completion check required, note
// required on a Fail or a Flag. Prisma, RBAC, issues and the notification path
// are mocked; none of them decide any of that, and mocking the notifier is what
// makes "who gets told, and with which event" assertable.
const mocks = vi.hoisted(() => ({
  requireManager: vi.fn(),
  requireAdmin: vi.fn(),
  canAccessProperty: vi.fn(),
  instanceFindUnique: vi.fn(),
  transaction: vi.fn(),
  instanceUpdate: vi.fn(),
  auditCreate: vi.fn(),
  createIssue: vi.fn(),
  slaHoursByPriority: vi.fn(),
  logNotification: vi.fn(),
  deliverNotificationEmail: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    checklistInstance: { findUnique: mocks.instanceFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireManager: mocks.requireManager,
  requireAdmin: mocks.requireAdmin,
  canAccessProperty: mocks.canAccessProperty,
}));
vi.mock("@/lib/issues.server", () => ({
  createIssue: mocks.createIssue,
  slaHoursByPriority: mocks.slaHoursByPriority,
}));
vi.mock("@/lib/notify.server", () => ({
  logNotification: mocks.logNotification,
  deliverNotificationEmail: mocks.deliverNotificationEmail,
}));
// `revalidatePath` throws outside a request scope; the actions call it on every
// success path and it has nothing to do with what is being tested.
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { approveSubmission, flagSubmission } from "./actions";
// Not mocked — this is the real copy table. The `review_failed` strings live
// here rather than beside lib/notify-copy.test.ts because what they have to get
// right is a property of THIS flow: a closed fail raises no Issue.
import { notifyEmailCopy } from "@/lib/notify-copy";

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";

/** The row every test starts from: submitted, unlocked, assigned to someone
 *  who can therefore be notified. */
function instance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    propertyId: "p1",
    status: InstanceStatus.SUBMITTED,
    lockedAt: null,
    completionCheck: null,
    roomLabel: null,
    room: null,
    template: { name: "Arrival Checklist", collectsCheckoutFlags: false },
    property: { id: "p1", shortCode: "LL" },
    assignedUser: { id: "u9", name: "Bea", email: "bea@rentstayable.com", locale: "en" },
    ...overrides,
  };
}

/** The `data` handed to checklistInstance.update inside the transaction. */
function updateData(): Record<string, unknown> {
  const arg = mocks.instanceUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
  return arg.data;
}

/** The NotifyEvent passed to logNotification, or null when nobody was told. */
function notifiedEvent(): string | null {
  const call = mocks.logNotification.mock.calls[0];
  return call ? (call[2] as string) : null;
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();

  mocks.requireManager.mockResolvedValue({ id: "m1", role: "MANAGER" });
  mocks.canAccessProperty.mockResolvedValue(true);
  mocks.instanceFindUnique.mockResolvedValue(instance());
  mocks.slaHoursByPriority.mockResolvedValue({});
  mocks.createIssue.mockResolvedValue("issue-1");
  mocks.logNotification.mockResolvedValue("email-log-1");
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        checklistInstance: { update: mocks.instanceUpdate },
        auditLog: { create: mocks.auditCreate },
      }),
  );
});

describe("review state machine", () => {
  it("PASS + Closed → REVIEWED, completionCheck PASS, note optional, silent", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
    });

    expect(res).toEqual({ ok: true });
    expect(updateData()).toMatchObject({
      status: InstanceStatus.REVIEWED,
      completionCheck: CompletionCheck.PASS,
      managerNote: null,
    });
    // Good work does not generate email unless the manager asks for it.
    expect(mocks.logNotification).not.toHaveBeenCalled();
    expect(mocks.createIssue).not.toHaveBeenCalled();
  });

  it("PASS + Closed notifies only when the manager opts in", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
      note: "Nice work",
      notifyStaff: true,
    });

    expect(res).toEqual({ ok: true });
    expect(notifiedEvent()).toBe("review_approved");
    expect(mocks.deliverNotificationEmail).toHaveBeenCalledWith(
      "email-log-1",
      expect.objectContaining({ id: "u9" }),
      "review_approved",
      expect.any(String),
      "Nice work",
    );
  });

  it("FAIL + Closed → REVIEWED, completionCheck FAIL, always notifies review_failed", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "Bathroom photo missing",
      // Explicitly opting OUT must not silence a fail.
      notifyStaff: false,
    });

    expect(res).toEqual({ ok: true });
    expect(updateData()).toMatchObject({
      status: InstanceStatus.REVIEWED,
      completionCheck: CompletionCheck.FAIL,
      managerNote: "Bathroom photo missing",
    });
    expect(notifiedEvent()).toBe("review_failed");
    // A closed fail raises no Issue — which is exactly why it does not reuse
    // the review_flagged copy.
    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(mocks.deliverNotificationEmail).toHaveBeenCalledWith(
      "email-log-1",
      expect.objectContaining({ id: "u9" }),
      "review_failed",
      expect.any(String),
      "Bathroom photo missing",
    );
  });

  it("PASS + Flag → FLAGGED, completionCheck PASS, Issue created, always notifies", async () => {
    const res = await flagSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
      note: "Guest reported a smell after sign-off",
      priority: IssuePriority.HIGH,
    });

    expect(res).toEqual({ ok: true });
    expect(updateData()).toMatchObject({
      status: InstanceStatus.FLAGGED,
      completionCheck: CompletionCheck.PASS,
      managerNote: "Guest reported a smell after sign-off",
    });
    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(mocks.createIssue.mock.calls[0][1]).toMatchObject({
      priority: IssuePriority.HIGH,
      sourceInstanceId: INSTANCE_ID,
    });
    expect(notifiedEvent()).toBe("review_flagged");
  });

  it("FAIL + Flag → FLAGGED, completionCheck FAIL, Issue created, always notifies", async () => {
    const res = await flagSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "Room not cleaned",
    });

    expect(res).toEqual({ ok: true });
    expect(updateData()).toMatchObject({
      status: InstanceStatus.FLAGGED,
      completionCheck: CompletionCheck.FAIL,
    });
    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(notifiedEvent()).toBe("review_flagged");
  });

  it("a flag can no longer be made silent by the caller", async () => {
    // `notifyStaff: false` used to be honoured here. It is now stripped by the
    // schema, and telling the assignee is unconditional.
    const res = await flagSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "Room not cleaned",
      notifyStaff: false,
    });

    expect(res).toEqual({ ok: true });
    expect(notifiedEvent()).toBe("review_flagged");
  });
});

describe("server-side enforcement (the disabled button is only a hint)", () => {
  it("refuses a close with no completion check, without writing anything", async () => {
    const res = await approveSubmission(INSTANCE_ID, { note: "looks fine" });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/completion check/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a flag with no completion check", async () => {
    const res = await flagSubmission(INSTANCE_ID, { note: "broken lock" });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/completion check/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a FAIL close with no note", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
    });

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/reason is required/i);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("refuses a FAIL close whose note is only whitespace", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "   \n  ",
    });

    expect(res.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("accepts a PASS close with no note", async () => {
    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
    });

    expect(res).toEqual({ ok: true });
  });

  it("refuses a flag with no note", async () => {
    const res = await flagSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
    });

    expect(res.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("still refuses both outcomes once verified-and-locked", async () => {
    mocks.instanceFindUnique.mockResolvedValue(instance({ lockedAt: new Date() }));

    const closed = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.PASS,
    });
    const flagged = await flagSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "too late",
    });

    expect(closed.ok).toBe(false);
    expect(flagged.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not notify when the submission is unassigned", async () => {
    // logNotification itself no-ops on a null recipient; asserting here pins
    // that a FAIL does not invent one.
    mocks.instanceFindUnique.mockResolvedValue(instance({ assignedUser: null }));
    mocks.logNotification.mockResolvedValue(null);

    const res = await approveSubmission(INSTANCE_ID, {
      completionCheck: CompletionCheck.FAIL,
      note: "no assignee",
    });

    expect(res).toEqual({ ok: true });
    expect(mocks.logNotification.mock.calls[0]?.[1]).toBeNull();
  });
});

describe("review_failed copy", () => {
  const label = "Arrival Checklist — LL — Rm 312";

  it("is distinct from review_flagged in both locales", () => {
    for (const locale of ["en", "es"] as const) {
      const failed = notifyEmailCopy("review_failed", locale, { label, note: "n" });
      const flagged = notifyEmailCopy("review_flagged", locale, { label, note: "n" });
      expect(failed.subject).not.toBe(flagged.subject);
      expect(failed.text).not.toBe(flagged.text);
    }
  });

  it("carries the manager's reason and does not claim an issue was raised", () => {
    const en = notifyEmailCopy("review_failed", "en", { label, note: "Bathroom photo missing" });
    expect(en.subject).toContain(label);
    expect(en.text).toContain("Bathroom photo missing");
    expect(en.text).toMatch(/no follow-up issue was raised/i);

    const es = notifyEmailCopy("review_failed", "es", { label, note: "Falta foto" });
    expect(es.text).toContain("Falta foto");
    expect(es.text).toMatch(/no se creó ninguna incidencia/i);
  });
});
