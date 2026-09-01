"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireManager, canAccessProperty } from "@/lib/rbac";
import { buildSystemId } from "@/lib/recurrence";
import { etDayStartUtc } from "@/lib/datetime";
import { subjectKindFor, type SubjectKind } from "@/lib/manual-create";
import {
  MAX_INSTANCES_PER_CREATE,
  planBatches,
  type BatchInput,
  type PlannedInstance,
} from "@/lib/batch-create";
import { buildInstanceName, type ScopeToken } from "@/lib/instance-name";

// W4 — create many checklists in one submission, across several templates.
//
// The single-template path in ./actions.ts stays for the simple case. This one
// is the wizard's: N batches, each a template plus its subjects plus its dates,
// each expanded to subjects x dates.
//
// The expansion itself lives in lib/batch-create.ts and is pure, so the preview
// the user confirms and the rows written here come from the same function. That
// is deliberate: a confirmation dialog that recomputes its own list is a
// confirmation of something other than what happens.

const MAX_BATCHES = 20;

const batchSchema = z.object({
  templateId: z.string().uuid(),
  roomIds: z.array(z.string().uuid()).default([]),
  assigneeIds: z.array(z.string().uuid()).default([]),
  taskLabels: z.array(z.string().trim().min(1).max(120)).default([]),
  // ET calendar days. Validated as a shape here; existence is not a question.
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  assignedUserId: z.string().uuid().nullable().optional(),
  // "17:00" in ET, or null for no due time.
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
});

const schema = z.object({
  propertyId: z.string().uuid(),
  batches: z.array(batchSchema).min(1).max(MAX_BATCHES),
  /** ADR-009 force-create: create even where a live instance exists that day. */
  allowDuplicates: z.boolean().optional(),
});

export type BatchCreateResult =
  | {
      ok: true;
      created: number;
      duplicates: number;
      failed: number;
      /** First created instance, for a single-result redirect. */
      firstId: string | null;
      message: string;
    }
  | { ok: false; error: string; batchIndex?: number };

/** ET wall-clock `HH:mm` on `ymd`, as a UTC instant. */
function dueAtFor(ymd: string, dueTime: string | null | undefined): Date | null {
  if (!dueTime) return null;
  const [h, m] = dueTime.split(":").map(Number);
  // etDayStartUtc gives the instant of ET midnight, so adding the offset lands
  // on ET wall-clock time. A DST transition inside the same day would shift this
  // by an hour; both US transitions happen at 02:00, and no checklist is due
  // then, so the simple arithmetic is honest here.
  return new Date(etDayStartUtc(ymd).getTime() + (h! * 60 + m!) * 60_000);
}

