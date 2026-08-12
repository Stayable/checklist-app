import { ContractorJobStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  SOURCE_STATUSES,
  SOURCE_STATUS_MAP,
  SUPPORTED_CONTRACT_VERSION,
  type CandidateJob,
  type ContractorMatch,
  type ContractorUpdatePayload,
  contractorUpdatePayloadSchema,
  decideContractorUpdate,
  isRealYMD,
  nameKey,
  normalizePhone,
  readContractVersion,
} from "./contractor-update";

// A minimal valid payload; each test overrides only what it is about.
function payload(overrides: Partial<ContractorUpdatePayload> = {}): ContractorUpdatePayload {
  return {
    contractVersion: 1,
    messageSid: "SM0000000000000000000000000000000",
    receivedAtUtc: "2026-08-12T17:34:02Z",
    channel: "voice",
    outcome: "written",
    workDate: "2026-08-12",
    contractorPhone: "+19045551234",
    contractorName: "Jose Felix Ortega",
    scheduledPropertyId: "812",
    scheduledTask: "Room renovation",
    actualProperty: null,
    roomOrArea: "125",
    status: "In Progress",
    priorStatus: "Pending",
    summary: "Flooring installation started in room 125.",
    matchesScheduledTask: true,
    confidence: "high",
    notesForGm: null,
    detectedLanguage: "es",
    transcriptOriginal: "INSTALACION PISO",
    transcriptEnglish: "Floor installation",
    durationSeconds: 11.1,
    mediaBlobUrls: [],
    smartsheetRowId: "7719369064710020",
    ...overrides,
  };
}

function job(overrides: Partial<CandidateJob> = {}): CandidateJob {
  return {
    id: "job-1",
    status: ContractorJobStatus.PLANNED,
    propertyId: "prop-812",
    roomLabel: null,
    ...overrides,
  };
}

const MATCH: ContractorMatch = { contractorId: "c-1", matchedBy: "phone" };

function decide(
  p: Partial<ContractorUpdatePayload>,
  candidates: CandidateJob[],
  match: ContractorMatch | null = MATCH,
) {
  return decideContractorUpdate({
    payload: payload(p),
    match,
    candidates,
    scheduledPropertyId: "prop-812",
  });
}

// ---------------------------------------------------------------------------
// §8 status mapping
// ---------------------------------------------------------------------------

describe("SOURCE_STATUS_MAP", () => {
  it("maps every source status the pipeline can emit", () => {
    for (const status of SOURCE_STATUSES) {
      expect(SOURCE_STATUS_MAP[status]).toBeDefined();
    }
  });

  // The whole reason the DELAYED enum value was added. Before it, Pending and
  // Delayed both mapped to PLANNED and a delayed job rendered identically to
  // one nobody had touched.
  it("maps Delayed to DELAYED, distinct from Pending", () => {
    expect(SOURCE_STATUS_MAP.Delayed).toBe(ContractorJobStatus.DELAYED);
    expect(SOURCE_STATUS_MAP.Pending).toBe(ContractorJobStatus.PLANNED);
    expect(SOURCE_STATUS_MAP.Delayed).not.toBe(SOURCE_STATUS_MAP.Pending);
  });

  // "Delayed" means the scheduled task got no progress. IN_PROGRESS would
  // state the opposite of what the crew reported.
  it("never maps Delayed to IN_PROGRESS", () => {
    expect(SOURCE_STATUS_MAP.Delayed).not.toBe(ContractorJobStatus.IN_PROGRESS);
  });
});

// ---------------------------------------------------------------------------
// §6 payload + §12 versioning
// ---------------------------------------------------------------------------

