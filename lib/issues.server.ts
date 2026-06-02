import { IssuePriority, IssueStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { slaTargetAt } from "@/lib/review";

// Server-side issue creation shared by the submit pipeline (auto-Issue from a
// failed PASSFAIL with fail_flags_issue) and the manager Flag action. Reads
// admin-editable sla_defaults to stamp slaTargetAt at creation (ADR-014).

type Tx = Prisma.TransactionClient;

export async function slaHoursByPriority(): Promise<Partial<Record<IssuePriority, number>>> {
  const rows = await db.slaDefault.findMany();
  return Object.fromEntries(rows.map((r) => [r.priority, r.hours]));
}

const OPEN_STATUSES: IssueStatus[] = [
  IssueStatus.OPEN,
  IssueStatus.ASSIGNED,
  IssueStatus.IN_PROGRESS,
];

export type NewIssueInput = {
  propertyId: string;
  roomId?: string | null;
  sourceInstanceId: string;
  sourceQuestionId?: string | null;
  title: string;
  description?: string | null;
  priority?: IssuePriority;
};

/**
 * Create an issue with its SLA target stamped from sla_defaults. When the issue
 * is question-sourced, skip creation if an unresolved issue already exists for
 * the same (instance, question) — prevents duplicates on redo → resubmit.
 * Returns the created issue id, or null when deduped.
 */
export async function createIssue(
  tx: Tx,
  input: NewIssueInput,
  hoursByPriority: Partial<Record<IssuePriority, number>>,
): Promise<string | null> {
  if (input.sourceQuestionId) {
    const existing = await tx.issue.findFirst({
      where: {
        sourceInstanceId: input.sourceInstanceId,
        sourceQuestionId: input.sourceQuestionId,
        status: { in: OPEN_STATUSES },
      },
      select: { id: true },
    });
    if (existing) return null;
  }

  const priority = input.priority ?? IssuePriority.MEDIUM;
  const now = new Date();
  const issue = await tx.issue.create({
    data: {
      propertyId: input.propertyId,
      roomId: input.roomId ?? null,
      sourceInstanceId: input.sourceInstanceId,
      sourceQuestionId: input.sourceQuestionId ?? null,
      title: input.title.slice(0, 200),
      description: input.description ?? null,
      priority,
      slaTargetAt: slaTargetAt(now, priority, hoursByPriority),
    },
    select: { id: true },
  });
  return issue.id;
}
