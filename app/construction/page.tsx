import { requireManager } from "@/lib/rbac";
import { UnbuiltSection } from "@/components/shell/UnbuiltSection";

// Track E placeholder. See app/maintenance/page.tsx for why it is still guarded.
export default async function ConstructionPage() {
  await requireManager();

  return (
    <UnbuiltSection
      title="Construction"
      track="Track E"
      summary="Buildout and renovation project management — progress, schedule and photo-verified draw documentation. Never had a go/no-go decision; archived on 2026-08-03 (ADR-028) and expected back here later."
      planned={[
        "Progress percentage and milestones per project, with punch-list tracking",
        "Project and task scheduling, with blocker and delay alerts",
        "Draw and billing documentation backed by photo-verified progress",
      ]}
    />
  );
}