export async function createChecklistBatches(
  input: unknown,
): Promise<BatchCreateResult> {
  const user = await requireManager();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const { propertyId, batches, allowDuplicates } = parsed.data;

  if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { propertyId: true, shortCode: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  // ---- templates -----------------------------------------------------------
  const templateIds = [...new Set(batches.map((b) => b.templateId))];
  const templates = await db.checklistTemplate.findMany({
    where: { id: { in: templateIds } },
    select: {
      id: true,
      name: true,
      code: true,
      scope: true,
      copies: true,
      active: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
    },
  });
  const templateById = new Map(templates.map((t) => [t.id, t]));

  const kinds: SubjectKind[] = [];
  for (const [i, batch] of batches.entries()) {
    const t = templateById.get(batch.templateId);
    if (!t || !t.active) {
      return { ok: false, error: "Template not found.", batchIndex: i };
    }
    if (
      !t.allProperties &&
      !t.properties.some((p) => p.propertyId === propertyId)
    ) {
      return {
        ok: false,
        error: `"${t.name}" isn't available at this property.`,
        batchIndex: i,
      };
    }
    const subject = subjectKindFor(t.scope, t.copies);
    if (!subject.ok) {
      return { ok: false, error: subject.error, batchIndex: i };
    }
    kinds.push(subject.kind);
  }

  // ---- expand --------------------------------------------------------------
  const plan = planBatches(batches as BatchInput[], kinds);
  if (!plan.ok) {
    return { ok: false, error: plan.error, batchIndex: plan.batchIndex };
  }
  let planned = plan.instances;

  // ---- never trust client-supplied ids ------------------------------------
  const roomIds = [
    ...new Set(planned.map((p) => p.roomId).filter((id): id is string => !!id)),
  ];
  const roomById = new Map<string, string>();
  if (roomIds.length > 0) {
    const owned = await db.room.findMany({
      where: { propertyId, id: { in: roomIds } },
      select: { id: true, roomNumber: true },
    });
    if (owned.length !== roomIds.length) {
      return { ok: false, error: "One of the selected rooms is not at this property." };
    }
    for (const r of owned) roomById.set(r.id, r.roomNumber);
  }

  const assigneeIds = [
    ...new Set(
      planned
        .flatMap((p) => [p.assigneeId, null])
        .filter((id): id is string => !!id)
        .concat(
          batches
            .map((b) => b.assignedUserId ?? null)
            .filter((id): id is string => !!id),
        ),
    ),
  ];
  const userById = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const members = await db.user.findMany({
      where: {
        id: { in: assigneeIds },
        active: true,
        properties: { some: { propertyId } },
      },
      select: { id: true, name: true },
    });
    if (members.length !== assigneeIds.length) {
      return {
        ok: false,
        error: "One of the selected people isn't active at this property.",
      };
    }
    for (const m of members) userById.set(m.id, m.name);
  }

  // ---- skip rooms that already have this checklist that day ----------------
  let duplicates = 0;
  if (!allowDuplicates) {
    const live = await db.checklistInstance.findMany({
      where: {
        propertyId,
        templateId: { in: templateIds },
        scheduledFor: {
          in: [...new Set(planned.map((p) => p.date))].map((d) =>
            etDayStartUtc(d),
          ),
        },
        // INVALIDATED and EXPIRED are terminal, so they never block a re-create.
        status: { notIn: [InstanceStatus.INVALIDATED, InstanceStatus.EXPIRED] },
      },
      select: { templateId: true, roomId: true, scheduledFor: true },
    });
    const taken = new Set(
      live.map(
        (i) =>
          `${i.templateId}|${i.roomId ?? ""}|${i.scheduledFor.toISOString().slice(0, 10)}`,
      ),
    );
    const before = planned.length;
    // Only room-scoped duplicates are meaningful. Two per-task checklists on the
    // same day are two different tasks, and two per-person ones are two people.
    planned = planned.filter(
      (p) =>
        p.roomId == null ||
        !taken.has(`${p.templateId}|${p.roomId}|${p.date}`),
    );
    duplicates = before - planned.length;
  }

  if (planned.length === 0) {
    return {
      ok: false,
      error:
        'Every checklist you selected already exists for those days. Tick "Create even if one already exists" to add them anyway.',
    };
  }
  if (planned.length > MAX_INSTANCES_PER_CREATE) {
    return {
      ok: false,
      error: `That would create ${planned.length} checklists; the limit is ${MAX_INSTANCES_PER_CREATE} at once.`,
    };
  }

  // ---- write ---------------------------------------------------------------
  //
  // Sequential, one at a time, each with its own P2002 retry. Deliberately NOT
  // wrapped in a transaction: a P2002 inside one poisons it and defeats the
  // retry, the same trap already documented in lib/network/ticketing.server.ts.
  function tokenFor(p: PlannedInstance): ScopeToken {
    if (p.roomId) return { kind: "ROOM", roomNumber: roomById.get(p.roomId) ?? "" };
    if (p.assigneeId)
      return { kind: "ASSIGNEE", name: userById.get(p.assigneeId) ?? "" };
    if (p.taskLabel) return { kind: "TASK", label: p.taskLabel };
    return { kind: "NONE" };
  }

  async function createOne(
    p: PlannedInstance,
    retrying = false,
  ): Promise<{ id: string }> {
    const template = templateById.get(p.templateId)!;
    const scheduledFor = etDayStartUtc(p.date);
    const existingCount = await db.checklistInstance.count({
      where: { propertyId, templateId: p.templateId, scheduledFor },
    });
    const batch = batches[p.batchIndex]!;
    // A PER_ASSIGNEE instance belongs to the person it enumerates; anything else
    // takes the batch's single assignee.
    const assignedUserId = p.assigneeId ?? batch.assignedUserId ?? null;
    try {
      return await db.checklistInstance.create({
        data: {
          systemId: buildSystemId(
            property!.propertyId,
            template.code,
            p.date.replace(/-/g, ""),
            existingCount + 1,
          ),
          title: buildInstanceName({
            templateName: template.name,
            shortCode: property!.shortCode,
            token: tokenFor(p),
            date: scheduledFor,
          }),
          templateId: p.templateId,
          propertyId,
          roomId: p.roomId,
          taskLabel: p.taskLabel,
          scheduledFor,
          dueAt: dueAtFor(p.date, batch.dueTime),
          assignedUserId,
          status: assignedUserId
            ? InstanceStatus.ASSIGNED
            : InstanceStatus.SCHEDULED,
        },
        select: { id: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        !retrying
      ) {
        return createOne(p, true);
      }
      throw err;
    }
  }

  const createdIds: string[] = [];
  let failed = 0;
  for (const p of planned) {
    try {
      const row = await createOne(p);
      createdIds.push(row.id);
    } catch {
      // One bad row must not discard the rest of a 300-checklist batch.
      failed += 1;
    }
  }

  if (createdIds.length > 0) {
    await db.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "checklist_instance",
        entityId: createdIds[0]!,
        action: "batch_create",
        after: {
          created: createdIds.length,
          duplicates,
          failed,
          batches: batches.length,
          propertyId,
        },
      },
    });
  }

  revalidatePath("/checklists");
  revalidatePath("/review");

  const parts = [
    `Created ${createdIds.length} checklist${createdIds.length === 1 ? "" : "s"}.`,
  ];
  if (duplicates > 0) {
    parts.push(`${duplicates} skipped — already existed.`);
  }
  if (failed > 0) parts.push(`${failed} failed.`);

  return {
    ok: true,
    created: createdIds.length,
    duplicates,
    failed,
    firstId: createdIds[0] ?? null,
    message: parts.join(" "),
  };
}
