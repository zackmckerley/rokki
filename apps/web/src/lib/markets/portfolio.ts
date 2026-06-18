/**
 * Portfolio math — pure functions, no I/O.
 *
 * Average-cost-basis position accounting from a lot ledger, plus live
 * performance (market value, unrealized P/L, day change, allocation) given a
 * quote map. Kept pure so it's trivially unit-testable and reusable by the
 * API route and the MCP `portfolio_performance` tool.
 */
import type { MktLotRow } from "./db";
import type { Quote } from "./providers/types";

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPL: number;
}

export interface PositionPerformance extends PortfolioPosition {
  price: number | null;
  marketValue: number | null;
  unrealizedPL: number | null;
  unrealizedPct: number | null;
  dayChange: number | null;
  weight: number | null;
}

export interface PortfolioPerformance {
  positions: PositionPerformance[];
  totalMarketValue: number;
  totalCostBasis: number;
  totalUnrealizedPL: number;
  totalRealizedPL: number;
  totalDayChange: number;
  unrealizedPct: number;
}

/** Reduce a lot ledger to net positions using average-cost accounting. */
export function computePositions(lots: MktLotRow[]): PortfolioPosition[] {
  const order = [...lots].sort((a, b) =>
    a.trade_date < b.trade_date ? -1 : a.trade_date > b.trade_date ? 1 : 0,
  );

  const acc = new Map<
    string,
    { qty: number; cost: number; realized: number }
  >();

  for (const lot of order) {
    const cur = acc.get(lot.symbol) ?? { qty: 0, cost: 0, realized: 0 };
    const q = Number(lot.quantity);
    const px = Number(lot.price);
    const fees = Number(lot.fees);
    if (lot.side === "buy") {
      cur.qty += q;
      cur.cost += q * px + fees;
    } else {
      const avg = cur.qty > 0 ? cur.cost / cur.qty : 0;
      const sellQty = Math.min(q, cur.qty);
      cur.realized += (px - avg) * sellQty - fees;
      cur.cost -= avg * sellQty;
      cur.qty -= sellQty;
      if (cur.qty <= 1e-9) {
        cur.qty = 0;
        cur.cost = 0;
      }
    }
    acc.set(lot.symbol, cur);
  }

  return Array.from(acc.entries()).map(([symbol, v]) => ({
    symbol,
    quantity: v.qty,
    avgCost: v.qty > 0 ? v.cost / v.qty : 0,
    costBasis: v.cost,
    realizedPL: v.realized,
  }));
}

/** Combine positions with live quotes into a full performance snapshot. */
export function computePerformance(
  positions: PortfolioPosition[],
  quotes: Record<string, Quote>,
): PortfolioPerformance {
  const open = positions.filter((p) => p.quantity > 0);

  const enriched = open.map((p): PositionPerformance => {
    const q = quotes[p.symbol];
    const price = q?.price ?? null;
    const marketValue = price !== null ? price * p.quantity : null;
    const unrealizedPL =
      marketValue !== null ? marketValue - p.costBasis : null;
    const unrealizedPct =
      unrealizedPL !== null && p.costBasis > 0
        ? (unrealizedPL / p.costBasis) * 100
        : null;
    const dayChange = q ? q.change * p.quantity : null;
    return {
      ...p,
      price,
      marketValue,
      unrealizedPL,
      unrealizedPct,
      dayChange,
      weight: null,
    };
  });

  const totalMarketValue = enriched.reduce(
    (s, p) => s + (p.marketValue ?? 0),
    0,
  );
  const totalCostBasis = enriched.reduce((s, p) => s + p.costBasis, 0);
  const totalUnrealizedPL = enriched.reduce(
    (s, p) => s + (p.unrealizedPL ?? 0),
    0,
  );
  const totalRealizedPL = positions.reduce((s, p) => s + p.realizedPL, 0);
  const totalDayChange = enriched.reduce((s, p) => s + (p.dayChange ?? 0), 0);

  for (const p of enriched) {
    p.weight =
      totalMarketValue > 0 && p.marketValue !== null
        ? (p.marketValue / totalMarketValue) * 100
        : null;
  }

  return {
    positions: enriched.sort(
      (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0),
    ),
    totalMarketValue,
    totalCostBasis,
    totalUnrealizedPL,
    totalRealizedPL,
    totalDayChange,
    unrealizedPct:
      totalCostBasis > 0 ? (totalUnrealizedPL / totalCostBasis) * 100 : 0,
  };
}
