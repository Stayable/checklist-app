import { describe, expect, it } from "vitest";
import { JobStatus, Trade } from "@prisma/client";
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_ORDER,
  OPEN_JOB_STATUSES,
  canAssignContractor,
  createJobSchema,
  isReachable,
  isTerminalJobStatus,
  jobStatusLabel,
  rankContractorsForJob,
  requiresCompletionNote,
  sortJobs,
  updateStatusSchema,
  type MatchableContractor,
} from "./contractor-jobs";

describe("status metadata", () => {
  it("labels every JobStatus value", () => {
    for (const s of Object.values(JobStatus)) {
      expect(JOB_STATUS_LABELS[s], `${s} needs a label`).toBeTruthy();
    }
  });

  it("orders every JobStatus value exactly once", () => {
    expect([...JOB_STATUS_ORDER].sort()).toEqual([...Object.values(JobStatus)].sort());
  });

  it("treats COMPLETED and CANCELLED as terminal, others as live", () => {
    expect(isTerminalJobStatus(JobStatus.COMPLETED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.CANCELLED)).toBe(true);
    expect(isTerminalJobStatus(JobStatus.OPEN)).toBe(false);
    expect(isTerminalJobStatus(JobStatus.DISPATCHED)).toBe(false);
    expect(isTerminalJobStatus(JobStatus.IN_PROGRESS)).toBe(false);
  });

  it("requires a note on exactly the terminal statuses", () => {
    expect(requiresCompletionNote(JobStatus.CANCELLED)).toBe(true);
    expect(requiresCompletionNote(JobStatus.IN_PROGRESS)).toBe(false);
  });

  it("counts the three live statuses as open work", () => {
    expect(OPEN_JOB_STATUSES).toHaveLength(3);
    expect(OPEN_JOB_STATUSES).not.toContain(JobStatus.COMPLETED);
  });

  it("falls back to the raw value for an unlabelled status", () => {
    expect(jobStatusLabel("WEIRD" as JobStatus)).toBe("WEIRD");
  });
});

