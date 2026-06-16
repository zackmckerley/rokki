/**
 * Default screener universe.
 *
 * Free tiers don't expose a fundamentals-wide screener, so the screener runs
 * over a candidate universe (this default large-cap set, the user's watchlist
 * symbols, or an explicit `universe` in the request) and filters on the
 * fields we DO have from quotes (price, % change, market cap). Deeper
 * fundamental filters (P/E, yield) require a paid feed — surfaced honestly
 * in the UI.
 */
import "server-only";

export const SCREENER_UNIVERSE: string[] = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "AVGO",
  "JPM", "V", "MA", "UNH", "HD", "PG", "JNJ", "COST", "ABBV", "WMT", "KO",
  "PEP", "BAC", "CRM", "NFLX", "AMD", "ADBE", "DIS", "INTC", "CSCO", "ORCL",
  // Real-estate / REIT lens (Zack's domain)
  "PLD", "AMT", "EQIX", "SPG", "O", "VICI", "AVB", "EQR", "VNQ", "MAA",
];
