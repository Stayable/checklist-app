import { requireNetworkAccess } from "@/lib/rbac";

// Guards every /network route (dashboard, tickets, properties, devices) in
// one place. Access model (lib/rbac.ts canAccessNetwork) is simpler than the
// checklist RBAC: NETWORK_TECH, ADMIN, and CORPORATE all see the FULL
// portfolio — there is no per-property membership check for network.
// English-only surface (ADR-013), no next-intl here.
export default async function NetworkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireNetworkAccess();
  return <>{children}</>;
}
