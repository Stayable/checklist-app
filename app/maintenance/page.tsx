import { redirect } from "next/navigation";
import { requireManager } from "@/lib/rbac";

// /maintenance is not a surface of its own — the section's primary surface is
// the schedule. Still guarded before redirecting: an unguarded route is a
// habit that outlives whatever was here before it.
//
// The UnbuiltSection stub this replaced described Track C ticketing, which is
// still archived (ADR-028). What shipped here on 2026-08-11 is contractor
// SCHEDULING (ADR-030); ticketing joins it as a sibling if and when it returns.
export default async function MaintenancePage() {
  await requireManager();
  redirect("/maintenance/schedule");
}
