"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { canAccessProperty, requireManager } from "@/lib/rbac";
import {
  draftBatchesSchema,
  draftDisplayName,
  parseDraftBatches,
  type DraftBatches,
} from "@/lib/batch-draft";

// W4 / D9 — Save as Draft for the batch-create wizard.
//
// THE ONE INVARIANT: nothing in this file writes a ChecklistInstance. A draft is
// the definition of work, not work. Nothing appears in anyone's queue, nothing
// counts in any report denominator, nothing is assigned to anybody, until the
// user presses Create and app/checklists/new/actions.ts runs. That is the whole
// of D9, and it is why no InstanceStatus member was added (a new member is
// silently EXCLUDED by `status: { in: [...] }` and silently INCLUDED by `notIn`,
// so /review's tabs, both report denominators, the dashboard tiles and the field
// home list would all change meaning with a clean typecheck).
//
// THE OTHER INVARIANT: a draft is PRIVATE TO ITS AUTHOR. Every read, write and
// delete is keyed on (id, createdByUserId) — never on id alone — so a manager
// cannot reach a colleague's draft by guessing a uuid. There is no shared-draft
// feature and no "manager can see their property's drafts" rule; a half-composed
// thought is not a record anyone else is entitled to.

export type DraftActionResult =
  | { ok: true; id: string; message?: string }
  | { ok: false; error: string };

export type DraftSummary = {
  id: string;
  /** Author's label if set, otherwise derived. Never empty. */
  name: string;
  batchCount: number;
  updatedAt: Date;
  /** False when the stored Json no longer matches today's BatchInput shape. */
  usable: boolean;
};

export type LoadDraftResult =
  | { ok: true; id: string; name: string | null; propertyId: string; batches: DraftBatches }
  | { ok: false; error: string };

const saveSchema = z.object({
  /** Present = update that draft. Absent = create one. */
  id: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional(),
  propertyId: z.string().uuid(),
  batches: draftBatchesSchema,
});

const idSchema = z.string().uuid();

/**
 * Create or update one draft.
 *
 * NOT `db.upsert`. Upsert on the primary key would CREATE a row at an id the
 * caller supplied when no row matched — which is precisely how someone else's
 * deleted draft id, or a made-up one, becomes a row this user owns. Update is
 * scoped with `updateMany` on (id, createdByUserId) so a mismatch affects zero
 * rows and is reported, rather than silently overwriting.
 */
export async function saveBatchDraft(input: unknown): Promise<DraftActionResult> {
  const user = await requireManager();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, name, propertyId, batches } = parsed.data;

  // A draft must not become a way to name a property the user cannot reach:
  // the row would then hand back template and room ids from outside their scope
  // the moment it is loaded.
  if (!(await canAccessProperty(user, propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const data = {
    name: name && name.length > 0 ? name : null,
    propertyId,
    batches: batches as unknown as Prisma.InputJsonValue,
  };

  if (id) {
    const updated = await db.checklistBatchDraft.updateMany({
      where: { id, createdByUserId: user.id },
      data,
    });
    if (updated.count === 0) {
      // Deliberately the same message for "no such draft" and "not yours" —
      // distinguishing them confirms a stranger's uuid exists.
      return { ok: false, error: "That draft no longer exists." };
    }
    return { ok: true, id, message: "Draft saved." };
  }

  const created = await db.checklistBatchDraft.create({
    data: { ...data, createdByUserId: user.id },
    select: { id: true },
  });

  // Audited on create and delete, not on every keystroke-driven save: an audit
  // row per autosave would bury the log for something that creates no work.
  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "checklist_batch_draft",
      entityId: created.id,
      action: "create",
      after: {
        propertyId,
        batchCount: batches.length,
        name: data.name,
      } as Prisma.InputJsonValue,
    },
  });

  return { ok: true, id: created.id, message: "Draft saved." };
}

/**
 * This user's drafts at one property, newest first.
 *
 * Scoped by author AND property. A row whose Json no longer parses is listed
 * with `usable: false` rather than hidden or thrown on — the user should see
 * that a draft has gone stale and be able to delete it, not watch it vanish.
 */
export async function listBatchDrafts(
  propertyId: unknown,
): Promise<{ ok: true; drafts: DraftSummary[] } | { ok: false; error: string }> {
  const user = await requireManager();
  const parsedId = idSchema.safeParse(propertyId);
  if (!parsedId.success) return { ok: false, error: "Invalid property." };

  if (!(await canAccessProperty(user, parsedId.data))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const rows = await db.checklistBatchDraft.findMany({
    where: { createdByUserId: user.id, propertyId: parsedId.data },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, batches: true, updatedAt: true },
  });

  const drafts = rows.map((row): DraftSummary => {
    const parsed = parseDraftBatches(row.batches);
    if (!parsed.ok) {
      return {
        id: row.id,
        name: row.name?.trim() || "Draft (outdated format)",
        batchCount: 0,
        updatedAt: row.updatedAt,
        usable: false,
      };
    }
    return {
      id: row.id,
      name: draftDisplayName(row.name, parsed.batches),
      batchCount: parsed.batches.length,
      updatedAt: row.updatedAt,
      usable: true,
    };
  });

  return { ok: true, drafts };
}

/**
 * One draft, ready to reopen in the wizard.
 *
 * The Json comes back through the same Zod schema that wrote it. It is not cast
 * — a row written by an older wizard is a real possibility, and the failure mode
 * of a cast is a malformed batch reaching the create path with a clean
 * typecheck. Property access is re-checked because a user's assignments can be
 * revoked after a draft is saved.
 */
export async function loadBatchDraft(id: unknown): Promise<LoadDraftResult> {
  const user = await requireManager();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Invalid draft." };

  const row = await db.checklistBatchDraft.findFirst({
    where: { id: parsedId.data, createdByUserId: user.id },
    select: { id: true, name: true, propertyId: true, batches: true },
  });
  if (!row) return { ok: false, error: "That draft no longer exists." };

  if (!(await canAccessProperty(user, row.propertyId))) {
    return { ok: false, error: "You don't have access to that property." };
  }

  const parsed = parseDraftBatches(row.batches);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `This draft was saved by an older version and can't be reopened (${parsed.error}). Delete it and start again.`,
    };
  }

  return {
    ok: true,
    id: row.id,
    name: row.name,
    propertyId: row.propertyId,
    batches: parsed.batches,
  };
}

/**
 * Delete one draft. Scoped to the author, and a miss is reported rather than
 * treated as success — "deleted" about someone else's row would be a lie.
 */
export async function deleteBatchDraft(id: unknown): Promise<DraftActionResult> {
  const user = await requireManager();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Invalid draft." };

  const deleted = await db.checklistBatchDraft.deleteMany({
    where: { id: parsedId.data, createdByUserId: user.id },
  });
  if (deleted.count === 0) {
    return { ok: false, error: "That draft no longer exists." };
  }

  await db.auditLog.create({
    data: {
      actorUserId: user.id,
      entityType: "checklist_batch_draft",
      entityId: parsedId.data,
      action: "delete",
    },
  });

  return { ok: true, id: parsedId.data, message: "Draft deleted." };
}
