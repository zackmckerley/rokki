/**
 * Market-data provider contract.
 *
 * One interface, swappable implementations (Finnhub, Twelve Data, FMP, …).
 * The registry in `./index.ts` maps each data class to a concrete provider,
 * so "quotes from Finnhub, candles from Twelve Data" is configuration, not
 * hardcoded call sites. Swapping a free tier for a paid feed at scale is a
 * one-file change.
 *
 * All shapes are NORMALIZED — provider-specific payloads are flattened into
 * these types inside each adapter so the rest of the app never sees a raw
 * vendor response.
 */

/** A stock/instrument identifier, e.g. "AAPL", "BTC-USD". NOT a terminal ticker. */
export type Symbol = string;

export type InstrumentType =
  | "stock"
  | "etf"
  | "crypto"
  | "fx"
  | "index"
  | "future"
  | "bond"
  | "unknown";

export type MarketState = "pre" | "open" | "post" | "closed" | "unknown";

export interface Quote {
  symbol: Symbol;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  volume: number | null;
  marketCap: number | null;
  peRatio: number | null;
  week52High: number | null;
  week52Low: number | null;
  currency: string;
  exchange: string | null;
  marketState: MarketState;
  /** ISO timestamp the quote was sourced. */
  asOf: string;
  provider: string;
}

export interface SymbolMatch {
  symbol: Symbol;
  name: string;
  exchange: string | null;
  type: InstrumentType;
}

export interface CompanyProfile {
  symbol: Symbol;
  name: string;
  exchange: string | null;
  industry: string | null;
  sector: string | null;
  country: string | null;
  currency: string;
  marketCap: number | null;
  sharesOutstanding: number | null;
  logo: string | null;
  weburl: string | null;
  ipo: string | null;
  description: string | null;
  beta: number | null;
  dividendYield: number | null;
  provider: string;
}

/** Chart range presets, mapped to (interval, lookback) inside adapters. */
export type Range = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

export type Interval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";

export interface Candle {
  /** Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string | null;
  source: string;
  url: string;
  imageUrl: string | null;
  /** ISO timestamp. */
  datetime: string;
  symbols: Symbol[];
}

export type StatementKind = "income" | "balance" | "cash";

export interface FinancialPeriod {
  /** ISO date of the fiscal period end. */
  fiscalDate: string;
  /** "Q" (quarterly) or "FY" (annual). */
  period: "Q" | "FY";
  lineItems: Record<string, number | null>;
}

export interface FinancialReport {
  symbol: Symbol;
  statement: StatementKind;
  currency: string;
  periods: FinancialPeriod[];
  provider: string;
}

export interface EarningsEvent {
  symbol: Symbol;
  /** ISO date. */
  date: string;
  hour: "bmo" | "amc" | "dmh" | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface Mover {
  symbol: Symbol;
  name: string | null;
  price: number;
  change: number;
  changePct: number;
  volume: number | null;
}

export type MoverKind = "gainers" | "losers" | "active";

export interface OverviewQuote {
  symbol: Symbol;
  label: string;
  price: number;
  change: number;
  changePct: number;
}

export interface DataClassMap {
  quote: 1;
  search: 1;
  profile: 1;
  candles: 1;
  news: 1;
  financials: 1;
  calendar: 1;
  movers: 1;
  fx: 1;
}

export type DataClass = keyof DataClassMap;

/**
 * A market-data provider. Every method is optional: each free-tier adapter
 * implements only what its tier actually covers, and the facade in
 * `./index.ts` orchestrates provider selection + fallback, degrading
 * gracefully (empty result or `unsupported`) when nothing can serve a class.
 */
export interface MarketDataProvider {
  readonly id: string;
  /** Rendered in the UI footer — free tiers require attribution. */
  readonly attribution: string;
  quote?(symbol: Symbol): Promise<Quote>;
  search?(query: string): Promise<SymbolMatch[]>;
  candles?(symbol: Symbol, range: Range): Promise<Candle[]>;
  profile?(symbol: Symbol): Promise<CompanyProfile>;
  news?(symbol: Symbol, sinceDays: number): Promise<NewsItem[]>;
  financials?(symbol: Symbol, statement: StatementKind): Promise<FinancialReport>;
  earningsCalendar?(fromIso: string, toIso: string): Promise<EarningsEvent[]>;
  movers?(kind: MoverKind): Promise<Mover[]>;
  fxRate?(from: string, to: string): Promise<number>;
}
