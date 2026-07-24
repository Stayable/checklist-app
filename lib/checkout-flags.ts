// S1 (StayCheck v1.1) — structured checkout flags (Q2/Q3).
//
// Captured by field staff at fill time when the template has
// `collectsCheckoutFlags`, then confirmed/edited by the manager at review and
// locked at Verify. Stored as dedicated columns on ChecklistInstance (Q3), not
// as question answers. `placeOOO` is stored now; room-lifecycle wiring is S2.

export type CheckoutFlags = {
  notifyCorporate: boolean;
  returnDeposit: boolean;
  itemsToReplace: boolean;
  itemsToReplaceList: string;
  placeOOO: boolean;
};

export const EMPTY_CHECKOUT_FLAGS: CheckoutFlags = {
  notifyCorporate: false,
  returnDeposit: false,
  itemsToReplace: false,
  itemsToReplaceList: "",
  placeOOO: false,
};

/**
 * Canonicalize before persist: the items-to-replace list is only meaningful
 * when `itemsToReplace` is set — clear it otherwise so a stale list can't linger
 * behind an unchecked box. Trims the list.
 */
export function normalizeCheckoutFlags(flags: CheckoutFlags): CheckoutFlags {
  const itemsToReplace = flags.itemsToReplace;
  return {
    notifyCorporate: flags.notifyCorporate,
    returnDeposit: flags.returnDeposit,
    itemsToReplace,
    itemsToReplaceList: itemsToReplace ? flags.itemsToReplaceList.trim() : "",
    placeOOO: flags.placeOOO,
  };
}

/** Any flag raised — for compact "has flags" indicators in lists. */
export function hasAnyCheckoutFlag(flags: {
  notifyCorporate: boolean;
  returnDeposit: boolean;
  itemsToReplace: boolean;
  placeOOO: boolean;
}): boolean {
  return (
    flags.notifyCorporate || flags.returnDeposit || flags.itemsToReplace || flags.placeOOO
  );
}
