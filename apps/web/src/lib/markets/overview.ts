/**
 * Market overview board configuration.
 *
 * Uses liquid ETFs as index/sector proxies so quotes resolve cleanly on free
 * tiers (Finnhub/Twelve Data quote ETFs reliably; raw index symbols are spotty
 * on free plans). Labels are what the UI shows.
 */
import "server-only";

export interface OverviewItem {
  symbol: string;
  label: string;
}

export const OVERVIEW_INDICES: OverviewItem[] = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq 100" },
  { symbol: "DIA", label: "Dow 30" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "VXX", label: "Volatility" },
];

export const OVERVIEW_SECTORS: OverviewItem[] = [
  { symbol: "XLK", label: "Technology" },
  { symbol: "XLF", label: "Financials" },
  { symbol: "XLE", label: "Energy" },
  { symbol: "XLV", label: "Health Care" },
  { symbol: "XLY", label: "Cons. Disc." },
  { symbol: "XLP", label: "Cons. Staples" },
  { symbol: "XLI", label: "Industrials" },
  { symbol: "XLU", label: "Utilities" },
  { symbol: "XLB", label: "Materials" },
  { symbol: "XLRE", label: "Real Estate" },
  { symbol: "XLC", label: "Comm. Services" },
];

export const OVERVIEW_COMMODITIES: OverviewItem[] = [
  { symbol: "GLD", label: "Gold" },
  { symbol: "SLV", label: "Silver" },
  { symbol: "USO", label: "Crude Oil" },
];

export const OVERVIEW_FX: OverviewItem[] = [
  { symbol: "EUR/USD", label: "EUR / USD" },
  { symbol: "USD/JPY", label: "USD / JPY" },
  { symbol: "GBP/USD", label: "GBP / USD" },
];
