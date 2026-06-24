/**
 * The built-in "Watching" list.
 *
 * A default, always-present set of instruments so the dashboard Markets panel
 * is useful before anyone creates a custom watchlist — and so the symbols Zack
 * asked Rokki to track (mega-cap tech, the majors of crypto, and the metal/oil
 * proxies) are one glance away on the dashboard, no module click required.
 *
 * Pure data + a small adapter — no React, no server-only marker — so it can be
 * imported from a client component, a server route, or a test alike.
 *
 * Resolution notes (free-feed reality, see providers/index.ts):
 *  - equity + commodity rows are plain US-listed tickers/ETFs → resolve on the
 *    configured stock feed today.
 *  - crypto rows are canonical `BASE-USD` symbols; they resolve once a crypto
 *    feed is wired in (providers/coingecko), which needs no API key.
 */

/** Stable id for the built-in list (distinct from any DB watchlist UUID). */
export const WATCHING_ID = "__watching";

export type WatchingKind = "equity" | "crypto" | "commodity";

export interface WatchingItem {
  /** Canonical instrument symbol (what we display and key quotes on). */
  symbol: string;
  /** Friendly name shown when the panel is wide enough. */
  label: string;
  kind: WatchingKind;
}

/**
 * A width-light view of a list the Markets panel can render. Both the built-in
 * Watching list and the user's DB watchlists are adapted to this shape so the
 * panel never has to care which one it's showing.
 */
export interface MarketsList {
  id: string;
  name: string;
  /** `builtin` lists can't be edited from the panel (no DB row behind them). */
  builtin?: boolean;
  symbols: { symbol: string; label?: string }[];
}

/** The default tracked instruments. Order is intentional (tech → crypto → metals/oil). */
export const WATCHING: WatchingItem[] = [
  { symbol: "AAPL", label: "Apple", kind: "equity" },
  { symbol: "MSFT", label: "Microsoft", kind: "equity" },
  { symbol: "GOOGL", label: "Alphabet", kind: "equity" },
  { symbol: "NVDA", label: "NVIDIA", kind: "equity" },
  { symbol: "META", label: "Meta", kind: "equity" },
  { symbol: "CRCL", label: "Circle", kind: "equity" },
  { symbol: "BTC-USD", label: "Bitcoin", kind: "crypto" },
  { symbol: "ETH-USD", label: "Ethereum", kind: "crypto" },
  { symbol: "XRP-USD", label: "XRP", kind: "crypto" },
  { symbol: "SOL-USD", label: "Solana", kind: "crypto" },
  { symbol: "GLD", label: "Gold (GLD)", kind: "commodity" },
  { symbol: "SLV", label: "Silver (SLV)", kind: "commodity" },
  { symbol: "USO", label: "Oil (USO)", kind: "commodity" },
];

/** The built-in list adapted to the panel's `MarketsList` shape. */
export function watchingList(): MarketsList {
  return {
    id: WATCHING_ID,
    name: "Watching",
    builtin: true,
    symbols: WATCHING.map((w) => ({ symbol: w.symbol, label: w.label })),
  };
}
