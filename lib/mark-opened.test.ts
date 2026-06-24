import { describe, expect, it } from "vitest";
import { InstanceStatus } from "@prisma/client";
import { shouldMarkOpened } from "./mark-opened";

describe("shouldMarkOpened", () => {
  it("stamps a fresh ASSIGNED instance opened by its assignee", () => {
    expect(shouldMarkOpened(InstanceStatus.ASSIGNED, null, true)).toBe(true);
  });
  it("stamps a SCHEDULED (unassigned-then-picked-up) instance", () => {
    expect(shouldMarkOpened(InstanceStatus.SCHEDULED, null, true)).toBe(true);
  });
  it("does not re-stamp once openedAt is set", () => {
    expect(shouldMarkOpened(InstanceStatus.IN_PROGRESS, new Date(), true)).toBe(false);
  });
  it("does not stamp for a non-assignee (manager viewing)", () => {
    expect(shouldMarkOpened(InstanceStatus.ASSIGNED, null, false)).toBe(false);
  });
  it("does not stamp a submitted/reviewed instance", () => {
    expect(shouldMarkOpened(InstanceStatus.SUBMITTED, null, true)).toBe(false);
    expect(shouldMarkOpened(InstanceStatus.REVIEWED, null, true)).toBe(false);
  });
});
