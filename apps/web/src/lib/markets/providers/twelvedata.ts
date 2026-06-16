/**
 * Twelve Data adapter — candles (charts), FX rates, and quote/search fallback.
 *
 * Free tier: 8 req/min, 800 req/day. Covers OHLC time series for stocks, ETFs,
 * FX, and crypto, plus a symbol search and a quote endpoint. We use it as the
 * primary candle source (Finnhub free has no candles) and as a fallback for
 * quotes/search.
 *
 * Docs: https://twelvedata.com/docs
 */
import "server-only";
import { fetchJson, hasKey, requireKey, MarketDataError } from "../http";
import type {
  Candle,
  MarketDataProvider,
  Quote,
  Range,
  SymbolMatch,
} from "./types";

const BASE = "https://api.twelvedata.com";
const KEY_ENV = "TWELVEDATA_API_KEY";

function url(path: string, params: Record<string, string>): string {
  const apikey = requireKey(KEY_ENV, "Twelve Data");
  const qs = new URLSearchParams({ ...params, apikey }).toString();
  return `${BASE}${path}?${qs}`;
}

/** Map a UI range to (interval, outputsize) for the time_series endpoint. */
function rangeToParams(range: Range): { interval: string; outputsize: string } {
  switch (range) {
    case "1D":
      return { interval: "5min", outputsize: "78" };
    case "5D":
      return { interval: "30min", outputsize: "65" };
    case "1M":
      return { interval: "1day", outputsize: "22" };
    case "6M":
      return { interval: "1day", outputsize: "130" };
    case "YTD":
      return { interval: "1day", outputsize: "260" };
    case "1Y":
      return { interval: "1day", outputsize: "260" };
    case "5Y":
      return { interval: "1week", outputsize: "260" };
    case "MAX":
      return { interval: "1month", outputsize: "360" };
    default:
      return { interval: "1day", outputsize: "130" };
  }
}

interface TDTimeSeries {
  status?: string;
  message?: string;
  values?: {
    datetime: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume?: string;
  }[];
}

interface TDQuote {
  status?: string;
  message?: string;
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  fifty_two_week?: { high?: string; low?: string };
  is_market_open?: boolean;
}

interface TDSearch {
  data?: {
    symbol: string;
    instrument_name: string;
    exchange: string;
    instrument_type: string;
  }[];
}

interface TDPrice {
  price?: string;
  status?: string;
}

const num = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

export const twelvedata: MarketDataProvider = {
  id: "twelvedata",
  attribution: "Data by Twelve Data",

  async candles(symbol, range) {
    const { interval, outputsize } = rangeToParams(range);
    const res = await fetchJson<TDTimeSeries>(
      url("/time_series", { symbol, interval, outputsize }),
      { provider: "twelvedata" },
    );
    if (res.status === "error") {
      throw new MarketDataError(
        502,
        res.message ?? `No candles for ${symbol}`,
        "twelvedata",
      );
    }
    const values = res.values ?? [];
    // Twelve Data returns newest-first; charts want oldest-first.
    return values
      .slice()
      .reverse()
      .map<Candle>((v) => ({
        time: Math.floor(new Date(v.datetime).getTime() / 1000),
        open: Number(v.open),
        high: Number(v.high),
        low: Number(v.low),
        close: Number(v.close),
        volume: v.volume ? Number(v.volume) : 0,
      }))
      .filter((c) => !Number.isNaN(c.close));
  },

  async quote(symbol) {
    const q = await fetchJson<TDQuote>(
      url("/quote", { symbol }),
      { provider: "twelvedata" },
    );
    if (q.status === "error" || !q.close) {
      throw new MarketDataError(
        404,
        q.message ?? `No quote for ${symbol}`,
        "twelvedata",
      );
    }
    const result: Quote = {
      symbol,
      name: q.name,
      price: num(q.close) ?? 0,
      change: num(q.change) ?? 0,
      changePct: num(q.percent_change) ?? 0,
      open: num(q.open),
      high: num(q.high),
      low: num(q.low),
      prevClose: num(q.previous_close),
      volume: num(q.volume),
      marketCap: null,
      peRatio: null,
      week52High: num(q.fifty_two_week?.high),
      week52Low: num(q.fifty_two_week?.low),
      currency: q.currency ?? "USD",
      exchange: q.exchange ?? null,
      marketState: q.is_market_open ? "open" : "closed",
      asOf: new Date().toISOString(),
      provider: "twelvedata",
    };
    return result;
  },

  async search(query) {
    const res = await fetchJson<TDSearch>(
      url("/symbol_search", { symbol: query }),
      { provider: "twelvedata" },
    );
    return (res.data ?? []).slice(0, 20).map<SymbolMatch>((r) => ({
      symbol: r.symbol,
      name: r.instrument_name,
      exchange: r.exchange ?? null,
      type:
        r.instrument_type?.toLowerCase().includes("etf")
          ? "etf"
          : r.instrument_type?.toLowerCase().includes("digital")
            ? "crypto"
            : "stock",
    }));
  },

  async fxRate(from, to) {
    const res = await fetchJson<TDPrice>(
      url("/price", { symbol: `${from}/${to}` }),
      { provider: "twelvedata" },
    );
    const p = num(res.price ?? null);
    if (p === null) {
      throw new MarketDataError(404, `No FX rate ${from}/${to}`, "twelvedata");
    }
    return p;
  },
};

export const twelvedataAvailable = () => hasKey(KEY_ENV);
