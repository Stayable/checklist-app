// Guest-WiFi revenue per property, from Stripe (2026-07-29).
//
// Spotipo does not expose revenue at all — probed, and its entire API surface is
// /api/v1/guest/. But each property has its OWN Stripe account, so the key IS
// the property: attribution needs no charge metadata, and a date range is
// genuinely supported (`created[gte]`/`created[lte]`), which Spotipo silently
// ignored.
//
// Balance transactions rather than charges: they carry `net` (after Stripe fees)
// alongside `amount`, which is the number an owner actually cares about. Gross is
// reported too so the fee drag is visible rather than hidden.

const API_BASE = "https://api.stripe.com/v1";
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_LIMIT = 100;
/** Enough pages for a month of a busy site; guards against an unbounded loop. */
const MAX_PAGES = 10;

export type PropertyRevenue = {
  /** Gross, in the account's currency major units (e.g. dollars). */
  gross: number;
  /** Net after Stripe fees. */
  net: number;
  fees: number;
  transactions: number;
  currency: string;
  /** True when MAX_PAGES was hit, so the figure is a floor, not a total. */
  truncated: boolean;
};

export type RevenueResult =
  | { ok: true; revenue: PropertyRevenue }
  | { ok: false; reason: "not_configured" | "unauthorized" | "fetch_failed" };

export function stripeEnvKey(shortCode: string): string {
  return `STRIPE_SECRET_KEY_${shortCode.toUpperCase()}`;
}

export function stripeKeyFor(
  shortCode: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const v = env[stripeEnvKey(shortCode)];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * One property's revenue for a window. Never throws.
 *
 * `from`/`to` are inclusive-ish Unix seconds; omitting `to` means "up to now".
 * Amounts are converted from Stripe's minor units (cents) to major units once,
 * here, so no caller has to remember to divide by 100.
 */
export async function fetchPropertyRevenue(
  shortCode: string,
  from: Date,
  to?: Date,
): Promise<RevenueResult> {
  const key = stripeKeyFor(shortCode);
  if (key === null) return { ok: false, reason: "not_configured" };

  let gross = 0;
  let net = 0;
  let fees = 0;
  let transactions = 0;
  let currency = "usd";
  let startingAfter: string | null = null;
  let truncated = false;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({
        limit: String(PAGE_LIMIT),
        "created[gte]": String(Math.floor(from.getTime() / 1000)),
        // Only settled money movement; payouts/transfers would double-count.
        type: "charge",
      });
      if (to) params.set("created[lte]", String(Math.floor(to.getTime() / 1000)));
      if (startingAfter) params.set("starting_after", startingAfter);

      const res = await fetch(`${API_BASE}/balance_transactions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) return { ok: false, reason: "unauthorized" };
      if (!res.ok) return { ok: false, reason: "fetch_failed" };

      const body: unknown = await res.json();
      if (!isRecord(body) || !Array.isArray(body.data)) return { ok: false, reason: "fetch_failed" };

      for (const raw of body.data) {
        if (!isRecord(raw)) continue;
        gross += typeof raw.amount === "number" ? raw.amount : 0;
        net += typeof raw.net === "number" ? raw.net : 0;
        fees += typeof raw.fee === "number" ? raw.fee : 0;
        if (typeof raw.currency === "string") currency = raw.currency;
        transactions += 1;
        if (typeof raw.id === "string") startingAfter = raw.id;
      }

      if (body.has_more !== true) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  return {
    ok: true,
    revenue: {
      gross: gross / 100,
      net: net / 100,
      fees: fees / 100,
      transactions,
      currency: currency.toUpperCase(),
      truncated,
    },
  };
}
