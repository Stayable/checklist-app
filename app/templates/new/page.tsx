import {
  InstanceMultiplicity,
  Role,
  ReviewLevel,
  TemplateScope,
  QuestionType,
} from "@prisma/client";
import { requireManager, accessibleProperties } from "@/lib/rbac";
import { PageHeader } from "@/components/shell/PageHeader";
import { TemplateBuilder } from "../TemplateBuilder";

export default async function NewTemplatePage() {
  const user = await requireManager();
  const properties = await accessibleProperties(user);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New template" subtitle="Define fields and where it applies" />
      <TemplateBuilder
        canUseAllProperties={user.role === Role.ADMIN}
        properties={properties}
        initial={{
          name: "",
          defaultRole: Role.HK,
          scope: TemplateScope.PER_ROOM,
          copies: InstanceMultiplicity.ONE,
          reviewLevel: ReviewLevel.MANAGER,
          allProperties: false,
          propertyIds: [],
          questions: [{ type: QuestionType.SHORT_TEXT, prompt: "", required: true }],
        }}
      />
    </div>
  );
}
