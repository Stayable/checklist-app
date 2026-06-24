"use server";

import { revalidatePath } from "next/cache";
import { InstanceStatus, Prisma, TemplateScope } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager, canAccessProperty } from "@/lib/rbac";
import { buildSystemId } from "@/lib/recurrence";
import { etDateOnly, etYYYYMMDD } from "@/lib/datetime";

export type ActionResult =
  | { ok: true; id: string; message?: string }
  | { ok: false; error: string };

const schema = z.object({
  templateId: z.string().uuid(),
  propertyId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, "Title is required"),
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
  const { templateId, propertyId, roomId, assignedUserId, title } =
    parsed.data;

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

  if (template.scope === TemplateScope.PER_ROOM && !roomId) {
    return {
      ok: false,
      error: "This checklist is per-room — choose a room.",
    };
  }
  const effectiveRoomId =
    template.scope === TemplateScope.PER_ROOM ? (roomId ?? null) : null;

  // Need the property's short code (propertyId field) for the system ID.
  const property = await db.property.findUnique({
    where: { id: propertyId },
    select: { propertyId: true },
  });
  if (!property) return { ok: false, error: "Property not found." };

  const target = etDateOnly();
  const ymd = etYYYYMMDD(target);

  // ADR-009 seq: per (property, template, ET day), restart at 001, continue
  // past pre-existing instances — same logic as generateForDate().
  // Wrapped in try/catch to handle P2002 unique-constraint collisions from
  // concurrent creates or races with the 5 AM cron.
  async function attemptCreate(retrying = false): Promise<{ id: string }> {
    const existingCount = await db.checklistInstance.count({
      where: { propertyId, templateId, scheduledFor: target },
    });
    const seq = existingCount + 1;
    try {
      return await db.checklistInstance.create({
        data: {
          systemId: buildSystemId(property!.propertyId, template!.code, ymd, seq),
          title,
          templateId,
          propertyId,
          roomId: effectiveRoomId,
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
        return attemptCreate(true);
      }
      throw err;
    }
  }

  let created: { id: string };
  try {
    created = await attemptCreate();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        ok: false,
        error: "That checklist number was just taken — please try again.",
      };
    }
    throw err;
  }

  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "checklist_instance",
      entityId: created.id,
      action: "create_manual",
      after: { title, templateId, propertyId } as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/");
  revalidatePath("/review");
  return { ok: true, id: created.id, message: `Created "${title}".` };
}
