"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { accessiblePropertyIds, canAccessProperty, isPortfolioRole, requireManager } from "@/lib/rbac";
import type { SessionUser } from "@/lib/rbac";
import { contractorSchema } from "@/lib/contractors";

// Contractor directory actions (Task 4). Contractors are never hard-deleted —
// ContractorJob.contractorId references them, so a delete would either fail
// on the FK or orphan job history. archiveContractor flips `active` in both
// directions (archive AND reactivate) instead.

export type ContractorResult = { ok: true; id?: string } | { ok: false; error: string };

function revalidateContractorSurfaces(): void {
  revalidatePath("/maintenance/contractors");
  // These two don't exist yet (Tasks 5/6), but they will read contractor
  // names once built, so keep them revalidated from day one.
  revalidatePath("/maintenance/schedule");
  revalidatePath("/maintenance/daily");
}

// Every submitted propertyId is checked individually — not just the first —
// so a scoped manager can't hand-craft a request that attaches a contractor
// to a property outside their access.
async function assertPropertiesAccessible(
  user: SessionUser,
  propertyIds: string[],
): Promise<string | null> {
  for (const propertyId of propertyIds) {
    if (!(await canAccessProperty(user, propertyId))) {
      return "Not authorized for one or more selected properties.";
    }
  }
  return null;
}

// Visibility rule mirrors the list query in page.tsx: a scoped manager may
// act on a contractor only if it has at least one property within their
// accessible set. Portfolio roles (CORPORATE/ADMIN) always pass.
async function assertCanActOnContractor(
  user: SessionUser,
  currentPropertyIds: string[],
): Promise<string | null> {
  if (isPortfolioRole(user.role)) return null;
  const accessible = await accessiblePropertyIds(user);
  const accessibleSet = new Set(accessible);
  if (currentPropertyIds.some((id) => accessibleSet.has(id))) return null;
  return "Not authorized for this contractor.";
}

export async function createContractor(input: unknown): Promise<ContractorResult> {
  const user = await requireManager();
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, trades, propertyIds, phone, whatsapp } = parsed.data;

  const denied = await assertPropertiesAccessible(user, propertyIds);
  if (denied) return { ok: false, error: denied };

  const created = await db.$transaction(async (tx) => {
    const contractor = await tx.contractor.create({
      data: {
        name,
        trades,
        phone: phone ?? null,
        whatsapp: whatsapp ?? null,
        properties: { create: propertyIds.map((propertyId) => ({ propertyId })) },
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "Contractor",
        entityId: contractor.id,
        action: "create",
        after: { name, trades, propertyIds, phone: phone ?? null, whatsapp: whatsapp ?? null },
      },
    });
    return contractor;
  });

  revalidateContractorSurfaces();
  return { ok: true, id: created.id };
}

export async function updateContractor(id: string, input: unknown): Promise<ContractorResult> {
  const user = await requireManager();
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, trades, propertyIds, phone, whatsapp } = parsed.data;

  const current = await db.contractor.findUnique({
    where: { id },
    select: {
      name: true,
      trades: true,
      phone: true,
      whatsapp: true,
      properties: { select: { propertyId: true } },
    },
  });
  if (!current) return { ok: false, error: "Contractor not found." };
  const currentPropertyIds = current.properties.map((p) => p.propertyId);

  const notVisible = await assertCanActOnContractor(user, currentPropertyIds);
  if (notVisible) return { ok: false, error: notVisible };

  const denied = await assertPropertiesAccessible(user, propertyIds);
  if (denied) return { ok: false, error: denied };

  // A scoped manager's property multi-select can only ever list properties
  // they can access, so a naive "replace all associations" would silently
  // strip a contractor's ties to properties this manager doesn't manage.
  // Only touch associations within the actor's own accessible scope; leave
  // anything outside it untouched.
  const accessible = await accessiblePropertyIds(user);

  await db.$transaction(async (tx) => {
    await tx.contractor.update({
      where: { id },
      data: { name, trades, phone: phone ?? null, whatsapp: whatsapp ?? null },
    });
    await tx.contractorProperty.deleteMany({
      where: { contractorId: id, propertyId: { in: accessible } },
    });
    if (propertyIds.length > 0) {
      await tx.contractorProperty.createMany({
        data: propertyIds.map((propertyId) => ({ contractorId: id, propertyId })),
        skipDuplicates: true,
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "Contractor",
        entityId: id,
        action: "update",
        before: {
          name: current.name,
          trades: current.trades,
          propertyIds: currentPropertyIds,
          phone: current.phone,
          whatsapp: current.whatsapp,
        },
        after: { name, trades, propertyIds, phone: phone ?? null, whatsapp: whatsapp ?? null },
      },
    });
  });

  revalidateContractorSurfaces();
  return { ok: true, id };
}

export async function archiveContractor(id: string, active: boolean): Promise<ContractorResult> {
  const user = await requireManager();

  const current = await db.contractor.findUnique({
    where: { id },
    select: { active: true, properties: { select: { propertyId: true } } },
  });
  if (!current) return { ok: false, error: "Contractor not found." };

  const notVisible = await assertCanActOnContractor(
    user,
    current.properties.map((p) => p.propertyId),
  );
  if (notVisible) return { ok: false, error: notVisible };

  if (current.active === active) return { ok: true, id };

  await db.$transaction(async (tx) => {
    await tx.contractor.update({ where: { id }, data: { active } });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "Contractor",
        entityId: id,
        action: active ? "reactivate" : "archive",
        before: { active: current.active },
        after: { active },
      },
    });
  });

  revalidateContractorSurfaces();
  return { ok: true, id };
}
