import { describe, it, expect } from "vitest";
import { WATCHING, WATCHING_ID, watchingList } from "./watching";
import { isValidSymbol } from "./symbols";

describe("watching list", () => {
  it("every tracked symbol is a valid, normalized instrument symbol", () => {
    for (const w of WATCHING) {
      expect(isValidSymbol(w.symbol), w.symbol).toBe(true);
      expect(w.symbol).toBe(w.symbol.toUpperCase());
      expect(w.label.length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate symbols", () => {
    const seen = new Set(WATCHING.map((w) => w.symbol));
    expect(seen.size).toBe(WATCHING.length);
  });

  it("adapts to a builtin MarketsList keyed by WATCHING_ID", () => {
    const list = watchingList();
    expect(list.id).toBe(WATCHING_ID);
    expect(list.builtin).toBe(true);
    expect(list.symbols).toHaveLength(WATCHING.length);
    expect(list.symbols[0]).toEqual({
      symbol: WATCHING[0].symbol,
      label: WATCHING[0].label,
    });
  });
});
