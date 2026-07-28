import { describe, expect, it } from "vitest";
import { stripeEnvKey, stripeKeyFor } from "./wifi-revenue.server";

describe("stripeEnvKey", () => {
  it("builds the per-property variable name, upper-cased", () => {
    expect(stripeEnvKey("jw")).toBe("STRIPE_SECRET_KEY_JW");
    expect(stripeEnvKey("KW")).toBe("STRIPE_SECRET_KEY_KW");
  });
});

describe("stripeKeyFor", () => {
  it("reads the property's own key", () => {
    expect(stripeKeyFor("JW", { STRIPE_SECRET_KEY_JW: "sk_test_x" })).toBe("sk_test_x");
  });

  it("does NOT fall back to another property's key", () => {
    // Each property has its own Stripe account, so a cross-property fallback
    // would silently attribute one site's revenue to another.
    expect(stripeKeyFor("KW", { STRIPE_SECRET_KEY_JW: "sk_test_x" })).toBeNull();
  });

  it("has no account-wide fallback either", () => {
    expect(stripeKeyFor("KW", { STRIPE_SECRET_KEY: "sk_test_x" })).toBeNull();
  });

  it("treats empty and whitespace-only as unset", () => {
    expect(stripeKeyFor("JW", { STRIPE_SECRET_KEY_JW: "" })).toBeNull();
    expect(stripeKeyFor("JW", { STRIPE_SECRET_KEY_JW: "   " })).toBeNull();
  });

  it("trims a pasted value", () => {
    expect(stripeKeyFor("JW", { STRIPE_SECRET_KEY_JW: " sk_x \n" })).toBe("sk_x");
  });
});
