"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus, Prisma, TemplateScope } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager, canAccessProperty } from "@/lib/rbac";
import { buildSystemId } from "@/lib/recurrence";
import { etDateOnly, etYYYYMMDD } from "@/lib/datetime";
import {
  MAX_ROOMS_PER_CREATE,
  resolveRoomIds,
  planRoomInstances,
  summarizeCreateResult,
  validateRoomSelection,
} from "@/lib/manual-create";

export type ActionResult =
  | {
      ok: true;
      /** First instance created — used for a single-room redirect. */
      id: string;
      created: number;
      /** Rooms skipped because they already had this checklist today. */
      duplicates: number;
      failed: number;
      message?: string;
    }
  | { ok: false; error: string };

const schema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  // One instance is created per room (ADR-009: one instance = one room).
  // Empty for PER_PROPERTY / AD_HOC templates.
  roomIds: z.array(z.string().uuid()).max(MAX_ROOMS_PER_CREATE).default([]),
  // LEGACY, transitional. The pre-multi-select client posts a single `roomId`.
  // Zod strips unknown keys, so without this the old client's room silently
  // vanishes, roomIds falls back to [] and every PER_ROOM create is rejected
  // with "select at least one room" -- a runtime-only break that typechecks
  // clean, because the mismatch is across the form boundary.
  // Normalised into roomIds below. DELETE once ManualCreateClient posts roomIds.
  roomId: z.string().uuid().nullable().optional(),
  // S1: free-text room label when no Room row is chosen (e.g. "-", "Suite").
  roomLabel: z.string().trim().max(120).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required"),
  // ADR-009 force-create: create even where a live instance already exists today.
  allowDuplicates: z.boolean().optional(),
});

export async function createInstanceManually(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const {
    templateId,
    propertyId,
    roomIds: roomIdsInput,
    roomId: legacyRoomId,
    roomLabel,
    assignedUserId,
    title,
    allowDuplicates,
  } = parsed.data;

  const roomIds = resolveRoomIds({ roomIds: roomIdsInput, roomId: legacyRoomId });

  if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const template = await db.checklistTemplate.findUnique({
    where: { id: templateId },
    select: {
      code: true,
      scope: true,
      active: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
    },
  });
  if (!template || !template.active) {
    return { ok: false, error: "Template not found." };
  }

  // properties relation is TemplateProperty[]; each has propertyId = Property.id (UUID)
  const applies =
    template.allProperties ||
    template.properties.some((p) => p.propertyId === propertyId);
  if (!applies) {
    return {
      ok: false,
      error: "That template isn't available at this property.",
    };
  }

  const perRoom = template.scope === TemplateScope.PER_ROOM;
  const requested = perRoom ? roomIds : [];
  const selectionError = validateRoomSelection({
    perRoom,
    count: requested.length,
  });
  if (selectionError) return { ok: false, error: selectionError };

  // Never trust client-supplied room ids: every room must belong to this property.
  if (requested.length > 0) {
    const owned = await db.room.findMany({
      where: { propertyId, id: { in: requested } },
      select: { id: true },
    });
    if (owned.length !== new Set(requested).size) {
      return {
        ok: false,
        error: "One of the selected rooms is not at this property.",
      };
    }
  }

  // Free-text label only kept when there is no real Room row.
  const effectiveRoomLabel = perRoom ? null : (roomLabel?.trim() || null);

  // Need the property's short code (propertyId field) for the system ID.
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { propertyId: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  const target = etDateOnly();
  const ymd = etYYYYMMDD(target);

  // Rooms that already carry a live instance of this template today.
  // INVALIDATED and EXPIRED are terminal, so they never block a fresh create.
  let existingRoomIds: string[] = [];
  if (requested.length > 0) {
    const live = await db.checklistInstance.findMany({
      where: {
        propertyId,
        templateId,
        scheduledFor: target,
        roomId: { in: requested },
        status: {
          notIn: [InstanceStatus.INVALIDATED, InstanceStatus.EXPIRED],
        },
      },
      select: { roomId: true },
    });
    existingRoomIds = live
      .map((i) => i.roomId)
      .filter((id): id is string => id != null);
  }

  const plan = planRoomInstances({
    selectedRoomIds: requested,
    existingRoomIds,
    allowDuplicates: allowDuplicates === true,
  });

  if (perRoom && plan.create.length === 0) {
    return {
      ok: false,
      error:
        'Every selected room already has this checklist today. Tick "Create even if one already exists" to add another.',
    };
  }

  // ADR-009 seq: per (property, template, ET day), restart at 001, continue
  // past pre-existing instances — same logic as generateForDate(). The count is
  // recomputed per room so a batch numbers itself 001, 002, 003…
  //
  // Deliberately NOT wrapped in one transaction: a P2002 inside a transaction
  // poisons it and defeats the retry — the same trap already documented in
  // lib/network/ticketing.server.ts.
  async function createOne(
    roomId: string | null,
    retrying = false,
  ): Promise<{ id: string }> {
    const existingCount = await db.checklistInstance.count({
      where: { propertyId, templateId, scheduledFor: target },
    });
    const seq = existingCount + 1;
    try {
      return await db.checklistInstance.create({
        data: {
          systemId: buildSystemId(
            property!.propertyId,
            template!.code,
            ymd,
            seq,
          ),
          title,
          templateId,
          propertyId,
          roomId,
          roomLabel: roomId ? null : effectiveRoomLabel,
          scheduledFor: target,
          assignedUserId: assignedUserId ?? null,
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
        // Race on systemId — recompute seq and retry once.
        return createOne(roomId, true);
      }
      throw err;
    }
  }

  // PER_ROOM creates one instance per room; everything else creates exactly one.
  const targets: (string | null)[] = perRoom ? plan.create : [null];
  const createdIds: string[] = [];
  const failedRoomIds: string[] = [];

  for (const roomId of targets) {
    try {
      const row = await createOne(roomId);
      createdIds.push(row.id);
      await db.auditLog.create({
        data: {
          actorUserId: user.id,
          entityType: "checklist_instance",
          entityId: row.id,
          action: "create_manual",
          after: {
            title,
            templateId,
            propertyId,
            roomId,
          } as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // The batch continues: one contended sequence number must not lose the rest.
        failedRoomIds.push(roomId ?? "-");
        continue;
      }
      throw err;
    }
  }

  if (createdIds.length === 0) {
    return {
      ok: false,
      error: "Those checklist numbers were just taken — please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/review");
  return {
    ok: true,
    id: createdIds[0]!,
    created: createdIds.length,
    duplicates: plan.duplicates.length,
    failed: failedRoomIds.length,
    message: summarizeCreateResult({
      created: createdIds.length,
      duplicates: plan.duplicates.length,
      failed: failedRoomIds.length,
    }),
  };
}