describe("sortJobs", () => {
  const j = (urgent: boolean, iso: string, id: string) => ({
    id,
    urgent,
    createdAt: new Date(iso),
  });

  it("puts urgent jobs first regardless of age", () => {
    const sorted = sortJobs([
      j(false, "2026-07-28T10:00:00Z", "new-normal"),
      j(true, "2026-07-20T10:00:00Z", "old-urgent"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["old-urgent", "new-normal"]);
  });

  it("orders newest first within the same urgency", () => {
    const sorted = sortJobs([
      j(true, "2026-07-20T10:00:00Z", "older"),
      j(true, "2026-07-28T10:00:00Z", "newer"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const input = [j(false, "2026-07-01T00:00:00Z", "a"), j(true, "2026-07-02T00:00:00Z", "b")];
    const copy = [...input];
    sortJobs(input);
    expect(input).toEqual(copy);
  });

  it("handles an empty list", () => {
    expect(sortJobs([])).toEqual([]);
  });
});

// --- Match & rank (T3) ------------------------------------------------------

function contractor(over: Partial<MatchableContractor> & { id: string }): MatchableContractor {
  return {
    name: over.id,
    company: null,
    trades: [Trade.PLUMBING],
    contracted: false,
    onCall: true,
    active: true,
    whatsapp: "+15550000000",
    phone: null,
    propertyIds: ["prop-kw"],
    ...over,
  };
}

const JOB = { propertyId: "prop-kw", trade: Trade.PLUMBING };

describe("canAssignContractor", () => {
  it("accepts an active contractor with the trade and the property", () => {
    expect(canAssignContractor(contractor({ id: "ok" }), JOB)).toBe(true);
  });

  it("rejects a contractor without the job's trade", () => {
    expect(canAssignContractor(contractor({ id: "x", trades: [Trade.ROOFING] }), JOB)).toBe(false);
  });

  it("rejects a contractor who doesn't cover the job's property", () => {
    expect(canAssignContractor(contractor({ id: "x", propertyIds: ["prop-ll"] }), JOB)).toBe(false);
  });

  it("rejects an archived contractor", () => {
    expect(canAssignContractor(contractor({ id: "x", active: false }), JOB)).toBe(false);
  });

  it("still ALLOWS an off-call contractor — availability affects rank, not eligibility", () => {
    expect(canAssignContractor(contractor({ id: "x", onCall: false }), JOB)).toBe(true);
  });

  it("accepts a multi-trade contractor when one trade matches", () => {
    const c = contractor({ id: "x", trades: [Trade.ROOFING, Trade.PLUMBING] });
    expect(canAssignContractor(c, JOB)).toBe(true);
  });
});

describe("isReachable", () => {
  it("is true with WhatsApp only, phone only, or both", () => {
    expect(isReachable({ whatsapp: "+1", phone: null })).toBe(true);
    expect(isReachable({ whatsapp: null, phone: "+1" })).toBe(true);
    expect(isReachable({ whatsapp: "+1", phone: "+1" })).toBe(true);
  });

  it("is false with no channel at all", () => {
    expect(isReachable({ whatsapp: null, phone: null })).toBe(false);
  });
});

describe("rankContractorsForJob", () => {
  it("filters out everyone ineligible", () => {
    const ranked = rankContractorsForJob(
      [
        contractor({ id: "wrong-trade", trades: [Trade.HVAC] }),
        contractor({ id: "wrong-property", propertyIds: ["prop-ll"] }),
        contractor({ id: "archived", active: false }),
        contractor({ id: "eligible" }),
      ],
      JOB,
    );
    expect(ranked.map((c) => c.id)).toEqual(["eligible"]);
  });

  it("puts the contracted contractor first — the standing emergency rule", () => {
    const ranked = rankContractorsForJob(
      [contractor({ id: "adhoc" }), contractor({ id: "contracted", contracted: true })],
      JOB,
    );
    expect(ranked[0]?.id).toBe("contracted");
  });

  it("prefers on-call over off-call at equal contract status", () => {
    const ranked = rankContractorsForJob(
      [contractor({ id: "off", onCall: false }), contractor({ id: "on" })],
      JOB,
    );
    expect(ranked.map((c) => c.id)).toEqual(["on", "off"]);
  });

  it("sinks an unreachable contractor below a reachable one", () => {
    const ranked = rankContractorsForJob(
      [
        contractor({ id: "unreachable", whatsapp: null, phone: null }),
        contractor({ id: "reachable" }),
      ],
      JOB,
    );
    expect(ranked.map((c) => c.id)).toEqual(["reachable", "unreachable"]);
  });

  it("keeps an unreachable contractor in the list rather than hiding them", () => {
    const ranked = rankContractorsForJob(
      [contractor({ id: "unreachable", whatsapp: null, phone: null })],
      JOB,
    );
    expect(ranked).toHaveLength(1);
  });

  it("contracted outranks on-call — contract status is the stronger signal", () => {
    const ranked = rankContractorsForJob(
      [
        contractor({ id: "oncall-adhoc", onCall: true }),
        contractor({ id: "offcall-contracted", contracted: true, onCall: false }),
      ],
      JOB,
    );
    expect(ranked[0]?.id).toBe("offcall-contracted");
  });

  it("breaks ties by name so the order is stable across renders", () => {
    const ranked = rankContractorsForJob(
      [
        contractor({ id: "c", name: "Cristina de León" }),
        contractor({ id: "a", name: "Arlis Velázquez" }),
        contractor({ id: "b", name: "Blake" }),
      ],
      JOB,
    );
    expect(ranked.map((c) => c.name)).toEqual(["Arlis Velázquez", "Blake", "Cristina de León"]);
  });

  it("returns an empty list when nobody covers the property+trade", () => {
    expect(rankContractorsForJob([contractor({ id: "x", trades: [Trade.HVAC] })], JOB)).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [contractor({ id: "b" }), contractor({ id: "a", contracted: true })];
    const copy = [...input];
    rankContractorsForJob(input, JOB);
    expect(input.map((c) => c.id)).toEqual(copy.map((c) => c.id));
  });
});

// --- Validation -------------------------------------------------------------

describe("createJobSchema", () => {
  const base = { propertyId: "6f3f4d6e-0f38-4a3f-8f6a-6b1e6f0f1a2b", trade: Trade.PLUMBING };

  it("accepts the minimum viable job", () => {
    expect(createJobSchema.safeParse({ ...base, problem: "Burst pipe" }).success).toBe(true);
  });

  it("rejects an empty or whitespace-only problem", () => {
    expect(createJobSchema.safeParse({ ...base, problem: "" }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...base, problem: "   " }).success).toBe(false);
  });

  it("rejects an over-long problem", () => {
    expect(createJobSchema.safeParse({ ...base, problem: "x".repeat(2001) }).success).toBe(false);
  });

  it("rejects a non-uuid property", () => {
    expect(createJobSchema.safeParse({ ...base, propertyId: "kw", problem: "x" }).success).toBe(
      false,
    );
  });

  it("accepts an empty room label (the field is optional)", () => {
    expect(createJobSchema.safeParse({ ...base, problem: "x", roomLabel: "" }).success).toBe(true);
  });

  it("trims the problem text", () => {
    const parsed = createJobSchema.parse({ ...base, problem: "  leak  " });
    expect(parsed.problem).toBe("leak");
  });
});

describe("updateStatusSchema", () => {
  it("allows a live status with no note", () => {
    expect(updateStatusSchema.safeParse({ status: JobStatus.IN_PROGRESS }).success).toBe(true);
  });

  it("requires a note to complete", () => {
    expect(updateStatusSchema.safeParse({ status: JobStatus.COMPLETED }).success).toBe(false);
    expect(
      updateStatusSchema.safeParse({ status: JobStatus.COMPLETED, completionNote: "Replaced trap" })
        .success,
    ).toBe(true);
  });

  it("requires a reason to cancel", () => {
    expect(updateStatusSchema.safeParse({ status: JobStatus.CANCELLED }).success).toBe(false);
    expect(
      updateStatusSchema.safeParse({ status: JobStatus.CANCELLED, completionNote: "Duplicate" })
        .success,
    ).toBe(true);
  });

  it("rejects an empty-string note on a terminal status", () => {
    expect(
      updateStatusSchema.safeParse({ status: JobStatus.COMPLETED, completionNote: "   " }).success,
    ).toBe(false);
  });
});
