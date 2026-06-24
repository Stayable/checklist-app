// Client-safe cookie name constants. Kept free of server-only imports
// (next/headers) so client components can import the names without pulling
// server modules into the browser bundle.

export const CURRENT_PROPERTY_COOKIE = "CURRENT_PROPERTY";
export const TRUSTED_DEVICE_COOKIE = "TRUSTED_DEVICE";
