import { Role } from "@prisma/client";

// Property-scoped template rules (ADR-020). A template applies at a property if
// it is flagged all-properties or explicitly associated. Managers/corporate may
// only manage templates fully contained within their accessible properties and
// never all-properties (standardized) templates — those are ADMIN-governed.

export type TemplateScopeRef = { allProperties: boolean; propertyIds: string[] };

export function templateAppliesToProperty(
  t: TemplateScopeRef,
  propertyId: string,
): boolean {
  return t.allProperties || t.propertyIds.includes(propertyId);
}

export function canManageTemplate(
  role: Role,
  accessiblePropertyIds: string[],
  t: TemplateScopeRef,
): boolean {
  if (role === Role.ADMIN) return true;
  if (role !== Role.MANAGER && role !== Role.CORPORATE) return false;
  if (t.allProperties) return false;
  if (t.propertyIds.length === 0) return false;
  const allowed = new Set(accessiblePropertyIds);
  return t.propertyIds.every((id) => allowed.has(id));
}
