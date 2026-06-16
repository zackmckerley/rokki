/**
 * Finnhub adapter — quotes, symbol search, company profile, news, earnings.
 *
 * Free tier: 60 req/min, real-time-ish US quotes, no key in the URL path
 * (passed as `token`). Display permitted with attribution. Candles are NOT
 * on Finnhub's free tier — those route to Twelve Data.
 *
 * Docs: https://finnhub.io/docs/api
 */
import "server-only";
import { fetchJson, hasKey, requireKey, MarketDataError } from "../http";
import type {
  CompanyProfile,
  EarningsEvent,
  MarketDataProvider,
  NewsItem,
  Quote,
  SymbolMatch,
} from "./types";

const BASE = "https://finnhub.io/api/v1";
const KEY_ENV = "FINNHUB_API_KEY";

function url(path: string, params: Record<string, string>): string {
  const token = requireKey(KEY_ENV, "Finnhub");
  const qs = new URLSearchParams({ ...params, token }).toString();
  return `${BASE}${path}?${qs}`;
}

interface FinnhubQuote {
  c: number; // current
  d: number | null; // change
  dp: number | null; // change %
  h: number; // high
  l: number; // low
  o: number; // open
  pc: number; // prev close
  t: number; // unix seconds
}

interface FinnhubProfile {
  name?: string;
  exchange?: string;
  finnhubIndustry?: string;
  country?: string;
  currency?: string;
  marketCapitalization?: number; // in millions
  shareOutstanding?: number;
  logo?: string;
  weburl?: string;
  ipo?: string;
}

interface FinnhubSearch {
  count: number;
  result: { symbol: string; description: string; type: string }[];
}

interface FinnhubNews {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number; // unix seconds
  related: string;
}

interface FinnhubEarnings {
  earningsCalendar: {
    symbol: string;
    date: string;
    hour: string;
    epsEstimate: number | null;
    epsActual: number | null;
    revenueEstimate: number | null;
    revenueActual: number | null;
  }[];
}

function mapInstrumentType(t: string): SymbolMatch["type"] {
  const v = t.toLowerCase();
  if (v.includes("etf")) return "etf";
  if (v.includes("crypto")) return "crypto";
  if (v.includes("index")) return "index";
  if (v.includes("common") || v.includes("stock") || v.includes("equity"))
    return "stock";
  return "unknown";
}

export const finnhub: MarketDataProvider = {
  id: "finnhub",
  attribution: "Data by Finnhub",

  async quote(symbol) {
    const q = await fetchJson<FinnhubQuote>(
      url("/quote", { symbol }),
      { provider: "finnhub" },
    );
    if (!q || typeof q.c !== "number" || q.c === 0) {
      throw new MarketDataError(404, `No quote for ${symbol}`, "finnhub");
    }
    let profile: FinnhubProfile | null = null;
    try {
      profile = await fetchJson<FinnhubProfile>(
        url("/stock/profile2", { symbol }),
        { provider: "finnhub" },
      );
    } catch {
      // profile is best-effort enrichment
    }
    const result: Quote = {
      symbol,
      name: profile?.name,
      price: q.c,
      change: q.d ?? 0,
      changePct: q.dp ?? 0,
      open: q.o ?? null,
      high: q.h ?? null,
      low: q.l ?? null,
      prevClose: q.pc ?? null,
      volume: null,
      marketCap: profile?.marketCapitalization
        ? profile.marketCapitalization * 1e6
        : null,
      peRatio: null,
      week52High: null,
      week52Low: null,
      currency: profile?.currency ?? "USD",
      exchange: profile?.exchange ?? null,
      marketState: "unknown",
      asOf: q.t ? new Date(q.t * 1000).toISOString() : new Date().toISOString(),
      provider: "finnhub",
    };
    return result;
  },

  async search(query) {
    const res = await fetchJson<FinnhubSearch>(
      url("/search", { q: query }),
      { provider: "finnhub" },
    );
    return (res.result ?? []).slice(0, 20).map((r) => ({
      symbol: r.symbol,
      name: r.description,
      exchange: null,
      type: mapInstrumentType(r.type ?? ""),
    }));
  },

  async profile(symbol) {
    const p = await fetchJson<FinnhubProfile>(
      url("/stock/profile2", { symbol }),
      { provider: "finnhub" },
    );
    if (!p || !p.name) {
      throw new MarketDataError(404, `No profile for ${symbol}`, "finnhub");
    }
    const result: CompanyProfile = {
      symbol,
      name: p.name,
      exchange: p.exchange ?? null,
      industry: p.finnhubIndustry ?? null,
      sector: p.finnhubIndustry ?? null,
      country: p.country ?? null,
      currency: p.currency ?? "USD",
      marketCap: p.marketCapitalization ? p.marketCapitalization * 1e6 : null,
      sharesOutstanding: p.shareOutstanding ? p.shareOutstanding * 1e6 : null,
      logo: p.logo ?? null,
      weburl: p.weburl ?? null,
      ipo: p.ipo ?? null,
      description: null,
      beta: null,
      dividendYield: null,
      provider: "finnhub",
    };
    return result;
  },

  async news(symbol, sinceDays) {
    const to = new Date();
    const from = new Date(to.getTime() - sinceDays * 86400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const items = await fetchJson<FinnhubNews[]>(
      url("/company-news", { symbol, from: fmt(from), to: fmt(to) }),
      { provider: "finnhub" },
    );
    return (items ?? []).slice(0, 30).map<NewsItem>((n) => ({
      id: String(n.id),
      headline: n.headline,
      summary: n.summary || null,
      source: n.source,
      url: n.url,
      imageUrl: n.image || null,
      datetime: new Date(n.datetime * 1000).toISOString(),
      symbols: n.related ? n.related.split(",").filter(Boolean) : [symbol],
    }));
  },

  async earningsCalendar(fromIso, toIso) {
    const res = await fetchJson<FinnhubEarnings>(
      url("/calendar/earnings", {
        from: fromIso.slice(0, 10),
        to: toIso.slice(0, 10),
      }),
      { provider: "finnhub" },
    );
    return (res.earningsCalendar ?? []).map<EarningsEvent>((e) => ({
      symbol: e.symbol,
      date: e.date,
      hour:
        e.hour === "bmo" || e.hour === "amc" || e.hour === "dmh"
          ? e.hour
          : null,
      epsEstimate: e.epsEstimate,
      epsActual: e.epsActual,
      revenueEstimate: e.revenueEstimate,
      revenueActual: e.revenueActual,
    }));
  },
};

export const finnhubAvailable = () => hasKey(KEY_ENV);
