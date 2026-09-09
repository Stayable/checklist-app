"use server";

import { revalidatePath } from "next/cache";
import {
  InstanceMultiplicity,
  Prisma,
  QuestionType,
  Role,
  ReviewLevel,
  TemplateScope,
} from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { subjectKindFor } from "@/lib/manual-create";
import { requireManager, accessiblePropertyIds } from "@/lib/rbac";
import { deriveTemplateCode } from "@/lib/template-code";
import { canManageTemplate } from "@/lib/template-access";
import {
  buildNextVersionRows,
  questionSetChanged,
  type ExistingQuestion,
} from "@/lib/template-version";

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

const questionSchema = z
  .object({
    // ADR-036: the existing Question row this entry came from, echoed back by
    // the builder. It is what carries `hint` / `options` / `conditional` /
    // `photoMin` — none of which the builder can edit — onto the next version,
    // correctly across a reorder. Absent means a genuinely new question.
    id: z.string().uuid().nullable().optional(),
    type: z.nativeEnum(QuestionType),
    prompt: z.string().trim(),
    required: z.boolean().default(true),
    photoMax: z.number().int().min(1).max(10).nullable().optional(),
    failFlagsIssue: z.boolean().default(false),
    hint: z.string().nullable().optional(),
  })
  .superRefine((q, ctx) => {
    if (q.type !== QuestionType.SECTION_DIVIDER && q.prompt.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "Each question needs a prompt",
      });
    }
  });

const templateSchema = z.object({
  name: z.string().trim().min(1, "Title is required"),
  defaultRole: z.nativeEnum(Role),
  scope: z.nativeEnum(TemplateScope),
  // W1 second axis: how many instances one subject yields per day.
  copies: z.nativeEnum(InstanceMultiplicity).default(InstanceMultiplicity.ONE),
  reviewLevel: z.nativeEnum(ReviewLevel).default(ReviewLevel.MANAGER),
  allProperties: z.boolean().default(false),
  propertyIds: z.array(z.string().uuid()).default([]),
  questions: z.array(questionSchema).min(1, "Add at least one question"),
}).superRefine((t, ctx) => {
  // The builder disables the control for this case, but the server is the
  // authority: a per-room checklist that is also per-person or per-task means
  // one instance per room PER person, a cross product nothing in the estate
  // asks for. subjectKindFor refuses it at create time, so refusing it here
  // stops a template being saved in a shape that can never be used.
  const subject = subjectKindFor(t.scope, t.copies);
  if (!subject.ok) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["copies"],
      message: subject.error,
    });
  }
});

async function writeAudit(
  actorUserId: string,
  entityId: string,
  action: string,
  after?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({
    data: { actorUserId, entityType: "template", entityId, action, after: after ?? undefined },
  });
}

// Authorization for the *requested* scope (create/update target state):
// ADMIN unrestricted; MANAGER/CORPORATE may target an all-properties template
// or one fully within their accessible properties; AGENT only the latter.
function assertCanTarget(
  role: Role,
  accessible: string[],
  allProperties: boolean,
  propertyIds: string[],
): string | null {
  if (canManageTemplate(role, accessible, { allProperties, propertyIds })) return null;
  // canManageTemplate already grants ADMIN, and grants MANAGER/CORPORATE the
  // all-properties templates. What is left to refuse is a scoped template
  // reaching outside the caller's properties, or an AGENT on an
  // all-properties one.
  return "You can only manage templates scoped to your own properties.";
}

