import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

// Under test: WHO may export a checklist PDF. Nothing else — the render itself
// is mocked away, because the bug this file pins was never about the PDF.
//
// Until 2026-09-10 the route asked `canAccessProperty` and stopped there, which
// is true for anyone holding a user_properties row at that property. A
// housekeeper at KE could therefore export every KE checklist by id, including
// the Manager Checklist that rates their own work. `lib/rbac` is deliberately
// NOT mocked here: the real predicates are half of the rule being asserted.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  instanceFindUnique: vi.fn(),
  userPropertyFindUnique: vi.fn(),
  renderPdfToBuffer: vi.fn(),
  questionsForInstance: vi.fn(),
  presignDownload: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    checklistInstance: { findUnique: mocks.instanceFindUnique },
    userProperty: { findUnique: mocks.userPropertyFindUnique },
  },
}));
vi.mock("@/lib/r2", () => ({ presignDownload: mocks.presignDownload }));
vi.mock("@/lib/pdf/render", () => ({ renderPdfToBuffer: mocks.renderPdfToBuffer }));
vi.mock("@/lib/template-version.server", () => ({
  questionsForInstance: mocks.questionsForInstance,
}));

import { GET } from "./route";

const INSTANCE_ID = "11111111-1111-4111-8111-111111111111";
const PROPERTY_ID = "22222222-2222-4222-8222-222222222222";
const ASSIGNEE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";

/** A submitted checklist at one property, assigned to ASSIGNEE_ID. */
function instance() {
  return {
    id: INSTANCE_ID,
    title: "Manager Checklist KE 091026",
    assignedUserId: ASSIGNEE_ID,
    propertyId: PROPERTY_ID,
    templateVersion: 1,
    openedAt: new Date("2026-09-10T12:00:00Z"),
    submittedAt: new Date("2026-09-10T12:30:00Z"),
    roomLabel: null,
    room: null,
    template: { name: "Manager Checklist" },
    property: {
      id: PROPERTY_ID,
      shortCode: "KE",
      name: "Kissimmee East",
      propertyId: 2295,
    },
    assignedUser: { name: "Bea" },
    responses: [],
  };
}

function req() {
  return new Request(`http://localhost/api/checklists/${INSTANCE_ID}/pdf`);
}

function params() {
  return { params: Promise.resolve({ id: INSTANCE_ID }) };
}

/** Sign in as someone. `member` decides whether user_properties has a row for
 *  them at this property — the check the old rule stopped at. */
function signIn(id: string, role: Role, member: boolean) {
  mocks.auth.mockResolvedValue({ user: { id, role } });
  mocks.userPropertyFindUnique.mockResolvedValue(member ? { userId: id } : null);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.instanceFindUnique.mockResolvedValue(instance());
  mocks.questionsForInstance.mockResolvedValue([]);
  mocks.renderPdfToBuffer.mockResolvedValue(Buffer.from("%PDF-1.4"));
});

describe("GET /api/checklists/[id]/pdf — authorization", () => {
  it("401s with no session", async () => {
    mocks.auth.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
    expect(mocks.renderPdfToBuffer).not.toHaveBeenCalled();
  });

  it("404s on an unknown instance", async () => {
    signIn(ASSIGNEE_ID, Role.HK, true);
    mocks.instanceFindUnique.mockResolvedValue(null);
    expect((await GET(req(), params())).status).toBe(404);
  });

  it("lets field staff export their OWN checklist", async () => {
    signIn(ASSIGNEE_ID, Role.HK, true);
    const res = await GET(req(), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("REFUSES field staff someone else's checklist at their own property", async () => {
    // The regression this rule closes: property membership is true, and that
    // used to be the whole test.
    signIn(OTHER_ID, Role.HK, true);
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect(mocks.renderPdfToBuffer).not.toHaveBeenCalled();
  });

  it("refuses field staff a checklist at a property they cannot reach", async () => {
    signIn(OTHER_ID, Role.MT, false);
    expect((await GET(req(), params())).status).toBe(403);
  });

  it("lets a manager at the property export someone else's checklist", async () => {
    signIn(OTHER_ID, Role.MANAGER, true);
    expect((await GET(req(), params())).status).toBe(200);
  });

  it("lets an AGENT reviewer at the property export it", async () => {
    // AGENT is manager-level inside Checklist (lib/roles.ts) — the night-audit
    // reviewers export the PDFs they are reviewing.
    signIn(OTHER_ID, Role.AGENT, true);
    expect((await GET(req(), params())).status).toBe(200);
  });

  it("refuses a manager at a DIFFERENT property", async () => {
    signIn(OTHER_ID, Role.MANAGER, false);
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
    expect(mocks.renderPdfToBuffer).not.toHaveBeenCalled();
  });

  it("lets portfolio roles export anything, with no membership row", async () => {
    for (const role of [Role.CORPORATE, Role.ADMIN]) {
      signIn(OTHER_ID, role, false);
      expect((await GET(req(), params())).status).toBe(200);
    }
  });
});
