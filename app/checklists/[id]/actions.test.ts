import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceStatus, QuestionType } from "@prisma/client";

// What is under test is the reviewer-note path through submitChecklist: which
// notes survive to Response.notes, which are dropped, and which are refused.
// Prisma, RBAC and R2 are all mocked — none of them decide any of that.
const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  instanceFindUnique: vi.fn(),
  userPropertyFindUnique: vi.fn(),
  transaction: vi.fn(),
  responseDeleteMany: vi.fn(),
  responseCreateMany: vi.fn(),
  responseFindMany: vi.fn(),
  photoCreateMany: vi.fn(),
  instanceUpdate: vi.fn(),
  auditCreate: vi.fn(),
  questionsForInstance: vi.fn(),
  createIssue: vi.fn(),
  slaHoursByPriority: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    checklistInstance: { findUnique: mocks.instanceFindUnique },
    userProperty: { findUnique: mocks.userPropertyFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireUser: mocks.requireUser,
  isManagerOrAbove: (role: string) => ["MANAGER", "CORPORATE", "ADMIN"].includes(role),
}));
vi.mock("@/lib/template-version.server", () => ({
  questionsForInstance: mocks.questionsForInstance,
}));
vi.mock("@/lib/issues.server", () => ({
  createIssue: mocks.createIssue,
  slaHoursByPriority: mocks.slaHoursByPriority,
}));

import { submitChecklist } from "./actions";

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const PHOTO_Q = "22222222-2222-4222-8222-222222222222";
const TEXT_Q = "33333333-3333-4333-8333-333333333333";
const HIDDEN_PHOTO_Q = "44444444-4444-4444-8444-444444444444";

/** The single visible-question set every test starts from: one optional photo
 *  question, one optional text question. Neither is required, so a submit with
 *  no answers at all is valid — which is what isolates the note behaviour. */
function questions() {
  return [
    {
      id: PHOTO_Q,
      type: QuestionType.PHOTO,
      prompt: "Photo of the room",
      required: false,
      options: null,
      photoMin: null,
      photoMax: 5,
      conditional: null,
      failFlagsIssue: false,
    },
    {
      id: TEXT_Q,
      type: QuestionType.LONG_TEXT,
      prompt: "Anything else",
      required: false,
      options: null,
      photoMin: null,
      photoMax: null,
      conditional: null,
      failFlagsIssue: false,
    },
  ];
}

/** Rows handed to response.createMany inside the transaction, keyed by question. */
function createdRows(): Map<string, { answer: unknown; notes: string | null }> {
  const arg = mocks.responseCreateMany.mock.calls[0]?.[0] as
    | { data: { questionId: string; answer: unknown; notes: string | null }[] }
    | undefined;
  return new Map((arg?.data ?? []).map((r) => [r.questionId, { answer: r.answer, notes: r.notes }]));
}

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();

  mocks.requireUser.mockResolvedValue({ id: "u1", role: "HK" });
  mocks.instanceFindUnique.mockResolvedValue({
    id: INSTANCE_ID,
    assignedUserId: "u1",
    propertyId: "p1",
    status: InstanceStatus.IN_PROGRESS,
    lockedAt: null,
    openedAt: new Date("2026-09-09T12:00:00Z"),
    templateId: "t1",
    templateVersion: 1,
    roomId: null,
    roomLabel: null,
    room: null,
    template: { name: "Arrival Checklist", collectsCheckoutFlags: false },
    property: { shortCode: "LL", geofence: null },
  });
  mocks.questionsForInstance.mockResolvedValue(questions());
  mocks.slaHoursByPriority.mockResolvedValue({});
  mocks.transaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        response: {
          deleteMany: mocks.responseDeleteMany,
          createMany: mocks.responseCreateMany,
          findMany: mocks.responseFindMany.mockResolvedValue([]),
        },
        photo: { createMany: mocks.photoCreateMany },
        checklistInstance: { update: mocks.instanceUpdate },
        auditLog: { create: mocks.auditCreate },
      }),
  );
});

describe("submitChecklist — reviewer notes on photo questions", () => {
  it("persists a trimmed note to Response.notes alongside the photo answer", async () => {
    const res = await submitChecklist(
      INSTANCE_ID,
      { [PHOTO_Q]: { count: 0, pendingUpload: true } },
      undefined,
      { [PHOTO_Q]: "  Carpet stain by the window, already reported  " },
    );

    expect(res).toEqual({ ok: true });
    expect(createdRows().get(PHOTO_Q)?.notes).toBe("Carpet stain by the window, already reported");
  });

  it("stores whitespace-only as null, so an accidental space is not a note", async () => {
    await submitChecklist(
      INSTANCE_ID,
      { [PHOTO_Q]: { count: 0, pendingUpload: true } },
      undefined,
      { [PHOTO_Q]: "   \n  " },
    );

    expect(createdRows().get(PHOTO_Q)?.notes).toBeNull();
  });

  it("keeps a note whose photo question was never answered — the 'could not photograph' case", async () => {
    // No answers at all: nothing else in the submit would create a row here, so
    // without the note-only path the submitter's words disappear on submit.
    await submitChecklist(INSTANCE_ID, {}, undefined, {
      [PHOTO_Q]: "Door was blocked, could not get in",
    });

    const row = createdRows().get(PHOTO_Q);
    expect(row?.notes).toBe("Door was blocked, could not get in");
    expect(row?.answer).toEqual({ count: 0 });
  });

  it("ignores a note aimed at a non-photo question rather than failing the submit", async () => {
    const res = await submitChecklist(INSTANCE_ID, { [TEXT_Q]: "all good" }, undefined, {
      [TEXT_Q]: "notes are not offered here",
    });

    expect(res).toEqual({ ok: true });
    expect(createdRows().get(TEXT_Q)?.notes).toBeNull();
  });

  it("drops a note whose question went invisible mid-fill instead of blocking submit", async () => {
    mocks.questionsForInstance.mockResolvedValue([
      ...questions(),
      {
        id: HIDDEN_PHOTO_Q,
        type: QuestionType.PHOTO,
        prompt: "Photo of the damage",
        required: false,
        options: null,
        photoMin: null,
        photoMax: 5,
        // Only asked when the text answer says "damage" — it does not here.
        conditional: { show_if: { question_id: TEXT_Q, value: "damage" } },
        failFlagsIssue: false,
      },
    ]);

    const res = await submitChecklist(INSTANCE_ID, { [TEXT_Q]: "all good" }, undefined, {
      [HIDDEN_PHOTO_Q]: "typed before the question disappeared",
    });

    expect(res).toEqual({ ok: true });
    expect(createdRows().has(HIDDEN_PHOTO_Q)).toBe(false);
  });

  it("refuses an over-long note and writes nothing", async () => {
    const res = await submitChecklist(
      INSTANCE_ID,
      { [PHOTO_Q]: { count: 0, pendingUpload: true } },
      undefined,
      { [PHOTO_Q]: "x".repeat(2001) },
    );

    expect(res.ok).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("submits unchanged when no notes are passed at all (pre-existing clients)", async () => {
    const res = await submitChecklist(INSTANCE_ID, { [TEXT_Q]: "all good" });

    expect(res).toEqual({ ok: true });
    expect(createdRows().get(TEXT_Q)?.notes).toBeNull();
  });
});
