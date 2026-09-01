import { describe, expect, it } from "vitest";
import { InstanceMultiplicity, TemplateScope } from "@prisma/client";

import { subjectKindFor } from "./manual-create";

describe("subjectKindFor", () => {
  it("enumerates rooms for a plain per-room template", () => {
    const r = subjectKindFor(TemplateScope.PER_ROOM, InstanceMultiplicity.ONE);
    expect(r).toEqual({ ok: true, kind: "ROOM" });
  });

  it("enumerates people for a per-property per-assignee template", () => {
    // "812 PM PA Checklist" — subject is the property, but you tick people.
    const r = subjectKindFor(TemplateScope.PER_PROPERTY, InstanceMultiplicity.PER_ASSIGNEE);
    expect(r).toEqual({ ok: true, kind: "ASSIGNEE" });
  });

  it("enumerates tasks for a per-task template", () => {
    const r = subjectKindFor(TemplateScope.PER_PROPERTY, InstanceMultiplicity.PER_TASK);
    expect(r).toEqual({ ok: true, kind: "TASK" });
  });

  it("enumerates nothing for a single property-wide checklist", () => {
    const r = subjectKindFor(TemplateScope.PER_PROPERTY, InstanceMultiplicity.ONE);
    expect(r).toEqual({ ok: true, kind: "NONE" });
  });

  it("treats AD_HOC as property-wide", () => {
    const r = subjectKindFor(TemplateScope.AD_HOC, InstanceMultiplicity.ONE);
    expect(r).toEqual({ ok: true, kind: "NONE" });
  });

  it("REJECTS per-room combined with per-assignee rather than picking one axis", () => {
    // Silently choosing an axis would create a confidently wrong instance count.
    const r = subjectKindFor(TemplateScope.PER_ROOM, InstanceMultiplicity.PER_ASSIGNEE);
    expect(r.ok).toBe(false);
  });

  it("REJECTS per-room combined with per-task", () => {
    const r = subjectKindFor(TemplateScope.PER_ROOM, InstanceMultiplicity.PER_TASK);
    expect(r.ok).toBe(false);
  });

  it("covers every InstanceMultiplicity member", () => {
    // Pins exhaustiveness: a new member must be considered here, not defaulted.
    for (const copies of Object.values(InstanceMultiplicity)) {
      const r = subjectKindFor(TemplateScope.PER_PROPERTY, copies);
      expect(r.ok).toBe(true);
    }
    expect(Object.values(InstanceMultiplicity)).toHaveLength(3);
  });
});

