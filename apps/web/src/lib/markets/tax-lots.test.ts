import { describe, it, expect } from "vitest";
import type { MktLotRow } from "./db";
import { realizedGains, summarizeRealized } from "./tax-lots";

let seq = 0;
function lot(
  side: "buy" | "sell",
  quantity: number,
  price: number,
  trade_date: string,
  fees = 0,
  symbol = "AAPL",
): MktLotRow {
  return {
    id: `l${seq++}`,
    portfolio_id: "p1",
    symbol,
    side,
    quantity,
    price,
    fees,
    trade_date,
    note: null,
    created_at: trade_date,
  };
}

describe("realizedGains (FIFO)", () => {
  it("matches a simple round trip", () => {
    const g = realizedGains([
      lot("buy", 10, 100, "2026-01-01"),
      lot("sell", 10, 120, "2026-02-01"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.quantity).toBe(10);
    expect(g[0]!.gain).toBeCloseTo(200, 6); // (120-100)*10
    expect(g[0]!.longTerm).toBe(false);
  });

  it("consumes oldest buys first across a partial sell", () => {
    const g = realizedGains([
      lot("buy", 10, 100, "2026-01-01"),
      lot("buy", 10, 110, "2026-01-10"),
      lot("sell", 15, 130, "2026-03-01"),
    ]);
    expect(g).toHaveLength(2);
    expect(g[0]!.quantity).toBe(10);
    expect(g[0]!.gain).toBeCloseTo(300, 6); // (130-100)*10 from lot 1
    expect(g[1]!.quantity).toBe(5);
    expect(g[1]!.gain).toBeCloseTo(100, 6); // (130-110)*5 from lot 2
    expect(realizedGains([]).length).toBe(0);
  });

  it("folds buy fees into basis and nets sell fees from proceeds", () => {
    const g = realizedGains([
      lot("buy", 10, 100, "2026-01-01", 10), // cost/sh = 101
      lot("sell", 10, 120, "2026-02-01", 5), // proceeds = 1200 - 5
    ]);
    expect(g[0]!.costBasis).toBeCloseTo(1010, 6);
    expect(g[0]!.proceeds).toBeCloseTo(1195, 6);
    expect(g[0]!.gain).toBeCloseTo(185, 6);
  });

  it("long-term = held more than one year, by calendar anniversary", () => {
    const lt = (buyDate: string, sellDate: string) =>
      realizedGains([
        lot("buy", 1, 100, buyDate),
        lot("sell", 1, 100, sellDate),
      ])[0]!.longTerm;

    expect(lt("2021-01-01", "2021-06-01")).toBe(false); // ~5 months → short
    expect(lt("2020-01-01", "2021-06-01")).toBe(true); // ~17 months → long
    // A sale on the one-year anniversary is still short-term…
    expect(lt("2021-01-01", "2022-01-01")).toBe(false);
    // …long-term begins the day after.
    expect(lt("2021-01-01", "2022-01-02")).toBe(true);
    // A one-calendar-year hold spanning a leap day (366 raw days) is short-term.
    expect(lt("2019-03-01", "2020-03-01")).toBe(false);
  });

  it("skips a sell with no matching buys (no basis)", () => {
    expect(realizedGains([lot("sell", 5, 50, "2026-01-01")])).toHaveLength(0);
  });

  it("leaves the remaining open lot uncrystallized on a partial close", () => {
    const g = realizedGains([
      lot("buy", 10, 100, "2026-01-01"),
      lot("sell", 4, 120, "2026-02-01"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.quantity).toBe(4);
    expect(g[0]!.gain).toBeCloseTo(80, 6); // only 4 shares closed
  });
});

describe("summarizeRealized", () => {
  it("rolls up totals, short/long-term, and a year's slice", () => {
    const gains = realizedGains([
      lot("buy", 10, 100, "2020-01-01"),
      lot("sell", 10, 130, "2026-02-01"), // long-term, +300, closed 2026
      lot("buy", 10, 100, "2026-01-01"),
      lot("sell", 10, 90, "2026-03-01"), // short-term, -100, closed 2026
    ]);
    const s = summarizeRealized(gains, 2026);
    expect(s.count).toBe(2);
    expect(s.totalGain).toBeCloseTo(200, 6);
    expect(s.longTermGain).toBeCloseTo(300, 6);
    expect(s.shortTermGain).toBeCloseTo(-100, 6);
    expect(s.ytdGain).toBeCloseTo(200, 6);
    expect(summarizeRealized(gains, 2025).ytdGain).toBe(0);
  });
});
