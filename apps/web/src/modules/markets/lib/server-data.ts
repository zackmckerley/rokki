/**
 * Server-side loaders for markets pages. RLS-scoped (per-user client), used by
 * the server components to hydrate the dashboard / portfolio / alerts views.
 */
import "server-only";
import {
  marketsDb,
  type MktPortfolioRow,
  type MktWatchlistRow,
  type MktWatchlistSymbolRow,
  type ScopeKind,
} from "@/lib/markets/db";

export type WatchlistWithSymbols = MktWatchlistRow & {
  symbols: MktWatchlistSymbolRow[];
};

function scopeColumn(scope: ScopeKind): "user_id" | "space_id" | "terminal_id" {
  if (scope === "space") return "space_id";
  if (scope === "terminal") return "terminal_id";
  return "user_id";
}

export async function loadWatchlists(
  supabase: unknown,
  scope: ScopeKind,
  scopeValue: string,
): Promise<WatchlistWithSymbols[]> {
  const db = marketsDb(supabase);
  const { data: lists } = await db
    .from("mkt_watchlists")
    .select("*")
    .is("archived_at", null)
    .eq(scopeColumn(scope), scopeValue)
    .order("display_order");

  const rows = (lists ?? []) as MktWatchlistRow[];
  if (rows.length === 0) return [];

  const { data: syms } = await db
    .from("mkt_watchlist_symbols")
    .select("*")
    .in(
      "watchlist_id",
      rows.map((l) => l.id),
    )
    .order("display_order");

  const byList = new Map<string, MktWatchlistSymbolRow[]>();
  for (const s of (syms ?? []) as MktWatchlistSymbolRow[]) {
    const arr = byList.get(s.watchlist_id) ?? [];
    arr.push(s);
    byList.set(s.watchlist_id, arr);
  }
  return rows.map((l) => ({ ...l, symbols: byList.get(l.id) ?? [] }));
}

export async function loadPortfolios(
  supabase: unknown,
  scope: ScopeKind,
  scopeValue: string,
): Promise<MktPortfolioRow[]> {
  const db = marketsDb(supabase);
  const { data } = await db
    .from("mkt_portfolios")
    .select("*")
    .is("archived_at", null)
    .eq(scopeColumn(scope), scopeValue)
    .order("created_at");
  return (data ?? []) as MktPortfolioRow[];
}
