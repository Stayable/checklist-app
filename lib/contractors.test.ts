import { describe, expect, it } from "vitest";
import { ContractorJobStatus, ContractorNoteSource, Trade } from "@prisma/client";
import {
  appendDailyNoteSchema,
  appendJobNoteSchema,
  assignSchema,
  CLOSE_NOTE_MAX,
  contractorSchema,
  createJobSchema,
  DESCRIPTION_MAX,
  isOverdue,
  isTerminalJobStatus,
  JOB_STATUS_LABELS,
  JOB_STATUS_ORDER,
  jobStatusLabel,
  NOTE_BODY_MAX,
  OPEN_JOB_STATUSES,
  requiresCloseNote,
  rescheduleSchema,
  resolveNoteAuthor,
  ROOM_LABEL_MAX,
  sortJobs,
  TERMINAL_JOB_STATUSES,
  TRADE_LABELS,
  TRADES_ORDERED,
  tradeLabel,
  updateJobStatusSchema,
} from "./contractors";

describe("trade labels", () => {
  it("has a label for every Trade value", () => {
    for (const t of Object.values(Trade)) {
      expect(TRADE_LABELS[t]).toBeTruthy();
      expect(tradeLabel(t)).toBe(TRADE_LABELS[t]);
    }
  });

  it("TRADES_ORDERED contains exactly every Trade value once", () => {
    expect(new Set(TRADES_ORDERED)).toEqual(new Set(Object.values(Trade)));
    expect(TRADES_ORDERED.length).toBe(Object.values(Trade).length);
  });
});

describe("job status labels", () => {
  it("has a label for every ContractorJobStatus value", () => {
    for (const s of Object.values(ContractorJobStatus)) {
      expect(JOB_STATUS_LABELS[s]).toBeTruthy();
      expect(jobStatusLabel(s)).toBe(JOB_STATUS_LABELS[s]);
    }
  });

  it("JOB_STATUS_ORDER contains exactly every status value once", () => {
    expect(new Set(JOB_STATUS_ORDER)).toEqual(new Set(Object.values(ContractorJobStatus)));
    expect(JOB_STATUS_ORDER.length).toBe(Object.values(ContractorJobStatus).length);
  });

  it("OPEN_JOB_STATUSES is exactly PLANNED and IN_PROGRESS", () => {
    expect(new Set(OPEN_JOB_STATUSES)).toEqual(
      new Set([ContractorJobStatus.PLANNED, ContractorJobStatus.IN_PROGRESS]),
    );
  });

  it("TERMINAL_JOB_STATUSES is exactly DONE and CANCELLED", () => {
    expect(new Set(TERMINAL_JOB_STATUSES)).toEqual(
      new Set([ContractorJobStatus.DONE, ContractorJobStatus.CANCELLED]),
    );
  });

  it("isTerminalJobStatus / requiresCloseNote match pinned expectations per status", () => {
    // Pinned literally (not derived from TERMINAL_JOB_STATUSES) so this test
    // constrains behaviour independently — a consistently-wrong pairing of
    // the constant and the functions would otherwise still pass.
    const expectations: [ContractorJobStatus, boolean][] = [
      [ContractorJobStatus.PLANNED, false],
      [ContractorJobStatus.IN_PROGRESS, false],
      [ContractorJobStatus.DONE, true],
      [ContractorJobStatus.CANCELLED, true],
    ];
    for (const [s, expected] of expectations) {
      expect(isTerminalJobStatus(s)).toBe(expected);
      expect(requiresCloseNote(s)).toBe(expected);
    }
  });
});

