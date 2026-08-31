import { cookies } from "next/headers";
import { CURRENT_PROPERTY_COOKIE } from "@/lib/cookies";

// The header property picker (ADR-013) stores the active property's primary-key
// id in a cookie. An ABSENT cookie means "everything this user can reach" — the
// picker's all-scope entry selects that state by deleting the cookie (W7), so
// absent is a deliberate choice here, not merely an unset default.
//
// Single-property users never see the picker; the length-1 pin below is what
// makes their one property the answer either way.

export { CURRENT_PROPERTY_COOKIE };

/** Active property id from the cookie, validated against the allowed set. */
export async function getCurrentPropertyId(
  allowedIds: string[],
): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CURRENT_PROPERTY_COOKIE)?.value;
  if (value && allowedIds.includes(value)) return value;
  // Fall back to the only property a scoped single-property user can see.
  return allowedIds.length === 1 ? allowedIds[0] : null;
}
