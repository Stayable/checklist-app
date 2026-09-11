import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceStatus, Role } from "@prisma/client";

// What is under test is the REFUSAL RULE — which instances may be deleted and
// which are kept. Prisma and the session are mocked; the branching is the whole
// safety model, and it is the only thing standing between "I mis-created 40
// rooms" and somebody's filled checklist disappearing.
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteMany: vi.fn(),
  auditCreateMany: vi.fn(),
  transaction: vi.fn(),
  requireManager: vi.fn(),
  accessiblePropertyIds: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    checklistInstance: { findMany: mocks.findMany, deleteMany: mocks.deleteMany },
    auditLog: { createMany: mocks.auditCreateMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/rbac", () => ({
  requireManager: mocks.requireManager,
  accessiblePropertyIds: mocks.accessiblePropertyIds,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteChecklists } from "./actions";

const MANAGER = { id: "11111111-1111-4111-8111-111111111111", role: Role.MANAGER, name: "PM" };
const PROPERTY = "22222222-2222-4222-8222-222222222222";

let seq = 0;
function instance(over: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  return {
    id: `33333333-3333-4333-8333-3333333333${String(seq).padStart(2, "0")}`,
    systemId: `CL-4645-ARR-20260912-${String(seq).padStart(3, "0")}`,
    title: `Arrival — LL — Rm ${seq}`,
    status: InstanceStatus.ASSIGNED,
    propertyId: PROPERTY,
    templateId: "44444444-4444-4444-8444-444444444444",
    scheduledFor: new Date("2026-09-12T00:00:00.000Z"),
    submittedAt: null,
    _count: { responses: 0, sourcedIssues: 0 },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  mocks.requireManager.mockResolvedValue(MANAGER);
  mocks.accessiblePropertyIds.mockResolvedValue([PROPERTY]);
  mocks.transaction.mockResolvedValue([]);
});

describe("deleteChecklists", () => {
  it("deletes untouched scaffolding and writes one audit row each", async () => {
    const rows = [instance(), instance()];
    mocks.findMany.mockResolvedValue(rows);

    const res = await deleteChecklists({ ids: rows.map((r) => r.id) });

    expect(res).toMatchObject({ ok: true, deleted: 2, refused: [], skipped: 0 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: rows.map((r) => r.id) } },
    });
    // The row is gone afterwards, so the audit entry is the only record of what
    // it was — it must carry enough to recreate it.
    const audited = mocks.auditCreateMany.mock.calls[0][0].data;
    expect(audited).toHaveLength(2);
    expect(audited[0]).toMatchObject({ action: "delete", entityType: "checklist_instance" });
    expect(audited[0].before).toMatchObject({
      systemId: rows[0].systemId,
      templateId: rows[0].templateId,
      propertyId: PROPERTY,
    });
  });

  it("refuses a submitted checklist, an answered one, and one that raised an issue", async () => {
    const ok = instance();
    const submitted = instance({ submittedAt: new Date(), status: InstanceStatus.SUBMITTED });
    const answered = instance({ _count: { responses: 3, sourcedIssues: 0 } });
    const sourced = instance({ _count: { responses: 0, sourcedIssues: 1 } });
    mocks.findMany.mockResolvedValue([ok, submitted, answered, sourced]);

    const res = await deleteChecklists({
      ids: [ok, submitted, answered, sourced].map((r) => r.id),
    });

    if (!res.ok) throw new Error("expected ok");
    // One refusal blocking the batch would mean a single submitted checklist
    // stops a cleanup of thirty — the good row still goes.
    expect(res.deleted).toBe(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [ok.id] } } });
    expect(res.refused.map((r) => r.reason)).toEqual([
      "already submitted",
      "3 answers filled in",
      "an issue was raised from it",
    ]);
  });

  it("writes nothing at all when every row is refused", async () => {
    mocks.findMany.mockResolvedValue([instance({ submittedAt: new Date() })]);

    const res = await deleteChecklists({ ids: ["55555555-5555-4555-8555-555555555555"] });

    expect(res).toMatchObject({ ok: true, deleted: 0 });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the caller's properties rather than filtering afterwards", async () => {
    mocks.findMany.mockResolvedValue([instance()]);
    await deleteChecklists({ ids: ["66666666-6666-4666-8666-666666666666"] });

    // An id at a property the caller cannot reach never comes back from the
    // query, so it can never reach the delete.
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({
      propertyId: { in: [PROPERTY] },
    });
  });

  it("counts ids that matched nothing as skipped, without saying whether they exist", async () => {
    const found = instance();
    mocks.findMany.mockResolvedValue([found]);

    const res = await deleteChecklists({
      ids: [found.id, "77777777-7777-4777-8777-777777777777"],
    });

    expect(res).toMatchObject({ ok: true, deleted: 1, skipped: 1 });
    if (!res.ok) throw new Error("expected ok");
    // Nothing in the reply distinguishes "another property's" from "already
    // deleted" — the caller is not entitled to learn that a hidden id exists.
    expect(JSON.stringify(res)).not.toContain("77777777-7777");
  });

  it("rejects an empty selection and a non-uuid before touching the database", async () => {
    expect(await deleteChecklists({ ids: [] })).toMatchObject({ ok: false });
    expect(await deleteChecklists({ ids: ["not-a-uuid"] })).toMatchObject({ ok: false });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
