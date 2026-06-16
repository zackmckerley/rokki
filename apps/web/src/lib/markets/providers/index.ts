/**
 * Market-data facade.
 *
 * The single public entry point for market data. Picks the right provider per
 * data class, falls back to a secondary when the primary is unconfigured or
 * fails, and throws `MarketDataError(503, "unsupported")` when nothing can
 * serve a class. Routes call these functions and never touch a provider
 * directly — so swapping a free tier for a paid feed is a change here only.
 */
import "server-only";
import { MarketDataError } from "../http";
import { finnhub, finnhubAvailable } from "./finnhub";
import { twelvedata, twelvedataAvailable } from "./twelvedata";
import { fmp, fmpAvailable } from "./fmp";
import type {
  Candle,
  CompanyProfile,
  EarningsEvent,
  FinancialReport,
  Mover,
  MoverKind,
  NewsItem,
  Quote,
  Range,
  StatementKind,
  SymbolMatch,
} from "./types";

interface Attempt<T> {
  available: boolean;
  run: () => Promise<T>;
}

async function firstOf<T>(cls: string, attempts: Attempt<T>[]): Promise<T> {
  const live = attempts.filter((a) => a.available);
  if (live.length === 0) {
    throw new MarketDataError(503, `No provider configured for ${cls}`);
  }
  let lastErr: unknown;
  for (const a of live) {
    try {
      return await a.run();
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr instanceof MarketDataError) throw lastErr;
  throw new MarketDataError(
    502,
    `All providers failed for ${cls}: ${
      lastErr instanceof Error ? lastErr.message : "unknown"
    }`,
  );
}

export function getQuote(symbol: string): Promise<Quote> {
  return firstOf("quote", [
    { available: finnhubAvailable() && !!finnhub.quote, run: () => finnhub.quote!(symbol) },
    { available: twelvedataAvailable() && !!twelvedata.quote, run: () => twelvedata.quote!(symbol) },
  ]);
}

export function searchSymbols(query: string): Promise<SymbolMatch[]> {
  return firstOf("search", [
    { available: finnhubAvailable() && !!finnhub.search, run: () => finnhub.search!(query) },
    { available: twelvedataAvailable() && !!twelvedata.search, run: () => twelvedata.search!(query) },
  ]);
}

export function getCandles(symbol: string, range: Range): Promise<Candle[]> {
  return firstOf("candles", [
    { available: twelvedataAvailable() && !!twelvedata.candles, run: () => twelvedata.candles!(symbol, range) },
  ]);
}

export function getProfile(symbol: string): Promise<CompanyProfile> {
  return firstOf("profile", [
    { available: finnhubAvailable() && !!finnhub.profile, run: () => finnhub.profile!(symbol) },
  ]);
}

export function getNews(symbol: string, sinceDays = 7): Promise<NewsItem[]> {
  return firstOf("news", [
    { available: finnhubAvailable() && !!finnhub.news, run: () => finnhub.news!(symbol, sinceDays) },
  ]);
}

export function getFinancials(
  symbol: string,
  statement: StatementKind,
): Promise<FinancialReport> {
  return firstOf("financials", [
    { available: fmpAvailable() && !!fmp.financials, run: () => fmp.financials!(symbol, statement) },
  ]);
}

export function getEarningsCalendar(
  fromIso: string,
  toIso: string,
): Promise<EarningsEvent[]> {
  return firstOf("calendar", [
    { available: finnhubAvailable() && !!finnhub.earningsCalendar, run: () => finnhub.earningsCalendar!(fromIso, toIso) },
  ]);
}

export function getMovers(kind: MoverKind): Promise<Mover[]> {
  return firstOf("movers", [
    { available: fmpAvailable() && !!fmp.movers, run: () => fmp.movers!(kind) },
  ]);
}

export function getFxRate(from: string, to: string): Promise<number> {
  return firstOf("fx", [
    { available: twelvedataAvailable() && !!twelvedata.fxRate, run: () => twelvedata.fxRate!(from, to) },
  ]);
}

/** Which providers are configured — for diagnostics / the attribution footer. */
export function configuredProviders(): { id: string; attribution: string }[] {
  const out: { id: string; attribution: string }[] = [];
  if (finnhubAvailable()) out.push({ id: finnhub.id, attribution: finnhub.attribution });
  if (twelvedataAvailable()) out.push({ id: twelvedata.id, attribution: twelvedata.attribution });
  if (fmpAvailable()) out.push({ id: fmp.id, attribution: fmp.attribution });
  return out;
}
