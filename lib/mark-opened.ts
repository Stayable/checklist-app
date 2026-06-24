import { InstanceStatus } from "@prisma/client";

// A checklist's real start time is stamped the first time its assignee opens it
// (ADR-018 epic). Only an un-started, assignee-opened instance qualifies.
export function shouldMarkOpened(
  status: InstanceStatus,
  openedAt: Date | null,
  isAssignee: boolean,
): boolean {
  if (!isAssignee) return false;
  if (openedAt !== null) return false;
  return status === InstanceStatus.SCHEDULED || status === InstanceStatus.ASSIGNED;
}
