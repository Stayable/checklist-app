// Resolves which property ids a scoped list query should cover. The active
// property (from the header picker cookie) narrows the view; an absent or
// inaccessible selection falls back to the user's full accessible set.
// Pairs with rbac.accessiblePropertyIds + current-property.getCurrentPropertyId.
export function resolveScopedPropertyIds(
  accessibleIds: string[],
  activeId: string | null,
): string[] {
  if (activeId && accessibleIds.includes(activeId)) return [activeId];
  return accessibleIds;
}