describe("sortJobs", () => {
  type J = { id: string; urgent: boolean; createdAt: Date };

  it("puts urgent jobs before non-urgent jobs", () => {
    const jobs: J[] = [
      { id: "a", urgent: false, createdAt: new Date("2026-08-01") },
      { id: "b", urgent: true, createdAt: new Date("2026-08-05") },
    ];
    const sorted = sortJobs(jobs);
    expect(sorted.map((j) => j.id)).toEqual(["b", "a"]);
  });

  it("within the same urgency, sorts oldest first (ascending createdAt)", () => {
    const jobs: J[] = [
      { id: "newer", urgent: false, createdAt: new Date("2026-08-05") },
      { id: "older", urgent: false, createdAt: new Date("2026-08-01") },
    ];
    const sorted = sortJobs(jobs);
    expect(sorted.map((j) => j.id)).toEqual(["older", "newer"]);
  });

  it("urgent-first takes priority over age (an older non-urgent job never beats a newer urgent one)", () => {
    const jobs: J[] = [
      { id: "old-normal", urgent: false, createdAt: new Date("2026-01-01") },
      { id: "new-urgent", urgent: true, createdAt: new Date("2026-08-01") },
    ];
    const sorted = sortJobs(jobs);
    expect(sorted.map((j) => j.id)).toEqual(["new-urgent", "old-normal"]);
  });

  it("is stable for equal urgent+createdAt", () => {
    const jobs: J[] = [
      { id: "first", urgent: true, createdAt: new Date("2026-08-01") },
      { id: "second", urgent: true, createdAt: new Date("2026-08-01") },
    ];
    const sorted = sortJobs(jobs);
    expect(sorted.map((j) => j.id)).toEqual(["first", "second"]);
  });

  it("does not mutate its input array", () => {
    const jobs: J[] = [
      { id: "b", urgent: true, createdAt: new Date("2026-08-05") },
      { id: "a", urgent: false, createdAt: new Date("2026-08-01") },
    ];
    const original = [...jobs];
    const sorted = sortJobs(jobs);
    expect(jobs).toEqual(original);
    expect(sorted).not.toBe(jobs);
  });
});

describe("isOverdue", () => {
  const TODAY = "2026-08-11";

  it("is true for a past date on a live (non-terminal) job", () => {
    expect(isOverdue(new Date("2026-08-10T00:00:00.000Z"), false, TODAY)).toBe(true);
  });

  it("is false for today's date", () => {
    expect(isOverdue(new Date("2026-08-11T00:00:00.000Z"), false, TODAY)).toBe(false);
  });

  it("is false for a future date", () => {
    expect(isOverdue(new Date("2026-08-12T00:00:00.000Z"), false, TODAY)).toBe(false);
  });

  it("is false for an unscheduled (null) job regardless of terminality", () => {
    expect(isOverdue(null, false, TODAY)).toBe(false);
    expect(isOverdue(null, true, TODAY)).toBe(false);
  });

  it("is false for a past-dated job that is terminal", () => {
    expect(isOverdue(new Date("2026-08-01T00:00:00.000Z"), true, TODAY)).toBe(false);
  });
});

describe("resolveNoteAuthor", () => {
  it("uses the live author's current name when present", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.STAFF,
        authorLabel: "Stale Name",
        author: { name: "Current Name" },
      }),
    ).toBe("Current Name");
  });

  it("prefers the live author over a stale authorLabel", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.STAFF,
        authorLabel: "Old Kate",
        author: { name: "Kate Now" },
      }),
    ).toBe("Kate Now");
  });

  it("falls back to authorLabel when the author is nulled (deleted account), STAFF", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.STAFF,
        authorLabel: "Karla Dugayo",
        author: null,
      }),
    ).toBe("Karla Dugayo");
  });

  it("STAFF with neither a live author nor a label falls back to 'Removed user'", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.STAFF,
        authorLabel: null,
        author: null,
      }),
    ).toBe("Removed user");
  });

  it("labelled SYSTEM note uses the label", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.SYSTEM,
        authorLabel: "Automation",
        author: null,
      }),
    ).toBe("Automation");
  });

  it("unlabelled SYSTEM note falls back to 'System'", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.SYSTEM,
        authorLabel: null,
        author: null,
      }),
    ).toBe("System");
  });

  it("never returns an empty string", () => {
    const cases = [
      { source: ContractorNoteSource.STAFF, authorLabel: null, author: null },
      { source: ContractorNoteSource.SYSTEM, authorLabel: null, author: null },
      { source: ContractorNoteSource.STAFF, authorLabel: "", author: null },
    ] as const;
    for (const c of cases) {
      expect(resolveNoteAuthor(c)).not.toBe("");
    }
  });

  it("a whitespace-only live author name falls through to a valid authorLabel", () => {
    expect(
      resolveNoteAuthor({
        source: ContractorNoteSource.STAFF,
        authorLabel: "Karla Dugayo",
        author: { name: "   " },
      }),
    ).toBe("Karla Dugayo");
  });

  it("whitespace-only author name AND whitespace-only authorLabel on STAFF -> 'Removed user'", () => {
    const result = resolveNoteAuthor({
      source: ContractorNoteSource.STAFF,
      authorLabel: "   ",
      author: { name: "  " },
    });
    expect(result).toBe("Removed user");
    expect(result.trim()).not.toBe("");
  });

  it("whitespace-only author name AND whitespace-only authorLabel on SYSTEM -> 'System'", () => {
    const result = resolveNoteAuthor({
      source: ContractorNoteSource.SYSTEM,
      authorLabel: "   ",
      author: { name: "  " },
    });
    expect(result).toBe("System");
    expect(result.trim()).not.toBe("");
  });
});

