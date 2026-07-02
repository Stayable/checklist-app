import type { Metadata } from "next";
import { requireAdmin } from "@/lib/rbac";

export const metadata: Metadata = {
  title: "Admin — StayCheck",
};

// Admin console shell. English-only (ADR-013). Guards ADMIN at the layout level
// so every /admin/* route is protected in one place.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
