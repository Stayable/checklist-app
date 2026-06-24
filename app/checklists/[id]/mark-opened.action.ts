"use server";

import { InstanceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { shouldMarkOpened } from "@/lib/mark-opened";

// Idempotent: stamps openedAt + flips to IN_PROGRESS the first time the assignee
// opens the checklist. Safe to call on every mount — guarded by shouldMarkOpened.
export async function markOpened(instanceId: string): Promise<void> {
  const user = await requireUser();
  const instance = await db.checklistInstance.findUnique({
    where: { id: instanceId },
    select: { assignedUserId: true, status: true, openedAt: true },
  });
  if (!instance) return;
  const isAssignee = instance.assignedUserId === user.id;
  if (!shouldMarkOpened(instance.status, instance.openedAt, isAssignee)) return;

  // Conditional update guards against a concurrent double-open race: only stamp
  // when openedAt is still null.
  await db.checklistInstance.updateMany({
    where: { id: instanceId, openedAt: null },
    data: { openedAt: new Date(), status: InstanceStatus.IN_PROGRESS },
  });
}
