import { requireManager } from "@/lib/rbac";
import { UnbuiltSection } from "@/components/shell/UnbuiltSection";

// Track C placeholder. Guarded like any other manager surface even though it
// holds no data — an unguarded route is a habit that outlives the stub.
export default async function MaintenancePage() {
  await requireManager();

  return (
    <UnbuiltSection
      title="Maintenance"
      track="Track C"
      summary="Tenant and staff maintenance requests, triaged into work orders and tracked to close. Replaces the Smartsheet maintenance tracker. Archived as build work on 2026-08-03 (ADR-028) and expected back here later."
      planned={[
        "Unified ticket model with a full lifecycle, and ticket-vs-concern separation",
        "Tenant intake from TurboTenant and Jotform",
        "Email desk on the shared inboxes, with AI extraction and a human review queue before any ticket is created",
        "Recurrence flagging — the same room and fault twice inside 60 days",
        "Cost-per-repair capture and maintenance reporting",
      ]}
    />
  );
}