describe("contractorUpdatePayloadSchema", () => {
  it("accepts the contract's example payload", () => {
    expect(contractorUpdatePayloadSchema.safeParse(payload()).success).toBe(true);
  });

  // §12: "Add fields freely." A pipeline deploy that adds a field must not
  // start failing every delivery.
  it("strips unknown fields instead of rejecting them", () => {
    const parsed = contractorUpdatePayloadSchema.safeParse({
      ...payload(),
      somethingAddedLater: "hello",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "somethingAddedLater" in parsed.data).toBe(false);
  });

  it("rejects a status outside the Smartsheet vocabulary", () => {
    expect(contractorUpdatePayloadSchema.safeParse(payload({ status: "Blocked" as never })).success)
      .toBe(false);
  });

  it("accepts a null status (an update with no status change)", () => {
    expect(contractorUpdatePayloadSchema.safeParse(payload({ status: null })).success).toBe(true);
  });

  // Shape-valid but impossible. new Date() overflows it to 3 March rather
  // than throwing, which would file the report on the wrong day.
  it("rejects an impossible calendar date", () => {
    expect(contractorUpdatePayloadSchema.safeParse(payload({ workDate: "2026-02-31" })).success)
      .toBe(false);
  });

  it("rejects a compact date", () => {
    expect(contractorUpdatePayloadSchema.safeParse(payload({ workDate: "20260812" })).success)
      .toBe(false);
  });
});

describe("isRealYMD", () => {
  it.each([
    ["2026-08-12", true],
    ["2026-02-28", true],
    ["2028-02-29", true], // leap year
    ["2026-02-29", false], // not a leap year
    ["2026-02-31", false],
    ["2026-13-01", false],
    ["20260812", false],
    ["2026-8-12", false],
    ["", false],
  ])("%s -> %s", (value, expected) => {
    expect(isRealYMD(value)).toBe(expected);
  });
});

describe("readContractVersion", () => {
  it("reads the version without validating anything else", () => {
    expect(readContractVersion({ contractVersion: 2, nonsense: true })).toBe(2);
  });

  it("returns null when absent or not an integer", () => {
    expect(readContractVersion({})).toBeNull();
    expect(readContractVersion({ contractVersion: "1" })).toBeNull();
    expect(readContractVersion({ contractVersion: 1.5 })).toBeNull();
    expect(readContractVersion(null)).toBeNull();
    expect(readContractVersion("not an object")).toBeNull();
  });

  it("agrees with the supported version for a current payload", () => {
    expect(readContractVersion(payload())).toBe(SUPPORTED_CONTRACT_VERSION);
  });
});

// ---------------------------------------------------------------------------
// §7 job resolution
// ---------------------------------------------------------------------------

describe("decideContractorUpdate", () => {
  it("applies the status when exactly one open job matches", () => {
    const decision = decide({}, [job()]);
    expect(decision.kind).toBe("apply-status");
    expect(decision).toMatchObject({ jobId: "job-1", status: ContractorJobStatus.IN_PROGRESS });
  });

  it("appends a note without a status change when the status is unchanged", () => {
    const decision = decide({ status: "Pending" }, [job({ status: ContractorJobStatus.PLANNED })]);
    expect(decision.kind).toBe("note-only");
  });

  it("appends a note when no status was reported", () => {
    const decision = decide({ status: null }, [job()]);
    expect(decision.kind).toBe("note-only");
  });

  // ADR-030's invariant, and the pipeline's own never-downgrade-Completed
  // rule. A closed job stays closed; the conflict is recorded, not applied.
  it("never reopens a terminal job", () => {
    for (const status of [ContractorJobStatus.DONE, ContractorJobStatus.CANCELLED]) {
      const decision = decide({ status: "In Progress" }, [job({ status })]);
      expect(decision.kind).toBe("note-only");
      expect(decision.body).toContain("Left closed");
    }
  });

  it("files a daily note when no contractor is identified", () => {
    const decision = decide({}, [], null);
    expect(decision.kind).toBe("daily-note");
    expect(decision.body).toContain("No contractor on file");
  });

  it("files a daily note when the contractor has no job that day", () => {
    const decision = decide({}, []);
    expect(decision.kind).toBe("daily-note");
    expect(decision.body).toContain("No job is scheduled");
  });

  // §7: flagged is never a status change.
  it("files a daily note for a flagged outcome even when a job matches", () => {
    const decision = decide({ outcome: "flagged" }, [job()]);
    expect(decision.kind).toBe("daily-note");
    expect(decision.body).toContain("Flagged by the update pipeline");
  });

  // §Q41. Attaching a crew's report to the wrong job is worse than an
  // unplaced note a human can file.
  it("refuses to guess when two jobs match, and names both", () => {
    const decision = decide({}, [job({ id: "job-1" }), job({ id: "job-2" })]);
    expect(decision.kind).toBe("ambiguous");
    expect(decision).toMatchObject({ jobIds: ["job-1", "job-2"] });
    expect(decision.body).toContain("job-1, job-2");
  });

  // §7, decided 08/12/26: the note lands on the assigned job at the job's own
  // property; actualProperty is named in the text and never moves anything.
  it("keeps an off-plan job where it is and names the actual property", () => {
    const decision = decide({ actualProperty: "Boca Condo", status: "Delayed" }, [job()]);
    expect(decision.kind).toBe("apply-status");
    expect(decision).toMatchObject({ jobId: "job-1", status: ContractorJobStatus.DELAYED });
    expect(decision.body).toContain("Boca Condo");
    expect(decision.body).toContain("has not been moved");
  });

  it("fills an empty room label but never overwrites one", () => {
    expect(decide({ roomOrArea: "125" }, [job({ roomLabel: null })])).toMatchObject({
      roomLabel: "125",
    });
    expect(decide({ roomOrArea: "125" }, [job({ roomLabel: "Rm 300" })])).toMatchObject({
      roomLabel: null,
    });
    // Whitespace-only is not a label.
    expect(decide({ roomOrArea: "125" }, [job({ roomLabel: "   " })])).toMatchObject({
      roomLabel: "125",
    });
  });

  it("records which key resolved the contractor", () => {
    expect(decide({}, [job()], { contractorId: "c-1", matchedBy: "phone" }).body).toContain(
      "matched by phone",
    );
    expect(decide({}, [job()], { contractorId: "c-1", matchedBy: "name" }).body).toContain(
      "matched by name",
    );
  });

  it("survives a missing summary rather than writing an empty note", () => {
    const decision = decide({ summary: null }, [job()]);
    expect(decision.body).toContain("(no summary reported)");
    expect(decision.body.trim().length).toBeGreaterThan(0);
  });

  it("carries notesForGm into the note", () => {
    expect(decide({ notesForGm: "Needs a part ordered" }, [job()]).body).toContain(
      "Needs a part ordered",
    );
  });

  it("never exceeds the note body cap", () => {
    const decision = decide({ summary: "x".repeat(5000) }, [job()]);
    expect(decision.body.length).toBeLessThanOrEqual(2000);
  });
});

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

describe("normalizePhone", () => {
  it("treats the same number written differently as equal", () => {
    const forms = ["+19045551234", "(904) 555-1234", "904-555-1234", "1 904 555 1234", "9045551234"];
    const normalized = forms.map(normalizePhone);
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("9045551234");
  });

  it("returns null for absent or too-short input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("555-1234")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
  });
});

describe("nameKey", () => {
  it("ignores case and collapses whitespace", () => {
    expect(nameKey("  Jose  Felix   Ortega ")).toBe(nameKey("jose felix ortega"));
  });

  // The documented limit of the fallback: the schedule's short forms do NOT
  // match the roster's long forms, which is exactly why the contract keys on
  // phone first and why production having no phone numbers is a blocker.
  it("does NOT match documented name variants", () => {
    expect(nameKey("Joycer A. Parra Munoz")).not.toBe(nameKey("Joycer Antonio Parra Munoz"));
    expect(nameKey("Ronal S.")).not.toBe(nameKey("Ronal Stevent Rojas Mora"));
  });
});
