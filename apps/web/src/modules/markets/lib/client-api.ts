/**
 * Client-side typed wrappers around the markets REST API.
 *
 * Browser-safe (plain fetch — the repo uses no SWR/React Query). Each call
 * unwraps `{ data }` or throws an Error carrying the server's first error
 * message, so components can `try/catch` and render a message.
 */
"use client";

import type {
  Candle,
  EarningsEvent,
  FinancialReport,
  Mover,
  MoverKind,
  NewsItem,
  Quote,
  Range,
  StatementKind,
  SymbolMatch,
} from "@/lib/markets/providers/types";
import type {
  MktAlertRow,
  MktLotRow,
  MktPortfolioRow,
  MktWatchlistRow,
  MktWatchlistSymbolRow,
  ScopeKind,
} from "@/lib/markets/db";
import type { PortfolioPerformance } from "@/lib/markets/portfolio";
import type { RatesBoard } from "@/lib/markets/rates";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { code: string; message: string }[];
  };
  if (!res.ok) {
    throw new Error(json.errors?.[0]?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

const B = "/api/v1/markets";
const enc = encodeURIComponent;

/* ── market data ─────────────────────────────────────────────────────────── */

export const searchSymbols = (q: string) =>
  req<{ matches: SymbolMatch[] }>(`${B}/search?q=${enc(q)}`).then((d) => d.matches);

export const getQuote = (symbol: string) =>
  req<{ quote: Quote; cached: boolean }>(`${B}/quote/${enc(symbol)}`);

export const getQuotes = (symbols: string[]) =>
  symbols.length === 0
    ? Promise.resolve({} as Record<string, Quote>)
    : req<{ quotes: Record<string, Quote> }>(
        `${B}/quotes?symbols=${enc(symbols.join(","))}`,
      ).then((d) => d.quotes);

export const getCandles = (symbol: string, range: Range) =>
  req<{ candles: Candle[] }>(`${B}/candles/${enc(symbol)}?range=${range}`).then(
    (d) => d.candles,
  );

export const getNews = (symbol: string, days = 7) =>
  req<{ items: NewsItem[] }>(`${B}/news/${enc(symbol)}?days=${days}`).then(
    (d) => d.items,
  );

export const getFinancials = (symbol: string, statement: StatementKind) =>
  req<{ report: FinancialReport }>(
    `${B}/financials/${enc(symbol)}?statement=${statement}`,
  ).then((d) => d.report);

export interface BoardRow {
  symbol: string;
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}
export const getOverview = () =>
  req<{
    indices: BoardRow[];
    sectors: BoardRow[];
    commodities: BoardRow[];
    fx: BoardRow[];
  }>(`${B}/overview`);

export const getMovers = (type: MoverKind) =>
  req<{ movers: Mover[] }>(`${B}/movers?type=${type}`).then((d) => d.movers);

export const getRatesBoard = () =>
  req<{ configured: boolean; board: RatesBoard | null }>(`${B}/rates`);

export const getCalendar = (from: string, to: string) =>
  req<{ events: EarningsEvent[] }>(`${B}/calendar?from=${from}&to=${to}`).then(
    (d) => d.events,
  );

export interface ScreenerFilters {
  minPrice?: number;
  maxPrice?: number;
  minChangePct?: number;
  maxChangePct?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
}
export const runScreener = (filters: ScreenerFilters, universe?: string[]) =>
  req<{ count: number; results: Quote[]; note: string }>(`${B}/screener`, {
    method: "POST",
    body: JSON.stringify({ filters, universe }),
  });

export const convertFx = (from: string, to: string, amount: number) =>
  req<{ from: string; to: string; rate: number; amount: number; converted: number }>(
    `${B}/fx?from=${from}&to=${to}&amount=${amount}`,
  );

/* ── watchlists ──────────────────────────────────────────────────────────── */

export type WatchlistWithSymbols = MktWatchlistRow & {
  symbols: MktWatchlistSymbolRow[];
};

export const listWatchlists = (scope: ScopeKind, scopeId?: string) =>
  req<{ watchlists: WatchlistWithSymbols[] }>(
    `${B}/watchlists?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ""}`,
  ).then((d) => d.watchlists);

export const createWatchlist = (name: string, scope: ScopeKind, scopeId?: string) =>
  req<{ watchlist: MktWatchlistRow }>(`${B}/watchlists`, {
    method: "POST",
    body: JSON.stringify({ name, scope, scopeId }),
  }).then((d) => d.watchlist);

export const deleteWatchlist = (id: string) =>
  req<void>(`${B}/watchlists/${id}`, { method: "DELETE" });

export const addSymbol = (watchlistId: string, symbol: string, note?: string) =>
  req<{ symbol: MktWatchlistSymbolRow }>(`${B}/watchlists/${watchlistId}/symbols`, {
    method: "POST",
    body: JSON.stringify({ symbol, note }),
  }).then((d) => d.symbol);

export const removeSymbol = (watchlistId: string, symbol: string) =>
  req<void>(`${B}/watchlists/${watchlistId}/symbols?symbol=${enc(symbol)}`, {
    method: "DELETE",
  });

/* ── portfolios ──────────────────────────────────────────────────────────── */

export const listPortfolios = (scope: ScopeKind, scopeId?: string) =>
  req<{ portfolios: MktPortfolioRow[] }>(
    `${B}/portfolios?scope=${scope}${scopeId ? `&scopeId=${scopeId}` : ""}`,
  ).then((d) => d.portfolios);

export const getPortfolio = (id: string) =>
  req<{
    portfolio: MktPortfolioRow;
    lots: MktLotRow[];
    performance: PortfolioPerformance;
  }>(`${B}/portfolios/${id}`);

export const createPortfolio = (
  name: string,
  scope: ScopeKind,
  scopeId?: string,
) =>
  req<{ portfolio: MktPortfolioRow }>(`${B}/portfolios`, {
    method: "POST",
    body: JSON.stringify({ name, scope, scopeId }),
  }).then((d) => d.portfolio);

export const deletePortfolio = (id: string) =>
  req<void>(`${B}/portfolios/${id}`, { method: "DELETE" });

export const addLot = (
  portfolioId: string,
  lot: {
    symbol: string;
    side: "buy" | "sell";
    quantity: number;
    price: number;
    fees?: number;
    tradeDate?: string;
  },
) =>
  req<{ lot: MktLotRow }>(`${B}/portfolios/${portfolioId}/lots`, {
    method: "POST",
    body: JSON.stringify(lot),
  }).then((d) => d.lot);

export const deleteLot = (portfolioId: string, lotId: string) =>
  req<void>(`${B}/portfolios/${portfolioId}/lots/${lotId}`, { method: "DELETE" });

/* ── alerts ──────────────────────────────────────────────────────────────── */

export const listAlerts = () =>
  req<{ alerts: MktAlertRow[] }>(`${B}/alerts`).then((d) => d.alerts);

export const createAlert = (
  symbol: string,
  condition: MktAlertRow["condition"],
  threshold: number,
  note?: string,
) =>
  req<{ alert: MktAlertRow }>(`${B}/alerts`, {
    method: "POST",
    body: JSON.stringify({ symbol, condition, threshold, note }),
  }).then((d) => d.alert);

export const updateAlert = (
  id: string,
  patch: { active?: boolean; threshold?: number },
) =>
  req<{ alert: MktAlertRow }>(`${B}/alerts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }).then((d) => d.alert);

export const deleteAlert = (id: string) =>
  req<void>(`${B}/alerts/${id}`, { method: "DELETE" });
