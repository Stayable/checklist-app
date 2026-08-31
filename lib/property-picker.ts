import type { Role } from "@prisma/client";
// Relative, not "@/lib/roles": vitest resolves no tsconfig path alias, so an
// aliased import here would make this module untestable (lib/nav.ts does the
// same for the same reason).
import { isPortfolioRole } from "./roles";

// Options for the header property picker (W7).
//
// The picker used to list ONLY concrete properties, so a scoped user with two
// properties could pick A or pick B but had no way back to seeing both. The
// "both" state already worked everywhere — an absent cookie makes
// getCurrentPropertyId return null and resolveScopedPropertyIds fall through to
// the full accessible set — it simply had no control. This module adds the
// missing entry and, more importantly, decides what it may CLAIM.
//
// Client-safe: `lib/roles` is the pure-predicate module extracted for exactly
// this reason (no next/headers, no auth), and `Role` is a type-only import that
// is erased at build.

/**
 * <option> value for the all-scope entry.
 *
 * Empty string on purpose. The select renders `value={current ?? ""}`, so the
 * null-cookie state already maps to "" and the entry renders selected with no
 * extra bookkeeping. It is a DOM value only — selecting it DELETES the cookie
 * rather than storing a sentinel, because a sentinel would then have to be
 * excluded by every `allowedIds.includes(value)` check on the server.
 */
export const ALL_PROPERTIES_VALUE = "";

/** Minimal shape the picker needs; matches rbac.PickerProperty structurally. */
export type PickerPropertyLike = {
  id: string;
  shortCode: string;
  name: string;
};

export type PropertyPickerOption = {
  value: string;
  label: string;
};

/**
 * Label for the all-scope entry.
 *
 * The count is the number of properties THIS user can reach, never the size of
 * the portfolio — a two-property manager choosing "all" gets two properties and
 * the label has to say so. Portfolio roles (CORPORATE/ADMIN) reach every active
 * property, so theirs reads "All properties"; everyone else gets "All my
 * properties", which is both shorter and true.
 */
export function allPropertiesLabel(role: Role, accessibleCount: number): string {
  return isPortfolioRole(role)
    ? `All properties (${accessibleCount})`
    : `All my properties (${accessibleCount})`;
}

/**
 * Full option list: the all-scope entry first, then the accessible properties in
 * the order given (rbac.accessibleProperties already sorts by short code).
 */
export function propertyPickerOptions(
  properties: readonly PickerPropertyLike[],
  role: Role,
): PropertyPickerOption[] {
  return [
    {
      value: ALL_PROPERTIES_VALUE,
      label: allPropertiesLabel(role, properties.length),
    },
    ...properties.map((p) => ({
      value: p.id,
      label: `${p.shortCode} — ${p.name}`,
    })),
  ];
}

/**
 * Whether the header picker is worth rendering at all.
 *
 * One property means there is nothing to choose between: the single option and
 * the all-scope entry would resolve to the same rows, so the control would be a
 * no-op dressed as a choice. getCurrentPropertyId pins those users to their one
 * property regardless.
 */
export function shouldShowPropertyPicker(accessibleCount: number): boolean {
  return accessibleCount > 1;
}
