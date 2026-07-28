import { Trade } from "@prisma/client";

// Contractor directory helpers (Component II — Contractor Dispatch MVP, ADR-025).
// Pure + display-only; safe to import from server and client components.

// Human labels for each trade. Keyed by the full Trade enum so a new enum value
// without a label is caught by the test (see contractors.test.ts).
export const TRADE_LABELS: Record<Trade, string> = {
  [Trade.PLUMBING]: "Plumbing",
  [Trade.ELECTRICAL]: "Electrical",
  [Trade.HVAC]: "HVAC",
  [Trade.APPLIANCE]: "Appliance",
  [Trade.GENERAL]: "General",
  [Trade.COSMETIC]: "Cosmetic",
  [Trade.LANDSCAPING]: "Landscaping",
  [Trade.PEST_CONTROL]: "Pest control",
  [Trade.ROOFING]: "Roofing",
};

// Emergencies are most often plumbing + electrical (Kyle 2026-07-08); order the
// picker so those surface first, then the rest alphabetically by label.
export const ALL_TRADES: Trade[] = [
  Trade.PLUMBING,
  Trade.ELECTRICAL,
  Trade.HVAC,
  Trade.APPLIANCE,
  Trade.GENERAL,
  Trade.COSMETIC,
  Trade.LANDSCAPING,
  Trade.PEST_CONTROL,
  Trade.ROOFING,
];

export function tradeLabel(t: Trade): string {
  return TRADE_LABELS[t] ?? t;
}

/** Join a contractor's trades into a display string, in ALL_TRADES order. */
export function tradesLabel(trades: Trade[]): string {
  const set = new Set(trades);
  return ALL_TRADES.filter((t) => set.has(t)).map(tradeLabel).join(", ");
}
