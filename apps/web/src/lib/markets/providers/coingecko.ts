/**
 * CoinGecko adapter — live crypto quotes, no API key required.
 *
 * The keyed feeds (Finnhub/Twelve Data) don't serve canonical crypto symbols
 * like `BTC-USD` on their free tiers — Finnhub returns an empty quote (which we
 * treat as 404), so crypto rows would never resolve. CoinGecko's public
 * `simple/price` endpoint covers the majors with no key, so the facade routes
 * any recognized crypto symbol here first.
 *
 * Free public API: generous but unauthenticated rate limits, so this only fires
 * for crypto symbols (gated in the facade) and rides the same quote cache as
 * every other provider. Display requires attribution — surfaced via
 * configuredProviders() in the footer.
 *
 * Docs: https://docs.coingecko.com/reference/simple-price
 */
import "server-only";
import { fetchJson, MarketDataError } from "../http";
import type { MarketDataProvider, Quote } from "./types";

const BASE = "https://api.coingecko.com/api/v3";

/**
 * Canonical base ticker → CoinGecko coin id + display name. Covers Zack's
 * Watching majors (BTC/ETH/XRP/SOL) plus the common large-caps, so a typed
 * crypto symbol resolves without a lookup round-trip.
 */
const CRYPTO: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  XRP: { id: "ripple", name: "XRP" },
  SOL: { id: "solana", name: "Solana" },
  ADA: { id: "cardano", name: "Cardano" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  BNB: { id: "binancecoin", name: "BNB" },
  LTC: { id: "litecoin", name: "Litecoin" },
  DOT: { id: "polkadot", name: "Polkadot" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  MATIC: { id: "matic-network", name: "Polygon" },
  LINK: { id: "chainlink", name: "Chainlink" },
  TRX: { id: "tron", name: "TRON" },
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  USDC: { id: "usd-coin", name: "USD Coin" },
  USDT: { id: "tether", name: "Tether" },
};

/**
 * Reduce a user-entered symbol to its known crypto base, or null if it isn't
 * one. Accepts the common shapes: `BTC`, `BTC-USD`, `BTC/USD`, `BTCUSD`.
 */
export function cryptoBase(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  const candidates = [
    s,
    s.replace(/[-/]USD$/, ""),
    s.replace(/[-/]USDT$/, ""),
    s.replace(/USD$/, ""),
  ];
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(CRYPTO, c)) return c;
  }
  return null;
}

/** Whether the facade should route this symbol to CoinGecko. */
export function isCryptoSymbol(symbol: string): boolean {
  return cryptoBase(symbol) !== null;
}

type CgSimplePrice = Record<
  string,
  {
    usd?: number;
    usd_24h_change?: number;
    usd_24h_vol?: number;
    usd_market_cap?: number;
    last_updated_at?: number;
  }
>;

export const coingecko: MarketDataProvider = {
  id: "coingecko",
  attribution: "Crypto data by CoinGecko",

  async quote(symbol) {
    const base = cryptoBase(symbol);
    if (!base) {
      throw new MarketDataError(404, `Unknown crypto symbol: ${symbol}`, "coingecko");
    }
    const { id, name } = CRYPTO[base];
    const url =
      `${BASE}/simple/price?ids=${encodeURIComponent(id)}` +
      `&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true` +
      `&include_market_cap=true&include_last_updated_at=true`;
    const data = await fetchJson<CgSimplePrice>(url, { provider: "coingecko" });
    const row = data[id];
    if (!row || typeof row.usd !== "number") {
      throw new MarketDataError(404, `No quote for ${symbol}`, "coingecko");
    }

    const price = row.usd;
    const changePct = row.usd_24h_change ?? 0;
    // Derive the absolute change + prior close from the 24h % move so the row
    // matches the shape of every other quote (which carries change + prevClose).
    const prevClose = changePct > -100 ? price / (1 + changePct / 100) : null;
    const change = prevClose !== null ? price - prevClose : 0;

    const quote: Quote = {
      symbol, // echo the canonical symbol the caller asked for (e.g. BTC-USD)
      name,
      price,
      change,
      changePct,
      open: null,
      high: null,
      low: null,
      prevClose,
      volume: row.usd_24h_vol ?? null,
      marketCap: row.usd_market_cap ?? null,
      peRatio: null,
      week52High: null,
      week52Low: null,
      currency: "USD",
      exchange: "CoinGecko",
      marketState: "open", // crypto trades 24/7
      asOf: row.last_updated_at
        ? new Date(row.last_updated_at * 1000).toISOString()
        : new Date().toISOString(),
      provider: "coingecko",
    };
    return quote;
  },
};

/** Always available — the public endpoint needs no API key. */
export const coingeckoAvailable = () => true;
