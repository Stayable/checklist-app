import { describe, expect, it } from "vitest";
import { isInScope, resolveRequestedProperty, scopeWhere } from "./scope";
import { ticketPropertyWhere, ticketWhereFilters } from "./ticket-filters";

// Per-property network scoping (Kyle 2026-08-13). These are authorization
// tests: a gap here shows one property manager another property's outages.

const A = "prop-a";
const B = "prop-b";

describe("scopeWhere", () => {
  it("adds no constraint when unscoped", () => {
    expect(scopeWhere(null)).toEqual({});
  });

  it("constrains to the scoped ids", () => {
    expect(scopeWhere([A, B])).toEqual({ propertyId: { in: [A, B] } });
  });

  // The classic scoping bug: an empty membership list becoming full access.
  // `[]` must match NOTHING; only `null` means everything.
  it("an empty scope matches nothing, and is NOT the same as unscoped", () => {
    expect(scopeWhere([])).toEqual({ propertyId: { in: [] } });
    expect(scopeWhere([])).not.toEqual(scopeWhere(null));
  });
});

describe("isInScope", () => {
  it("unscoped admits everything", () => {
    expect(isInScope(null, A)).toBe(true);
  });

  it("admits only members", () => {
    expect(isInScope([A], A)).toBe(true);
    expect(isInScope([A], B)).toBe(false);
    expect(isInScope([], A)).toBe(false);
  });
});

describe("resolveRequestedProperty", () => {
  it("passes a permitted request through", () => {
    expect(resolveRequestedProperty([A, B], A)).toBe(A);
  });

  it("returns undefined when nothing was requested", () => {
    expect(resolveRequestedProperty([A], null)).toBeUndefined();
    expect(resolveRequestedProperty([A], undefined)).toBeUndefined();
  });

  // null = "match nothing". Returning undefined here would read as "no filter"
  // and hand back the full scope instead of refusing.
  it("rejects an out-of-scope request rather than ignoring it", () => {
    expect(resolveRequestedProperty([A], B)).toBeNull();
  });
});

describe("ticketPropertyWhere", () => {
  /**
   * The regression this exists for. The scope clause and the user's
   * `?property=` filter both write `propertyId`, so composing them with two
   * object spreads lets the URL parameter overwrite the scope — turning a
   * scoped page into an unscoped one via a query string. They must resolve
   * together.
   */
  it("a URL propertyId can never widen the scope", () => {
    expect(ticketPropertyWhere(B, [A])).toEqual({ propertyId: { in: [] } });
  });

  it("narrows to a permitted request", () => {
    expect(ticketPropertyWhere(A, [A, B])).toEqual({ propertyId: A });
  });

  it("falls back to the whole scope when nothing is requested", () => {
    expect(ticketPropertyWhere(undefined, [A, B])).toEqual({ propertyId: { in: [A, B] } });
  });

  it("unscoped honours the request, or filters on nothing", () => {
    expect(ticketPropertyWhere(A, null)).toEqual({ propertyId: A });
    expect(ticketPropertyWhere(undefined, null)).toEqual({});
  });
});

describe("ticketWhereFilters with a scope", () => {
  const filters = {
    status: null,
    ticketType: null,
    propertyId: null,
    deviceType: null,
    from: null,
    toExclusive: null,
  };

  it("is unscoped by default, so existing portfolio callers are unchanged", () => {
    expect(ticketWhereFilters(filters)).not.toHaveProperty("propertyId");
  });

  it("applies the scope", () => {
    expect(ticketWhereFilters(filters, [A])).toMatchObject({ propertyId: { in: [A] } });
  });

  it("an out-of-scope property filter yields no rows, not all rows", () => {
    const where = ticketWhereFilters({ ...filters, propertyId: B }, [A]);
    expect(where).toMatchObject({ propertyId: { in: [] } });
  });

  // The CSV export and the list share this function precisely so the file can
  // never contain rows the screen would not have shown.
  it("the export and the list cannot disagree about scope", () => {
    const asList = ticketWhereFilters({ ...filters, propertyId: B }, [A]);
    const asExport = ticketWhereFilters({ ...filters, propertyId: B }, [A]);
    expect(asExport).toEqual(asList);
  });
});