export async function createTemplate(input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, defaultRole, scope, copies, reviewLevel, allProperties, propertyIds, questions } =
    parsed.data;

  if (!allProperties && propertyIds.length === 0) {
    return { ok: false, error: "Choose at least one property, or mark it All properties." };
  }
  const accessible = await accessiblePropertyIds(user);
  const denied = assertCanTarget(user.role, accessible, allProperties, propertyIds);
  if (denied) return { ok: false, error: denied };

  const existing = await db.checklistTemplate.findMany({ select: { code: true } });
  const code = deriveTemplateCode(name, existing.map((t) => t.code));

  const created = await db.$transaction(async (tx) => {
    const t = await tx.checklistTemplate.create({
      data: {
        code,
        name,
        defaultRole,
        scope,
        copies,
        reviewLevel,
        allProperties,
        properties: allProperties
          ? undefined
          : { create: propertyIds.map((propertyId) => ({ propertyId })) },
        questions: {
          // A new template starts at version 1 (the column default), matching
          // `checklist_templates.version`.
          create: questions.map((q, i) => ({
            orderIndex: i,
            type: q.type,
            prompt: q.prompt,
            hint: q.hint || null,
            required: q.required,
            photoMax: q.type === QuestionType.PHOTO ? q.photoMax ?? 1 : null,
            failFlagsIssue: q.type === QuestionType.PASSFAIL ? q.failFlagsIssue : false,
          })),
        },
      },
      select: { id: true },
    });
    return t;
  });

  await writeAudit(user.id, created.id, "create", { name, code });
  revalidatePath("/templates");
  return { ok: true, id: created.id, message: `Created "${name}".` };
}

export async function updateTemplate(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireManager();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, defaultRole, scope, copies, reviewLevel, allProperties, propertyIds, questions } =
    parsed.data;
  if (!allProperties && propertyIds.length === 0) {
    return { ok: false, error: "Choose at least one property, or mark it All properties." };
  }

  const current = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      version: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
    },
  });
  if (!current) return { ok: false, error: "Template not found." };

  // ADR-036: compare against the CURRENT version's questions only. Prior
  // versions are history and are never read here.
  const currentQuestions: ExistingQuestion[] = await db.question.findMany({
    where: { templateId: id, version: current.version },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      orderIndex: true,
      type: true,
      prompt: true,
      hint: true,
      required: true,
      options: true,
      photoMin: true,
      photoMax: true,
      failFlagsIssue: true,
      conditional: true,
    },
  });

  const accessible = await accessiblePropertyIds(user);
  // Must be allowed to manage BOTH the current state and the requested state.
  const deniedCurrent = assertCanTarget(
    user.role,
    accessible,
    current.allProperties,
    current.properties.map((p) => p.propertyId),
  );
  const deniedNext = assertCanTarget(user.role, accessible, allProperties, propertyIds);
  if (deniedCurrent || deniedNext) {
    return { ok: false, error: deniedCurrent ?? deniedNext! };
  }

  // ADR-036. There is no longer an "already has checklists" guard: an edit
  // never deletes a question row, so `responses_question_id_fkey ON DELETE
  // RESTRICT` cannot fire and no existing checklist is disturbed. The old
  // guard existed only because DELETE + INSERT would have thrown, and it
  // permanently froze every template the moment it was used once.
  const changed = questionSetChanged(currentQuestions, questions);
  const nextVersion = changed ? current.version + 1 : current.version;

  await db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({
      where: { id },
      data: {
        name,
        defaultRole,
        scope,
        copies,
        reviewLevel,
        allProperties,
        // Bumped only when the question set actually moved. Instances created
        // from here on stamp this number; ones created before keep theirs.
        version: nextVersion,
        // NOTE: filling a template does NOT publish it. An earlier version
        // flipped `active` on the 0-questions -> some-questions transition, to
        // stop a half-authored draft looking retired. `publishedAt` now carries
        // that distinction instead, because Kyle's flow is that a Property
        // Manager reviews the finished question set and publishes it. Editing
        // must never publish on their behalf.
      },
    });
    // Replace property associations.
    await tx.templateProperty.deleteMany({ where: { templateId: id } });
    if (!allProperties && propertyIds.length > 0) {
      await tx.templateProperty.createMany({
        data: propertyIds.map((propertyId) => ({ templateId: id, propertyId })),
      });
    }
    // APPEND the new version. Nothing is deleted — prior versions stay so the
    // checklists filled against them keep resolving, and `hint` / `options` /
    // `conditional` / `photoMin` ride along from the row each entry's `id`
    // points at rather than being dropped (which is what silently erased 105
    // checkpoint labels before ADR-036).
    if (changed) {
      await tx.question.createMany({
        data: buildNextVersionRows(currentQuestions, questions, nextVersion).map((r) => ({
          templateId: id,
          version: r.version,
          orderIndex: r.orderIndex,
          type: r.type,
          prompt: r.prompt,
          hint: r.hint,
          required: r.required,
          options: (r.options ?? undefined) as Prisma.InputJsonValue | undefined,
          photoMin: r.photoMin,
          photoMax: r.photoMax,
          failFlagsIssue: r.failFlagsIssue,
          conditional: (r.conditional ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      });
    }
  });

  await writeAudit(user.id, id, "update", {
    name,
    allProperties,
    propertyIds,
    scope,
    // Which version this save produced, so the audit trail explains why an old
    // checklist still shows different questions.
    version: nextVersion,
    questionsChanged: changed,
  });
  revalidatePath("/templates");
  revalidatePath(`/templates/${id}`);
  return { ok: true, id, message: `Saved "${name}".` };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const user = await requireManager();
  const t = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      name: true,
      allProperties: true,
      properties: { select: { propertyId: true } },
      _count: { select: { instances: true } },
    },
  });
  if (!t) return { ok: false, error: "Template not found." };

  const accessible = await accessiblePropertyIds(user);
  const denied = assertCanTarget(
    user.role,
    accessible,
    t.allProperties,
    t.properties.map((p) => p.propertyId),
  );
  if (denied) return { ok: false, error: denied };

  if (t._count.instances > 0) {
    return {
      ok: false,
      error: `Can't delete — ${t._count.instances} checklist(s) use this template. Deactivate it instead.`,
    };
  }

  await db.$transaction(async (tx) => {
    await tx.templateProperty.deleteMany({ where: { templateId: id } });
    await tx.question.deleteMany({ where: { templateId: id } });
    await tx.checklistTemplate.delete({ where: { id } });
  });

  await writeAudit(user.id, id, "delete", { name: t.name });
  revalidatePath("/templates");
  return { ok: true, message: `Deleted "${t.name}".` };
}

