/**
 * Financial Modeling Prep adapter — financial statements and market movers.
 *
 * Free tier: ~250 req/day, US large-caps. Used for income/balance/cash-flow
 * statements (cached 24h) and gainers/losers/most-active movers. Degrades
 * gracefully — if the key is absent or the tier doesn't cover a symbol, the
 * facade returns an empty/unsupported result.
 *
 * Docs: https://site.financialmodelingprep.com/developer/docs
 */
import "server-only";
import { fetchJson, hasKey, requireKey, MarketDataError } from "../http";
import type {
  FinancialPeriod,
  FinancialReport,
  MarketDataProvider,
  Mover,
  MoverKind,
  StatementKind,
} from "./types";

const BASE = "https://financialmodelingprep.com/api/v3";
const KEY_ENV = "FMP_API_KEY";

function url(path: string, params: Record<string, string> = {}): string {
  const apikey = requireKey(KEY_ENV, "FMP");
  const qs = new URLSearchParams({ ...params, apikey }).toString();
  return `${BASE}${path}?${qs}`;
}

const STATEMENT_PATH: Record<StatementKind, string> = {
  income: "/income-statement",
  balance: "/balance-sheet-statement",
  cash: "/cash-flow-statement",
};

type FmpStatementRow = Record<string, string | number | null> & {
  date?: string;
  period?: string;
  reportedCurrency?: string;
};

interface FmpMover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
}

const MOVER_PATH: Record<MoverKind, string> = {
  gainers: "/stock_market/gainers",
  losers: "/stock_market/losers",
  active: "/stock_market/actives",
};

/** Columns we surface per statement, in display order. */
const LINE_ITEMS: Record<StatementKind, string[]> = {
  income: [
    "revenue",
    "costOfRevenue",
    "grossProfit",
    "operatingExpenses",
    "operatingIncome",
    "netIncome",
    "eps",
    "ebitda",
  ],
  balance: [
    "totalAssets",
    "totalCurrentAssets",
    "cashAndCashEquivalents",
    "totalLiabilities",
    "totalCurrentLiabilities",
    "totalDebt",
    "totalStockholdersEquity",
  ],
  cash: [
    "netCashProvidedByOperatingActivities",
    "netCashUsedForInvestingActivites",
    "netCashUsedProvidedByFinancingActivities",
    "freeCashFlow",
    "capitalExpenditure",
    "dividendsPaid",
  ],
};

export const fmp: MarketDataProvider = {
  id: "fmp",
  attribution: "Fundamentals by Financial Modeling Prep",

  async financials(symbol, statement: StatementKind) {
    const rows = await fetchJson<FmpStatementRow[]>(
      url(`${STATEMENT_PATH[statement]}/${encodeURIComponent(symbol)}`, {
        period: "quarter",
        limit: "8",
      }),
      { provider: "fmp" },
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new MarketDataError(404, `No ${statement} data for ${symbol}`, "fmp");
    }
    const keys = LINE_ITEMS[statement];
    const periods: FinancialPeriod[] = rows.map((r) => {
      const lineItems: Record<string, number | null> = {};
      for (const k of keys) {
        const v = r[k];
        lineItems[k] = typeof v === "number" ? v : v ? Number(v) : null;
      }
      return {
        fiscalDate: String(r.date ?? ""),
        period: String(r.period ?? "").toUpperCase().startsWith("Q") ? "Q" : "FY",
        lineItems,
      };
    });
    return {
      symbol,
      statement,
      currency: String(rows[0]?.reportedCurrency ?? "USD"),
      periods,
      provider: "fmp",
    } satisfies FinancialReport;
  },

  async movers(kind) {
    const rows = await fetchJson<FmpMover[]>(url(MOVER_PATH[kind]), {
      provider: "fmp",
    });
    return (rows ?? []).slice(0, 25).map<Mover>((r) => ({
      symbol: r.symbol,
      name: r.name ?? null,
      price: r.price,
      change: r.change,
      changePct: r.changesPercentage,
      volume: null,
    }));
  },
};

export const fmpAvailable = () => hasKey(KEY_ENV);
