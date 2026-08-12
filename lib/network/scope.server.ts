import type { Role } from "@prisma/client";
import { accessiblePropertyIds } from "@/lib/rbac";
import { isPortfolioRole } from "@/lib/roles";
import type { NetworkScope } from "./scope";

/**
 * Resolve the network property scope for a user.
 *
 * Portfolio roles (CORPORATE, ADMIN) and NETWORK_TECH get `null` — the whole
 * estate. NETWORK_TECH is deliberately unscoped: it is the IT/MSP role and its
 * whole job is the fleet, and it carries no `user_properties` rows at all, so
 * scoping it would show it nothing.
 *
 * Everyone else (today: MANAGER) is scoped to their `user_properties`. A user
 * with no memberships gets `[]`, which matches no rows — the correct and safe
 * reading of "manages no properties".
 */
export async function networkScopeFor(user: { id: string; role: Role }): Promise<NetworkScope> {
  if (isPortfolioRole(user.role) || user.role === "NETWORK_TECH") return null;
  return accessiblePropertyIds(user);
}
