import type { Metadata } from "next";
import { requireUserAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Admin — StayCheck",
};

// Admin console shell. English-only (ADR-013).
//
// ⚠ The layout guard was WIDENED from ADMIN to ADMIN+CORPORATE on 2026-09-11 so
// corporate staff can reach Admin -> Users. It is therefore no longer the only
// guard /admin/* has, and must not be treated as one: it now answers "may you
// be inside the console at all". Properties, its geofence editor and SLA are
// still ADMIN-only and each calls requireAdmin() for itself — sla/page.tsx got
// its own call in this change, having relied entirely on this line.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireUserAdmin();
  return <>{children}</>;
}
