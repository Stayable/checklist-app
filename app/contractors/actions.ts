"use server";

import { revalidatePath } from "next/cache";
import { Locale, Prisma, Trade } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireManager, accessiblePropertyIds, isPortfolioRole } from "@/lib/rbac";

// Contractor directory server actions (Component II — Contractor Dispatch MVP,
// ADR-025). Manager-or-above. Every mutation writes an audit_log entry. Scoped
// managers may only manage contractors whose coverage sits within their own
// accessible properties; portfolio roles (CORPORATE/ADMIN) are unrestricted.

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const contractorBase = z.object({
  name: z.string().trim().min(1, "Name is required"),
  company: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()).optional(),
  trades: z.array(z.nativeEnum(Trade)).min(1, "Pick at least one trade"),
  whatsapp: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()).optional(),
  phone: z.preprocess(emptyToNull, z.string().trim().max(40).nullable()).optional(),
  language: z.nativeEnum(Locale).default(Locale.es),
  contracted: z.boolean().default(false),
  onCall: z.boolean().default(true),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()).optional(),
  propertyIds: z.array(z.string().uuid()).min(1, "Assign at least one property"),
});

// Dispatch needs a channel — WhatsApp is the rail; phone is the emergency
// first-touch. Require at least one so a directory entry is dispatchable.
const requireChannel = (
  c: { whatsapp?: string | null; phone?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (!c.whatsapp && !c.phone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["whatsapp"],
      message: "Add a WhatsApp number or phone (at least one is needed to dispatch).",
    });
  }
};

const contractorSchema = contractorBase.superRefine(requireChannel);

async function writeAudit(
  actorUserId: string,
  entityId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorUserId, entityType: "contractor", entityId, action, after: after ?? undefined },
  });
}

/** Non-portfolio managers may only touch properties in their accessible set. */
function outOfScope(accessible: string[], propertyIds: string[]): boolean {
  const set = new Set(accessible);
  return propertyIds.some((id) => !set.has(id));
}

export async function createContractor(input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = contractorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  if (!isPortfolioRole(user.role)) {
    const accessible = await accessiblePropertyIds(user);
    if (outOfScope(accessible, d.propertyIds)) {
      return { ok: false, error: "You can only assign properties you manage." };
    }
  }

  const contractor = await db.contractor.create({
    data: {
      name: d.name,
      company: d.company ?? null,
      trades: d.trades,
      whatsapp: d.whatsapp ?? null,
      phone: d.phone ?? null,
      language: d.language,
      contracted: d.contracted,
      onCall: d.onCall,
      notes: d.notes ?? null,
      properties: { create: d.propertyIds.map((propertyId) => ({ propertyId })) },
    },
    select: { id: true },
  });

  await writeAudit(user.id, contractor.id, "create", { name: d.name, trades: d.trades });
  revalidatePath("/contractors");
  return { ok: true, id: contractor.id, message: `Added ${d.name}.` };
}

const updateSchema = contractorBase
  .extend({ id: z.string().uuid() })
  .superRefine(requireChannel);

export async function updateContractor(input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, propertyIds, ...d } = parsed.data;

  const existing = await db.contractor.findUnique({
    where: { id },
    select: { id: true, properties: { select: { propertyId: true } } },
  });
  if (!existing) return { ok: false, error: "Contractor not found." };

  if (!isPortfolioRole(user.role)) {
    const accessible = await accessiblePropertyIds(user);
    const currentIds = existing.properties.map((p) => p.propertyId);
    // Must have access to the contractor today (overlap) AND only assign own
    // properties in the new coverage set.
    const overlaps = currentIds.some((pid) => accessible.includes(pid));
    if (!overlaps) return { ok: false, error: "This contractor isn't in your properties." };
    if (outOfScope(accessible, propertyIds)) {
      return { ok: false, error: "You can only assign properties you manage." };
    }
  }

  await db.$transaction([
    db.contractor.update({
      where: { id },
      data: {
        name: d.name,
        company: d.company ?? null,
        trades: d.trades,
        whatsapp: d.whatsapp ?? null,
        phone: d.phone ?? null,
        language: d.language,
        contracted: d.contracted,
        onCall: d.onCall,
        notes: d.notes ?? null,
      },
    }),
    db.contractorProperty.deleteMany({ where: { contractorId: id } }),
    db.contractorProperty.createMany({
      data: propertyIds.map((propertyId) => ({ contractorId: id, propertyId })),
    }),
  ]);

  await writeAudit(user.id, id, "update", { name: d.name, trades: d.trades });
  revalidatePath("/contractors");
  return { ok: true, id, message: `Updated ${d.name}.` };
}

export async function setContractorActive(id: string, active: boolean): Promise<ActionResult> {
  const user = await requireManager();
  const existing = await db.contractor.findUnique({
    where: { id },
    select: { name: true, properties: { select: { propertyId: true } } },
  });
  if (!existing) return { ok: false, error: "Contractor not found." };

  if (!isPortfolioRole(user.role)) {
    const accessible = await accessiblePropertyIds(user);
    const overlaps = existing.properties.some((p) => accessible.includes(p.propertyId));
    if (!overlaps) return { ok: false, error: "This contractor isn't in your properties." };
  }

  await db.contractor.update({ where: { id }, data: { active } });
  await writeAudit(user.id, id, active ? "reactivate" : "deactivate");
  revalidatePath("/contractors");
  return { ok: true, message: active ? `${existing.name} reactivated.` : `${existing.name} archived.` };
}
