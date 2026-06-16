/**
 * Quote cache — the thing that makes free tiers viable.
 *
 * Reads/writes the durable `mkt_quote_cache` table via the service-role
 * client (public market data, not tenant data). On a cache miss or stale row
 * it fetches from the provider facade, upserts the normalized quote, and
 * mirrors a row into `mkt_instruments` so search/autocomplete has data. The
 * UI subscribes to `mkt_quote_cache` via Realtime, so an upsert here updates
 * every open pane live.
 */
import "server-only";
import { marketsAdmin } from "./admin";
import { getQuote } from "./providers";
import type { Quote } from "./providers/types";

/** Default freshness window for an interactive quote. */
const DEFAULT_TTL_MS = 15_000;

interface CacheRow {
  symbol: string;
  payload: Quote;
  provider: string;
  fetched_at: string;
}

function isFresh(fetchedAt: string, ttlMs: number): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < ttlMs;
}

async function persist(quote: Quote): Promise<void> {
  const admin = marketsAdmin();
  const nowIso = new Date().toISOString();
  await admin
    .from("mkt_quote_cache")
    .upsert(
      {
        symbol: quote.symbol,
        payload: quote,
        provider: quote.provider,
        fetched_at: nowIso,
      },
      { onConflict: "symbol" },
    );
  await admin
    .from("mkt_instruments")
    .upsert(
      {
        symbol: quote.symbol,
        name: quote.name ?? "",
        exchange: quote.exchange,
        currency: quote.currency,
        updated_at: nowIso,
      },
      { onConflict: "symbol" },
    );
}

/**
 * Get a single quote, served from cache when fresh. On miss/stale, fetches
 * live, persists, and returns. Throws MarketDataError on provider failure
 * only when there is no cached row to fall back to.
 */
export async function getQuoteCached(
  symbol: string,
  ttlMs = DEFAULT_TTL_MS,
): Promise<{ quote: Quote; cached: boolean }> {
  const admin = marketsAdmin();
  const { data } = await admin
    .from("mkt_quote_cache")
    .select("symbol, payload, provider, fetched_at")
    .eq("symbol", symbol)
    .maybeSingle();
  const cachedRow = data as CacheRow | null;

  if (cachedRow && isFresh(cachedRow.fetched_at, ttlMs)) {
    return { quote: cachedRow.payload, cached: true };
  }

  try {
    const quote = await getQuote(symbol);
    await persist(quote);
    return { quote, cached: false };
  } catch (e) {
    // Serve a stale row rather than erroring if we have one.
    if (cachedRow) return { quote: cachedRow.payload, cached: true };
    throw e;
  }
}

/**
 * Batch variant for watchlists. Returns a map symbol→quote. Fetches only the
 * stale/missing symbols, in parallel, to stay within provider rate limits.
 */
export async function getQuotesCached(
  symbols: string[],
  ttlMs = DEFAULT_TTL_MS,
): Promise<Record<string, Quote>> {
  const unique = Array.from(new Set(symbols));
  if (unique.length === 0) return {};
  const admin = marketsAdmin();
  const { data } = await admin
    .from("mkt_quote_cache")
    .select("symbol, payload, provider, fetched_at")
    .in("symbol", unique);

  const rows = (data ?? []) as CacheRow[];
  const bySymbol = new Map(rows.map((r) => [r.symbol, r] as const));
  const out: Record<string, Quote> = {};
  const stale: string[] = [];

  for (const sym of unique) {
    const row = bySymbol.get(sym);
    if (row && isFresh(row.fetched_at, ttlMs)) {
      out[sym] = row.payload;
    } else {
      if (row) out[sym] = row.payload; // optimistic stale value
      stale.push(sym);
    }
  }

  await Promise.all(
    stale.map(async (sym) => {
      try {
        const quote = await getQuote(sym);
        await persist(quote);
        out[sym] = quote;
      } catch {
        // keep stale/absent — caller renders "—"
      }
    }),
  );

  return out;
}
