"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { IssuePriority } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

// Admin-editable SLA defaults (ADR-014 follow-up). Placeholder values until
// Christopher confirms; edits apply to NEW issues only (existing slaTargetAt
// values are not recomputed — except via an explicit priority change).

export type SlaResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  hours: z.record(
    z.nativeEnum(IssuePriority),
    z.number().int().min(1, "Hours must be at least 1").max(24 * 90, "Max 90 days"),
  ),
});

export async function saveSlaDefaults(input: unknown): Promise<SlaResult> {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const entries = Object.entries(parsed.data.hours) as [IssuePriority, number][];
  if (entries.length === 0) return { ok: false, error: "Nothing to save." };

  const before = await db.slaDefault.findMany();

  await db.$transaction(async (tx) => {
    for (const [priority, hours] of entries) {
      await tx.slaDefault.upsert({
        where: { priority },
        update: { hours },
        create: { priority, hours },
      });
    }
    await tx.auditLog.create({
      data: {
        actorUserId: admin.id,
        entityType: "sla_defaults",
        // Singleton settings entity — no per-row uuid; use the actor's id so the
        // column stays a valid uuid.
        entityId: admin.id,
        action: "update",
        before: Object.fromEntries(before.map((r) => [r.priority, r.hours])),
        after: Object.fromEntries(entries),
      },
    });
  });

  revalidatePath("/admin/sla");
  return { ok: true };
}
