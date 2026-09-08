import { Role } from "@prisma/client";

// Property-scoped template rules (ADR-020). A template applies at a property if
// it is flagged all-properties or explicitly associated. Managers/corporate may
// manage templates fully contained within their accessible properties, and
// (since 2026-09-08) all-properties templates too. AGENT keeps the narrower
// rule: scoped templates only, never all-properties.

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
  // AGENT is manager-level inside Checklist (added 2026-08-12), so it authors
  // under the same scoped rules as MANAGER. Without it the Templates surface —
  // which its nav already shows — would render controls that always fail.
  if (role !== Role.MANAGER && role !== Role.CORPORATE && role !== Role.AGENT) return false;
  // All-properties (standardized) templates: MANAGER and CORPORATE may edit
  // them (Kyle, 2026-09-08). Every one of the 31 live templates is
  // all-properties, so the old blanket block meant the RPMs reviewing the
  // extracted Connecteam question sets could publish a set they could not
  // correct. AGENT is deliberately still refused: night audit was told to
  // review and flag, not to change content.
  if (t.allProperties) return role === Role.MANAGER || role === Role.CORPORATE;
  if (t.propertyIds.length === 0) return false;
  const allowed = new Set(accessiblePropertyIds);
  return t.propertyIds.every((id) => allowed.has(id));
}
