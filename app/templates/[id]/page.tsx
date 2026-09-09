import { notFound, redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireManager, accessiblePropertyIds, accessibleProperties } from "@/lib/rbac";
import { canManageTemplate } from "@/lib/template-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplateBuilder } from "../TemplateBuilder";

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireManager();
  const accessible = await accessiblePropertyIds(user);
  const properties = await accessibleProperties(user);

  const t = await db.checklistTemplate.findUnique({
    where: { id },
    select: {
      id: true, name: true, defaultRole: true, scope: true, copies: true, reviewLevel: true, allProperties: true,
      version: true,
      properties: { select: { propertyId: true } },
    },
  });
  if (!t) notFound();

  // ADR-036: edit the CURRENT version. `id` and `hint` are loaded so the
  // builder can echo them back — that is what carries hint/options/conditional
  // onto the next version instead of dropping them.
  const questions = await db.question.findMany({
    where: { templateId: t.id, version: t.version },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true, type: true, prompt: true, hint: true, required: true,
      photoMax: true, failFlagsIssue: true,
    },
  });

  const propertyIds = t.properties.map((p) => p.propertyId);
  if (!canManageTemplate(user.role, accessible, { allProperties: t.allProperties, propertyIds })) {
    redirect("/templates");
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit ${t.name}`} />
      <TemplateBuilder
        canUseAllProperties={user.role === Role.ADMIN}
        properties={properties}
        initial={{
          id: t.id, name: t.name, defaultRole: t.defaultRole, scope: t.scope, copies: t.copies, reviewLevel: t.reviewLevel,
          allProperties: t.allProperties, propertyIds,
          questions: questions.map((q) => ({
            id: q.id, type: q.type, prompt: q.prompt, hint: q.hint,
            required: q.required, photoMax: q.photoMax, failFlagsIssue: q.failFlagsIssue,
          })),
        }}
      />
    </div>
  );
}
