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

export type ActionResult =
  | { ok: true; id?: string; message?: string }
  | { ok: false; error: string };

const questionSchema = z
  .object({
    type: z.nativeEnum(QuestionType),
    prompt: z.string().trim(),
    required: z.boolean().default(true),
    photoMax: z.number().int().min(1).max(10).nullable().optional(),
    failFlagsIssue: z.boolean().default(false),
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
// ADMIN unrestricted; MANAGER/CORPORATE may only target a non-all-properties
// template fully within their accessible properties.
function assertCanTarget(
  role: Role,
  accessible: string[],
  allProperties: boolean,
  propertyIds: string[],
): string | null {
  if (canManageTemplate(role, accessible, { allProperties, propertyIds })) return null;
  // canManageTemplate already grants ADMIN; this error is for scoped managers/corporate.
  return "Managers can only manage templates scoped to their own properties (not All-properties).";
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
          create: questions.map((q, i) => ({
            orderIndex: i,
            type: q.type,
            prompt: q.prompt,
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
      allProperties: true,
      properties: { select: { propertyId: true } },
      _count: { select: { instances: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: { type: true, prompt: true, required: true, photoMax: true, failFlagsIssue: true },
      },
    },
  });
  if (!current) return { ok: false, error: "Template not found." };

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

  // Normalize a question to a comparable signature (apples-to-apples with createMany logic).
  type QSig = { type: QuestionType; prompt: string; required: boolean; photoMax: number | null; failFlagsIssue: boolean };
  function normalizeQ(q: { type: QuestionType; prompt: string; required: boolean; photoMax?: number | null; failFlagsIssue?: boolean | null }): QSig {
    return {
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      photoMax: q.type === QuestionType.PHOTO ? (q.photoMax ?? 1) : null,
      failFlagsIssue: q.type === QuestionType.PASSFAIL ? (q.failFlagsIssue ?? false) : false,
    };
  }

  const existingNorm = current.questions.map(normalizeQ);
  const incomingNorm = questions.map((q) => normalizeQ({ ...q, photoMax: q.photoMax ?? null, failFlagsIssue: q.failFlagsIssue }));
  const questionsChanged =
    existingNorm.length !== incomingNorm.length ||
    existingNorm.some((eq, i) => {
      const iq = incomingNorm[i]!;
      return (
        eq.type !== iq.type ||
        eq.prompt !== iq.prompt ||
        eq.required !== iq.required ||
        eq.photoMax !== iq.photoMax ||
        eq.failFlagsIssue !== iq.failFlagsIssue
      );
    });

  if (current._count.instances > 0 && questionsChanged) {
    return {
      ok: false,
      error:
        "This template already has checklists created from it — questions can't be changed. Duplicate the template instead.",
    };
  }

  await db.$transaction(async (tx) => {
    await tx.checklistTemplate.update({
      where: { id },
      data: { name, defaultRole, scope, copies, reviewLevel, allProperties },
    });
    // Replace property associations.
    await tx.templateProperty.deleteMany({ where: { templateId: id } });
    if (!allProperties && propertyIds.length > 0) {
      await tx.templateProperty.createMany({
        data: propertyIds.map((propertyId) => ({ templateId: id, propertyId })),
      });
    }
    // Replace questions only when the template has no instances yet.
    // If instances exist, questionsChanged is false (guarded above), so skip.
    if (current._count.instances === 0) {
      await tx.question.deleteMany({ where: { templateId: id } });
      await tx.question.createMany({
        data: questions.map((q, i) => ({
          templateId: id,
          orderIndex: i,
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          photoMax: q.type === QuestionType.PHOTO ? q.photoMax ?? 1 : null,
          failFlagsIssue: q.type === QuestionType.PASSFAIL ? q.failFlagsIssue : false,
        })),
      });
    }
  });

  await writeAudit(user.id, id, "update", { name, allProperties, propertyIds, scope });
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
