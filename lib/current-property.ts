import { cookies } from "next/headers";
import { CURRENT_PROPERTY_COOKIE } from "@/lib/cookies";

// The header property picker (ADR-013) stores the active property's primary-key
// id in a cookie. Portfolio roles (CORPORATE/ADMIN) default to no selection
// (whole portfolio); single-property users never see the picker.

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