describe("contractorSchema", () => {
  const base = {
    name: "Orlando Torres",
    trades: [Trade.PLUMBING],
    propertyIds: ["11111111-1111-4111-8111-111111111111"],
    phone: "555-555-5555",
    whatsapp: null,
  };

  it("accepts a valid contractor", () => {
    expect(contractorSchema.safeParse(base).success).toBe(true);
  });

  it("rejects zero trades with its own message", () => {
    const result = contractorSchema.safeParse({ ...base, trades: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /trade/i.test(m))).toBe(true);
    }
  });

  it("rejects zero properties with its own message", () => {
    const result = contractorSchema.safeParse({ ...base, propertyIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /propert/i.test(m))).toBe(true);
    }
  });

  it("rejects no contact method (neither phone nor whatsapp) with its own message", () => {
    const result = contractorSchema.safeParse({ ...base, phone: null, whatsapp: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => /phone|whatsapp|contact/i.test(m))).toBe(true);
    }
  });

  it("the three rejection messages are distinct from each other", () => {
    const noTrades = contractorSchema.safeParse({ ...base, trades: [] });
    const noProps = contractorSchema.safeParse({ ...base, propertyIds: [] });
    const noContact = contractorSchema.safeParse({ ...base, phone: null, whatsapp: null });
    const msg = (r: typeof noTrades) => (r.success ? null : r.error.issues[0]?.message);
    const m1 = msg(noTrades);
    const m2 = msg(noProps);
    const m3 = msg(noContact);
    expect(m1).not.toBe(m2);
    expect(m1).not.toBe(m3);
    expect(m2).not.toBe(m3);
  });

  // Contractor.company is displayed by the directory, so the schema has to be
  // able to carry it — it was absent at first, which left the column
  // permanently null with a read-only field on screen.
  it("accepts a company, and treats it as optional", () => {
    const withCompany = contractorSchema.safeParse({ ...base, company: "Torres Plumbing LLC" });
    expect(withCompany.success).toBe(true);
    if (withCompany.success) expect(withCompany.data.company).toBe("Torres Plumbing LLC");

    expect(contractorSchema.safeParse({ ...base, company: null }).success).toBe(true);
    // Absent entirely (the pre-existing call shape) must still parse.
    expect(contractorSchema.safeParse(base).success).toBe(true);
  });

  it("trims a company and rejects a whitespace-only one", () => {
    const padded = contractorSchema.safeParse({ ...base, company: "  Torres Plumbing  " });
    expect(padded.success).toBe(true);
    if (padded.success) expect(padded.data.company).toBe("Torres Plumbing");

    // Blank-after-trim is not a company; the form sends null for "no company".
    expect(contractorSchema.safeParse({ ...base, company: "   " }).success).toBe(false);
  });

  it("accepts whatsapp-only contact (no phone)", () => {
    expect(
      contractorSchema.safeParse({ ...base, phone: null, whatsapp: "+15555555555" }).success,
    ).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(contractorSchema.safeParse({ ...base, name: "" }).success).toBe(false);
  });
});

