import { describe, expect, it } from "vitest";
import { InstanceMultiplicity, ReviewLevel, Role, TemplateScope } from "@prisma/client";
import {
  TEMPLATES,
  TEMPLATE_CODE_MAX_LENGTH,
  TEMPLATE_PROPERTY_IDS,
  seedActiveFields,
  type SeedTemplate,
} from "../prisma/templates";

const byCode = new Map<string, SeedTemplate>(TEMPLATES.map((t) => [t.code, t]));
const get = (code: string): SeedTemplate => {
  const t = byCode.get(code);
  if (!t) throw new Error(`no seed template with code ${code}`);
  return t;
};

describe("template codes", () => {
  it("are unique", () => {
    const codes = TEMPLATES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // checklist_templates.code is @db.VarChar(8) and ADR-009 bakes it into every
  // instance system ID. A 9-char code is a runtime insert failure, not a warning
  // — this is why the PM PA family is PPA{id} and not PAPM{id}.
  it("all fit VarChar(8)", () => {
    const tooLong = TEMPLATES.filter((t) => t.code.length > TEMPLATE_CODE_MAX_LENGTH);
    expect(tooLong.map((t) => `${t.code} (${t.code.length})`)).toEqual([]);
  });

  it("PAPM{propertyId} would NOT have fit, which is the reason for PPA", () => {
    expect("PAPM44199".length).toBeGreaterThan(TEMPLATE_CODE_MAX_LENGTH);
    expect("PPA44199".length).toBe(TEMPLATE_CODE_MAX_LENGTH);
  });

  it("are all uppercase alphanumerics", () => {
    for (const t of TEMPLATES) expect(t.code).toMatch(/^[A-Z0-9]+$/);
  });

  // MGR (retired Manager Review) and MGR812 (new Manager Checklist) are
  // different templates that must both exist. Collapsing them would retire the
  // new one and orphan the old one's instances.
  it("keeps the retired MGR distinct from the 8 MGR{propertyId} rows", () => {
    expect(get("MGR").name).toBe("Manager Review");
    expect(get("MGR").lifecycle).toBe("RETIRED");
    expect(get("MGR812").name).toBe("812 Manager Checklist");
    expect(get("MGR812").lifecycle).toBe("DRAFT");
  });
});

describe("library shape", () => {
  it("has 31 rows: 6 kept + 3 retired + 22 new", () => {
    expect(TEMPLATES).toHaveLength(31);
    expect(TEMPLATES.filter((t) => t.lifecycle === "ACTIVE")).toHaveLength(6);
    expect(TEMPLATES.filter((t) => t.lifecycle === "RETIRED")).toHaveLength(3);
    expect(TEMPLATES.filter((t) => t.lifecycle === "DRAFT")).toHaveLength(22);
  });

  it("counts 28 live templates, per the spec", () => {
    expect(TEMPLATES.filter((t) => t.lifecycle !== "RETIRED")).toHaveLength(28);
  });

  it("seeds every template globally — D18, no TemplateProperty rows", () => {
    for (const t of TEMPLATES) expect(t.allProperties).toBe(true);
  });

  it("gives every new template zero questions", () => {
    for (const t of TEMPLATES.filter((x) => x.lifecycle === "DRAFT")) {
      expect(t.questions).toEqual([]);
    }
  });

  it("leaves the 9 original templates' question sets in place", () => {
    for (const code of ["ARR", "DEP", "HKR", "PAR", "MGR", "MNT", "PWR", "RPM", "RIN"]) {
      expect(get(code).questions.length).toBeGreaterThan(0);
    }
  });

  it("does NOT seed the three templates parked under D22", () => {
    const names = TEMPLATES.map((t) => t.name);
    expect(names).not.toContain("Lock Installation");
    expect(names).not.toContain("Stayable Renovation Completion");
    expect(names).not.toContain("Daily Contractor Checklist");
  });
});

describe("W3 — retire and rename", () => {
  it("renames the six kept templates without touching their codes", () => {
    expect(get("ARR").name).toBe("Arrival Checklist");
    expect(get("DEP").name).toBe("Due Out Checklist");
    expect(get("MNT").name).toBe("Maintenance Checklist");
    expect(get("PWR").name).toBe("Monthly Pressure Washing");
    expect(get("RPM").name).toBe("Roof PM Checklist");
    expect(get("RIN").name).toBe("Monthly Room Inspection");
    for (const code of ["ARR", "DEP", "MNT", "PWR", "RPM", "RIN"]) {
      expect(get(code).lifecycle).toBe("ACTIVE");
    }
  });

  it("retires HKR, PAR and MGR rather than deleting them", () => {
    for (const code of ["HKR", "PAR", "MGR"]) {
      expect(get(code).lifecycle).toBe("RETIRED");
      // Still present: 6 checklist_instances hold FKs to these and their codes
      // are embedded in the system IDs those instances carry.
      expect(byCode.has(code)).toBe(true);
    }
  });

  it("moves MNT onto PER_TASK", () => {
    expect(get("MNT").copies).toBe(InstanceMultiplicity.PER_TASK);
  });
});

describe("W2 — scope / copies / role mapping", () => {
  const expected: Record<
    string,
    { scope: TemplateScope; copies: InstanceMultiplicity; role: Role }
  > = {
    LFLIP: { scope: TemplateScope.PER_ROOM, copies: InstanceMultiplicity.ONE, role: Role.HK },
    DOWALK: { scope: TemplateScope.PER_PROPERTY, copies: InstanceMultiplicity.ONE, role: Role.PA },
    HKC: { scope: TemplateScope.PER_ROOM, copies: InstanceMultiplicity.ONE, role: Role.HK },
    PAAM: {
      scope: TemplateScope.PER_PROPERTY,
      copies: InstanceMultiplicity.PER_ASSIGNEE,
      role: Role.PA,
    },
    PINSP: {
      scope: TemplateScope.PER_PROPERTY,
      copies: InstanceMultiplicity.PER_ASSIGNEE,
      role: Role.PA,
    },
    PTASK: {
      scope: TemplateScope.PER_PROPERTY,
      copies: InstanceMultiplicity.PER_TASK,
      role: Role.MT,
    },
  };

  for (const [code, want] of Object.entries(expected)) {
    it(`${code} is ${want.scope} / ${want.copies} / ${want.role}`, () => {
      const t = get(code);
      expect(t.scope).toBe(want.scope);
      expect(t.copies).toBe(want.copies);
      expect(t.defaultRole).toBe(want.role);
    });
  }
});

describe("the two per-property families", () => {
  it("covers all 8 properties exactly once each", () => {
    expect([...TEMPLATE_PROPERTY_IDS].sort()).toEqual(
      ["812", "2295", "2535", "4645", "5399", "6802", "8700", "44199"].sort(),
    );
    expect(new Set(TEMPLATE_PROPERTY_IDS).size).toBe(8);
  });

  it("seeds 8 PM PA checklists as PPA{propertyId}, PER_PROPERTY + PER_ASSIGNEE + PA", () => {
    const fam = TEMPLATES.filter((t) => t.name.endsWith("PM PA Checklist"));
    expect(fam).toHaveLength(8);
    expect(fam.map((t) => t.code)).toEqual(TEMPLATE_PROPERTY_IDS.map((id) => `PPA${id}`));
    expect(fam.map((t) => t.name)).toEqual(
      TEMPLATE_PROPERTY_IDS.map((id) => `${id} PM PA Checklist`),
    );
    for (const t of fam) {
      expect(t.scope).toBe(TemplateScope.PER_PROPERTY);
      expect(t.copies).toBe(InstanceMultiplicity.PER_ASSIGNEE);
      expect(t.defaultRole).toBe(Role.PA);
      expect(t.lifecycle).toBe("DRAFT");
    }
  });

  it("seeds 8 Manager checklists as MGR{propertyId}, PER_PROPERTY + PER_ASSIGNEE + MANAGER", () => {
    const fam = TEMPLATES.filter((t) => t.name.endsWith("Manager Checklist"));
    expect(fam).toHaveLength(8);
    expect(fam.map((t) => t.code)).toEqual(TEMPLATE_PROPERTY_IDS.map((id) => `MGR${id}`));
    expect(fam.map((t) => t.name)).toEqual(
      TEMPLATE_PROPERTY_IDS.map((id) => `${id} Manager Checklist`),
    );
    for (const t of fam) {
      expect(t.scope).toBe(TemplateScope.PER_PROPERTY);
      expect(t.copies).toBe(InstanceMultiplicity.PER_ASSIGNEE);
      expect(t.defaultRole).toBe(Role.MANAGER);
      // The filler IS the property manager, so review escalates to corporate.
      expect(t.reviewLevel).toBe(ReviewLevel.CORPORATE);
    }
  });
});

describe("seedActiveFields — the upsert split", () => {
  // The whole point: re-running the seed must never un-do a human's decision.
  it("never re-asserts `active` for an ACTIVE template", () => {
    expect(seedActiveFields("ACTIVE")).toEqual({ create: true, update: undefined });
  });

  it("never re-asserts `active` for a DRAFT — a draft Kyle activates stays active", () => {
    expect(seedActiveFields("DRAFT")).toEqual({ create: false, update: undefined });
  });

  it("does re-assert `active: false` for a RETIRED template", () => {
    expect(seedActiveFields("RETIRED")).toEqual({ create: false, update: false });
  });

  it("only RETIRED writes to `active` on re-seed", () => {
    const writers = TEMPLATES.filter((t) => seedActiveFields(t.lifecycle).update !== undefined);
    expect(writers.map((t) => t.code).sort()).toEqual(["HKR", "MGR", "PAR"]);
  });
});

describe("Maintenance Checklist scope", () => {
  it("covers the whole property, one instance per task", () => {
    // Kyle's list reads "Maintenance Checklist - Daily - per task, per location".
    // "per location" is the property, so this is PER_PROPERTY + PER_TASK, not
    // AD_HOC. It was seeded AD_HOC first; subjectKindFor resolves both to TASK,
    // so the bug would have been invisible at runtime -- pinned here instead.
    const mnt = byCode.get("MNT");
    expect(mnt).toBeDefined();
    expect(mnt!.scope).toBe(TemplateScope.PER_PROPERTY);
    expect(mnt!.copies).toBe(InstanceMultiplicity.PER_TASK);
  });
});
