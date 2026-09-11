"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { accessiblePropertyIds, requireManager } from "@/lib/rbac";

// Deleting MIS-CREATED checklists (Kyle, 2026-09-11).
//
// This is deliberately NOT the same thing as ADR-031's close-out. A checklist
// that stopped being needed is INVALIDATED — it happened, somebody decided it
// should not be done, and that decision is worth keeping. This is for a
// checklist that should never have existed: the wrong template, the wrong
// property, a batch of 40 rooms when 4 were meant. There is nothing to preserve
// because nothing happened.
//
// THE LINE, and it is the whole safety model: an instance carrying real work is
// refused. "Real work" means any response, any submission, or any issue raised
// from it. Scaffolding is cheap to recreate; somebody's filled checklist is not,
// and at 2am the two look identical in a list. Same rule as
// scripts/delete-test-checklist.ts, which is where it was first written.
//
// Rows that fail the check do not fail the batch — the rest are deleted and the
// caller is told exactly which were kept and why. An all-or-nothing batch would
// mean one submitted checklist blocks a cleanup of thirty.

export type DeleteResult =
  | {
      ok: true;
      deleted: number;
      refused: { title: string; reason: string }[];
      /** Ids that matched nothing in scope — already gone, or another property's. */
      skipped: number;
    }
  | { ok: false; error: string };

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Select at least one checklist.").max(500),
});

export async function deleteChecklists(input: unknown): Promise<DeleteResult> {
  const user = await requireManager();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { ids } = parsed.data;

  // Property scope is applied in the QUERY, not checked afterwards: a manager
  // who hand-crafts a POST with another property's ids simply gets no rows back
  // for them, so those ids can never reach the delete. They are counted as
  // `skipped` rather than reported as refusals — the caller is not entitled to
  // learn whether an id they cannot see exists at all.
  const scope = await accessiblePropertyIds(user);
  const instances = await db.checklistInstance.findMany({
    where: { id: { in: ids }, propertyId: { in: scope } },
    select: {
      id: true,
      systemId: true,
      title: true,
      status: true,
      propertyId: true,
      templateId: true,
      scheduledFor: true,
      submittedAt: true,
      _count: { select: { responses: true, sourcedIssues: true } },
    },
  });

  if (instances.length === 0) {
    return { ok: false, error: "Nothing to delete — those checklists are gone or out of your scope." };
  }

  const deletable: typeof instances = [];
  const refused: { title: string; reason: string }[] = [];

  for (const i of instances) {
    // Both columns are nullable on ChecklistInstance, so the id is the last
    // resort — a refusal message with a blank subject names nothing.
    const label = i.title || i.systemId || i.id;
    if (i.submittedAt) {
      refused.push({ title: label, reason: "already submitted" });
    } else if (i._count.responses > 0) {
      refused.push({
        title: label,
        reason: `${i._count.responses} answer${i._count.responses === 1 ? "" : "s"} filled in`,
      });
    } else if (i._count.sourcedIssues > 0) {
      // Issue.sourceInstance is an OPTIONAL relation, so Prisma's default
      // action would SetNull rather than block — the issue would survive with
      // no idea where it came from. Refusing keeps the provenance intact;
      // resolve or delete the issue first if the checklist really must go.
      refused.push({ title: label, reason: "an issue was raised from it" });
    } else {
      deletable.push(i);
    }
  }

  if (deletable.length > 0) {
    // Responses cascade from the instance and photos cascade from responses,
    // so one deleteMany clears the tree. The R2 OBJECTS behind any photo are
    // NOT removed — but a checklist with zero responses has no photos, which
    // is exactly why the no-responses rule also keeps this honest.
    await db.$transaction([
      db.checklistInstance.deleteMany({ where: { id: { in: deletable.map((i) => i.id) } } }),
      db.auditLog.createMany({
        data: deletable.map((i) => ({
          actorUserId: user.id,
          entityType: "checklist_instance",
          entityId: i.id,
          action: "delete",
          // The row is gone, so the audit entry is the only remaining record of
          // what it was. Keep enough to recreate it.
          before: {
            systemId: i.systemId,
            title: i.title,
            status: i.status,
            propertyId: i.propertyId,
            templateId: i.templateId,
            scheduledFor: i.scheduledFor.toISOString(),
          } satisfies Prisma.InputJsonValue,
        })),
      }),
    ]);
    revalidatePath("/checklists");
    revalidatePath("/dashboard");
  }

  return {
    ok: true,
    deleted: deletable.length,
    refused,
    skipped: ids.length - instances.length,
  };
}
