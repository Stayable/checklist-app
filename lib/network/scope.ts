// Per-property scoping for the NETWORK section (Kyle, 2026-08-13).
//
// Network was portfolio-wide for every role that could reach it: NETWORK_TECH,
// ADMIN and CORPORATE all see everything, and lib/roles.ts said so explicitly.
// Property managers changed that — a PM at Lakeland should see Lakeland's
// outages and tickets, not the estate's.
//
// The model is deliberately the same shape as the checklist section's
// (accessiblePropertyIds + user_properties), NOT a second scoping mechanism.
//
// `null` means UNSCOPED — every property — and is reserved for portfolio roles.
// It is a distinct value from `[]`, which means "scoped to nothing" and must
// return no rows. Collapsing the two is the classic scoping bug: an empty
// membership list silently becoming full access.

/** Property ids a network query may cover. `null` = all properties. */
export type NetworkScope = string[] | null;

/**
 * Prisma `where` fragment for a model with a `propertyId` column.
 *
 * Spread into an existing where object. Returns `{}` when unscoped so callers
 * read the same whether or not scoping applies.
 */
export function scopeWhere(scope: NetworkScope): { propertyId?: { in: string[] } } {
  if (scope === null) return {};
  return { propertyId: { in: scope } };
}

/**
 * True iff a single record's property is inside the scope. For detail pages,
 * which must 404 rather than render another property's ticket or device.
 */
export function isInScope(scope: NetworkScope, propertyId: string): boolean {
  if (scope === null) return true;
  return scope.includes(propertyId);
}

/**
 * Narrow an explicitly requested property filter to what the scope allows.
 *
 * Returns the requested id when permitted, `undefined` when there is no
 * request, and `null` when the request is outside the scope — which the caller
 * must treat as "match nothing", never as "no filter". A `?propertyId=` in the
 * URL is user input like any other.
 */
export function resolveRequestedProperty(
  scope: NetworkScope,
  requested: string | null | undefined,
): string | undefined | null {
  if (!requested) return undefined;
  return isInScope(scope, requested) ? requested : null;
}
