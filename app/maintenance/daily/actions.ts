"use server";

import { revalidatePath } from "next/cache";
import { ContractorNoteSource } from "@prisma/client";
import { db } from "@/lib/db";
import { canAccessProperty, isPortfolioRole, requireManager } from "@/lib/rbac";
import { appendDailyNoteSchema } from "@/lib/contractors";

// The written half of the daily dashboard (Kyle's decision 4: the day is BOTH
// an automatic rollup and a written entry). Append-only — there is no update
// or delete action here, and the table carries no column an edit could be
// written into.

export type DailyNoteResult = { ok: true } | { ok: false; error: string };

export async function appendDailyNote(input: unknown): Promise<DailyNoteResult> {
  const user = await requireManager();

  const parsed = appendDailyNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { body, propertyId, forDate } = parsed.data;

  // A null property means the entry is portfolio-wide and renders on every
  // property's view, so only a portfolio role may write one. Uses the shared
  // predicate rather than comparing roles here — a second copy of that rule is
  // how the two drift apart.
  if (propertyId === null) {
    if (!isPortfolioRole(user.role)) {
      return { ok: false, error: "Only corporate or admin users can post a portfolio-wide entry." };
    }
  } else if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "Not authorized for that property." };
  }

  // forDate is a @db.Date column, so it takes a UTC-midnight Date. The schema
  // validates the shape only; an impossible date like 2026-02-31 would reach
  // Prisma as an Invalid Date and throw, surfacing as a 500 rather than a
  // message.
  const forDateValue = new Date(`${forDate}T00:00:00.000Z`);
  if (
    Number.isNaN(forDateValue.getTime()) ||
    forDateValue.toISOString().slice(0, 10) !== forDate
  ) {
    return { ok: false, error: "That is not a real calendar date." };
  }

  await db.$transaction(async (tx) => {
    const note = await tx.contractorDailyNote.create({
      data: {
        propertyId,
        forDate: forDateValue,
        source: ContractorNoteSource.STAFF,
        authorUserId: user.id,
        // Snapshot of the current name so attribution survives the account
        // being deleted (authorUserId is SetNull).
        authorLabel: user.name,
        body,
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: user.id,
        entityType: "ContractorDailyNote",
        entityId: note.id,
        action: "create",
        after: { propertyId, forDate, body },
      },
    });
  });

  revalidatePath("/maintenance/daily");
  return { ok: true };
}