describe("createJobSchema", () => {
  const base = {
    propertyId: "11111111-1111-4111-8111-111111111111",
    trade: Trade.HVAC,
    description: "AC unit not cooling in room 204",
  };

  it("accepts a minimal valid job with no scheduledFor", () => {
    const result = createJobSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts scheduledFor omitted entirely", () => {
    expect(createJobSchema.safeParse(base).success).toBe(true);
  });

  it("accepts scheduledFor as null (explicit unscheduled backlog)", () => {
    expect(createJobSchema.safeParse({ ...base, scheduledFor: null }).success).toBe(true);
  });

  it("accepts a valid dashed scheduledFor", () => {
    expect(createJobSchema.safeParse({ ...base, scheduledFor: "2026-08-11" }).success).toBe(true);
  });

  it("rejects a compact scheduledFor", () => {
    expect(createJobSchema.safeParse({ ...base, scheduledFor: "20260811" }).success).toBe(false);
  });

  it("accepts optional roomLabel and urgent", () => {
    expect(
      createJobSchema.safeParse({ ...base, roomLabel: "204", urgent: true }).success,
    ).toBe(true);
  });

  it("rejects a description over DESCRIPTION_MAX", () => {
    const result = createJobSchema.safeParse({
      ...base,
      description: "x".repeat(DESCRIPTION_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a roomLabel over ROOM_LABEL_MAX", () => {
    const result = createJobSchema.safeParse({
      ...base,
      roomLabel: "x".repeat(ROOM_LABEL_MAX + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid propertyId", () => {
    expect(createJobSchema.safeParse({ ...base, propertyId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("updateJobStatusSchema", () => {
  it("requires closeNote for DONE", () => {
    const result = updateJobStatusSchema.safeParse({ status: ContractorJobStatus.DONE });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("closeNote"))).toBe(true);
    }
  });

  it("requires closeNote for CANCELLED", () => {
    const result = updateJobStatusSchema.safeParse({ status: ContractorJobStatus.CANCELLED });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("closeNote"))).toBe(true);
    }
  });

  it("does not require closeNote for IN_PROGRESS", () => {
    const result = updateJobStatusSchema.safeParse({ status: ContractorJobStatus.IN_PROGRESS });
    expect(result.success).toBe(true);
  });

  it("does not require closeNote for PLANNED", () => {
    const result = updateJobStatusSchema.safeParse({ status: ContractorJobStatus.PLANNED });
    expect(result.success).toBe(true);
  });

  it("accepts DONE with a closeNote", () => {
    const result = updateJobStatusSchema.safeParse({
      status: ContractorJobStatus.DONE,
      closeNote: "Fixed the unit, replaced capacitor.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a closeNote over CLOSE_NOTE_MAX", () => {
    const result = updateJobStatusSchema.safeParse({
      status: ContractorJobStatus.DONE,
      closeNote: "x".repeat(CLOSE_NOTE_MAX + 1),
    });
    expect(result.success).toBe(false);
  });
});

describe("assignSchema", () => {
  it("accepts a uuid contractorId", () => {
    expect(
      assignSchema.safeParse({ contractorId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(true);
  });

  it("accepts a null contractorId (unassign)", () => {
    expect(assignSchema.safeParse({ contractorId: null }).success).toBe(true);
  });

  it("rejects a non-uuid contractorId", () => {
    expect(assignSchema.safeParse({ contractorId: "nope" }).success).toBe(false);
  });
});

describe("rescheduleSchema", () => {
  it("accepts a valid dashed scheduledFor", () => {
    expect(rescheduleSchema.safeParse({ scheduledFor: "2026-08-11" }).success).toBe(true);
  });

  it("accepts null scheduledFor (moved back to backlog)", () => {
    expect(rescheduleSchema.safeParse({ scheduledFor: null }).success).toBe(true);
  });

  it("rejects a compact scheduledFor", () => {
    expect(rescheduleSchema.safeParse({ scheduledFor: "20260811" }).success).toBe(false);
  });
});

describe("appendJobNoteSchema", () => {
  it("accepts a normal note body", () => {
    expect(appendJobNoteSchema.safeParse({ body: "Called contractor, on the way." }).success).toBe(
      true,
    );
  });

  it("trims the body", () => {
    const result = appendJobNoteSchema.safeParse({ body: "  hello  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body).toBe("hello");
  });

  it("rejects an empty body", () => {
    expect(appendJobNoteSchema.safeParse({ body: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only body", () => {
    expect(appendJobNoteSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("rejects a body over NOTE_BODY_MAX", () => {
    expect(appendJobNoteSchema.safeParse({ body: "x".repeat(NOTE_BODY_MAX + 1) }).success).toBe(
      false,
    );
  });
});

describe("appendDailyNoteSchema", () => {
  const base = { body: "Kicked off the pressure washing crew at LL.", forDate: "2026-08-11" };

  it("accepts a valid entry with a propertyId", () => {
    expect(
      appendDailyNoteSchema.safeParse({
        ...base,
        propertyId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
  });

  it("accepts a null propertyId (portfolio-level note)", () => {
    expect(appendDailyNoteSchema.safeParse({ ...base, propertyId: null }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(appendDailyNoteSchema.safeParse({ ...base, body: "", propertyId: null }).success).toBe(
      false,
    );
  });

  it("rejects a compact forDate", () => {
    expect(
      appendDailyNoteSchema.safeParse({ ...base, forDate: "20260811", propertyId: null }).success,
    ).toBe(false);
  });
});
