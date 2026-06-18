import { describe, expect, it } from "vitest";
import { computePerformance, computePositions } from "./portfolio";
import type { MktLotRow } from "./db";
import type { Quote } from "./providers/types";

function lot(p: Partial<MktLotRow>): MktLotRow {
  return {
    id: crypto.randomUUID(),
    portfolio_id: "pf",
    symbol: "AAPL",
    side: "buy",
    quantity: 1,
    price: 100,
    fees: 0,
    trade_date: "2026-01-01",
    note: null,
    created_at: "2026-01-01T00:00:00Z",
    ...p,
  };
}

function quote(symbol: string, price: number, change = 0): Quote {
  return {
    symbol,
    price,
    change,
    changePct: 0,
    open: null,
    high: null,
    low: null,
    prevClose: null,
    volume: null,
    marketCap: null,
    peRatio: null,
    week52High: null,
    week52Low: null,
    currency: "USD",
    exchange: null,
    marketState: "closed",
    asOf: "2026-01-01T00:00:00Z",
    provider: "test",
  };
}

describe("computePositions", () => {
  it("averages cost across buys and includes fees", () => {
    const [pos] = computePositions([
      lot({ side: "buy", quantity: 10, price: 100, fees: 5 }),
      lot({ side: "buy", quantity: 10, price: 120, fees: 5 }),
    ]);
    expect(pos.quantity).toBe(20);
    // (10*100+5 + 10*120+5) / 20 = 2210/20 = 110.5
    expect(pos.avgCost).toBeCloseTo(110.5);
    expect(pos.costBasis).toBeCloseTo(2210);
  });

  it("realizes P/L on a sell at average cost", () => {
    const [pos] = computePositions([
      lot({ side: "buy", quantity: 10, price: 100 }),
      lot({ side: "sell", quantity: 4, price: 150, trade_date: "2026-02-01" }),
    ]);
    expect(pos.quantity).toBe(6);
    // realized = (150 - 100) * 4 = 200
    expect(pos.realizedPL).toBeCloseTo(200);
    expect(pos.costBasis).toBeCloseTo(600);
  });

  it("processes lots in trade-date order regardless of input order", () => {
    const [pos] = computePositions([
      lot({ side: "sell", quantity: 5, price: 150, trade_date: "2026-03-01" }),
      lot({ side: "buy", quantity: 10, price: 100, trade_date: "2026-01-01" }),
    ]);
    expect(pos.quantity).toBe(5);
    expect(pos.realizedPL).toBeCloseTo(250);
  });
});

describe("computePerformance", () => {
  it("computes market value, unrealized P/L, and weights", () => {
    const positions = computePositions([
      lot({ symbol: "AAPL", quantity: 10, price: 100 }),
      lot({ symbol: "MSFT", quantity: 5, price: 200 }),
    ]);
    const perf = computePerformance(positions, {
      AAPL: quote("AAPL", 150, 2),
      MSFT: quote("MSFT", 220, -1),
    });
    expect(perf.totalMarketValue).toBeCloseTo(10 * 150 + 5 * 220); // 2600
    expect(perf.totalCostBasis).toBeCloseTo(1000 + 1000); // 2000
    expect(perf.totalUnrealizedPL).toBeCloseTo(600);
    expect(perf.totalDayChange).toBeCloseTo(10 * 2 + 5 * -1); // 15
    const aapl = perf.positions.find((p) => p.symbol === "AAPL");
    expect(aapl?.weight).toBeCloseTo((1500 / 2600) * 100);
  });

  it("handles a missing quote without throwing", () => {
    const positions = computePositions([lot({ symbol: "ZZZZ", quantity: 3, price: 10 })]);
    const perf = computePerformance(positions, {});
    expect(perf.positions[0].marketValue).toBeNull();
    expect(perf.totalMarketValue).toBe(0);
  });
});