/**
 * Publish a template, or take it out of service.
 *
 * Separate from the edit actions on purpose. Authoring a question set and
 * deciding it is fit for field staff are different acts by different people:
 * the content is written (or extracted from the Connecteam archive) and a
 * Property Manager reviews it and publishes it themselves.
 *
 * So this is manager-or-above, while editing stays ADMIN-only. A manager can
 * put a template into service or pull it out; they cannot rewrite its questions.
 */
export async function setTemplatePublished(
  id: string,
  published: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireManager();

  const t = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      active: true,
      publishedAt: true,
      _count: { select: { questions: true } },
    },
  });
  if (!t) return { ok: false, error: "Template not found." };

  if (published && t._count.questions === 0) {
    return {
      ok: false,
      error:
        "This template has no questions yet. Field staff would be able to open it and not fill it.",
    };
  }
  if (published === t.active) {
    return {
      ok: false,
      error: published ? "Already published." : "Already unpublished.",
    };
  }

  await db.checklistTemplate.update({
    where: { id },
    data: {
      active: published,
      // Stamped once, on first publish, and never cleared. Clearing it on
      // unpublish would turn a retired template back into a draft and offer it
      // for review a second time.
      ...(published && t.publishedAt == null ? { publishedAt: new Date() } : {}),
    },
  });

  await writeAudit(user.id, id, published ? "publish" : "unpublish", {
    questions: t._count.questions,
    firstPublish: t.publishedAt == null,
  });

  revalidatePath("/templates");
  return { ok: true };
}
