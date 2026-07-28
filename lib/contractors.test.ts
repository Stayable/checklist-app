import { describe, expect, it } from "vitest";
import { Trade } from "@prisma/client";
import { ALL_TRADES, TRADE_LABELS, tradeLabel, tradesLabel } from "./contractors";

describe("contractor trade helpers", () => {
  it("every Trade enum value has a label and appears in ALL_TRADES", () => {
    for (const t of Object.values(Trade)) {
      expect(TRADE_LABELS[t]).toBeTruthy();
      expect(ALL_TRADES).toContain(t);
    }
  });

  it("ALL_TRADES has no duplicates and matches the enum size", () => {
    expect(new Set(ALL_TRADES).size).toBe(ALL_TRADES.length);
    expect(ALL_TRADES.length).toBe(Object.values(Trade).length);
  });

  it("plumbing and electrical lead the picker order (most common emergencies)", () => {
    expect(ALL_TRADES.slice(0, 2)).toEqual([Trade.PLUMBING, Trade.ELECTRICAL]);
  });

  it("tradeLabel returns the human label", () => {
    expect(tradeLabel(Trade.PEST_CONTROL)).toBe("Pest control");
    expect(tradeLabel(Trade.HVAC)).toBe("HVAC");
  });

  it("tradesLabel joins in ALL_TRADES order regardless of input order", () => {
    expect(tradesLabel([Trade.ELECTRICAL, Trade.PLUMBING])).toBe("Plumbing, Electrical");
    expect(tradesLabel([])).toBe("");
  });
});
