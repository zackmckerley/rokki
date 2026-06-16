/**
 * Typed Row interfaces for the markets tables + a loosely-typed client accessor.
 *
 * The generated `@rokki/db` types don't yet include the `mkt_*` tables — they're
 * picked up when `supabase gen types` is re-run after the
 * `20260616010000_markets_init.sql` migration. Until then we follow the repo's
 * established convention for the Supabase client boundary (see
 * `lib/resolve-terminal.ts`, `lib/dashboard-queries.ts`, which alias the client
 * to `any`): `marketsDb()` returns a loosely-typed client so `.from("mkt_*")`
 * resolves, and query RESULTS are cast back to the Row interfaces below at each
 * call site. Delete `marketsDb` and switch to the generated types once they
 * include `mkt_*`.
 */

export type ScopeKind = "user" | "space" | "terminal";

export interface MktWatchlistRow {
  id: string;
  user_id: string | null;
  space_id: string | null;
  terminal_id: string | null;
  name: string;
  display_order: number;
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

export interface MktWatchlistSymbolRow {
  id: string;
  watchlist_id: string;
  symbol: string;
  display_order: number;
  note: string | null;
  added_at: string;
}

export interface MktPortfolioRow {
  id: string;
  user_id: string | null;
  space_id: string | null;
  terminal_id: string | null;
  name: string;
  base_currency: string;
  created_by: string;
  created_at: string;
  archived_at: string | null;
}

export interface MktLotRow {
  id: string;
  portfolio_id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fees: number;
  trade_date: string;
  note: string | null;
  created_at: string;
}

export interface MktAlertRow {
  id: string;
  user_id: string;
  symbol: string;
  condition: "price_above" | "price_below" | "pct_up" | "pct_down";
  threshold: number;
  active: boolean;
  note: string | null;
  last_triggered_at: string | null;
  created_at: string;
}

/**
 * Loosely-typed Supabase client for the markets tables. Mirrors the repo's
 * `AnySupabaseClient` convention (see lib/resolve-terminal.ts) until the
 * generated types include `mkt_*`.
 */
// Client boundary type — intentionally `any` (rule not enabled in repo config).
export type MarketsClient = any;

/** Re-type any Rokki Supabase client to one that accepts the mkt_* tables. */
export function marketsDb(client: unknown): MarketsClient {
  return client as MarketsClient;
}
