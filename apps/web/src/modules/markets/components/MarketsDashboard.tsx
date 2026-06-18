"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import type { Quote } from "@/lib/markets/providers/types";
import type { MktPortfolioRow, ScopeKind } from "@/lib/markets/db";
import {
  addSymbol,
  createPortfolio,
  createWatchlist,
  deletePortfolio,
  deleteWatchlist,
  getQuotes,
  listPortfolios,
  listWatchlists,
  removeSymbol,
  type WatchlistWithSymbols,
} from "../lib/client-api";
import { SymbolSearch } from "./SymbolSearch";
import { WatchlistPanel } from "./WatchlistPanel";
import { AttributionFooter } from "./AttributionFooter";

interface QuoteCacheRow {
  symbol: string;
  payload: Quote;
}

export function MarketsDashboard({
  scope,
  scopeId,
  initialWatchlists,
  initialPortfolios,
}: {
  scope: ScopeKind;
  scopeId?: string;
  initialWatchlists: WatchlistWithSymbols[];
  initialPortfolios: MktPortfolioRow[];
}) {
  const [watchlists, setWatchlists] = useState(initialWatchlists);
  const [portfolios, setPortfolios] = useState(initialPortfolios);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [targetId, setTargetId] = useState(initialWatchlists[0]?.id ?? "");
  const [newList, setNewList] = useState("");
  const [newPortfolio, setNewPortfolio] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allSymbols = useMemo(
    () =>
      Array.from(
        new Set(watchlists.flatMap((w) => w.symbols.map((s) => s.symbol))),
      ),
    [watchlists],
  );

  const refreshWatchlists = useCallback(async () => {
    const w = await listWatchlists(scope, scopeId);
    setWatchlists(w);
    if (!w.find((x) => x.id === targetId)) setTargetId(w[0]?.id ?? "");
  }, [scope, scopeId, targetId]);

  useEffect(() => {
    if (allSymbols.length === 0) {
      setQuotes({});
      return;
    }
    let cancelled = false;
    getQuotes(allSymbols)
      .then((q) => {
        if (!cancelled) setQuotes((prev) => ({ ...prev, ...q }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [allSymbols]);

  // Live price updates: the cache table is published to Realtime.
  useRealtimeTable<QuoteCacheRow>(
    { table: "mkt_quote_cache", channelKey: "markets-quotes" },
    {
      onUpdate: (row) => {
        if (row?.payload?.symbol)
          setQuotes((prev) => ({ ...prev, [row.payload.symbol]: row.payload }));
      },
      onInsert: (row) => {
        if (row?.payload?.symbol)
          setQuotes((prev) => ({ ...prev, [row.payload.symbol]: row.payload }));
      },
    },
  );

  async function handleAdd(symbol: string) {
    setError(null);
    if (!targetId) {
      setError("Create a watchlist first.");
      return;
    }
    try {
      await addSymbol(targetId, symbol);
      await refreshWatchlists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add symbol");
    }
  }

  async function handleRemove(watchlistId: string, symbol: string) {
    await removeSymbol(watchlistId, symbol).catch(() => {});
    await refreshWatchlists();
  }

  async function handleDeleteWatchlist(id: string) {
    await deleteWatchlist(id).catch(() => {});
    await refreshWatchlists();
  }

  async function handleNewList() {
    const name = newList.trim();
    if (!name) return;
    try {
      await createWatchlist(name, scope, scopeId);
      setNewList("");
      await refreshWatchlists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create watchlist");
    }
  }

  async function handleNewPortfolio() {
    const name = newPortfolio.trim();
    if (!name) return;
    try {
      await createPortfolio(name, scope, scopeId);
      setNewPortfolio("");
      setPortfolios(await listPortfolios(scope, scopeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create portfolio");
    }
  }

  async function handleDeletePortfolio(id: string) {
    await deletePortfolio(id).catch(() => {});
    setPortfolios(await listPortfolios(scope, scopeId));
  }

  return (
    <div className="space-y-4 p-2 sm:p-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SymbolSearch
          onPick={targetId ? handleAdd : undefined}
          placeholder={
            targetId ? "Add symbol to watchlist…" : "Search symbol…"
          }
        />
        {watchlists.length > 0 && (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
            aria-label="Target watchlist"
          >
            {watchlists.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1">
          <input
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNewList()}
            placeholder="New watchlist"
            className="w-32 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
          />
          <Button size="sm" variant="ghost" onClick={handleNewList}>
            <Plus className="h-3 w-3" /> List
          </Button>
        </div>
        <Link
          href="/modules/markets/overview"
          className="text-xs text-text-2 hover:text-text-0"
        >
          Markets ↗
        </Link>
        <Link
          href="/modules/markets/screener"
          className="text-xs text-text-2 hover:text-text-0"
        >
          Screener ↗
        </Link>
        <Link
          href="/modules/markets/alerts"
          className="text-xs text-text-2 hover:text-text-0"
        >
          Alerts ↗
        </Link>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Watchlists */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Watchlists
          </h2>
          {watchlists.length === 0 ? (
            <p className="text-xs text-text-3">
              No watchlists yet. Create one above.
            </p>
          ) : (
            watchlists.map((w) => (
              <WatchlistPanel
                key={w.id}
                watchlist={w}
                quotes={quotes}
                onRemoveSymbol={handleRemove}
                onDelete={handleDeleteWatchlist}
              />
            ))
          )}
        </div>

        {/* Portfolios */}
        <div className="space-y-3">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Portfolios
          </h2>
          <div className="flex items-center gap-1">
            <input
              value={newPortfolio}
              onChange={(e) => setNewPortfolio(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNewPortfolio()}
              placeholder="New portfolio"
              className="w-40 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
            />
            <Button size="sm" variant="ghost" onClick={handleNewPortfolio}>
              <Plus className="h-3 w-3" /> Portfolio
            </Button>
          </div>
          {portfolios.length === 0 ? (
            <p className="text-xs text-text-3">No portfolios yet.</p>
          ) : (
            <div className="overflow-hidden rounded border border-border bg-bg-1">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-border">
                  {portfolios.map((p) => (
                    <tr key={p.id} className="group hover:bg-bg-2">
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/modules/markets/portfolio/${p.id}`}
                          className="font-semibold text-text-0 hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="ml-2 text-[10px] uppercase text-text-3">
                          {p.base_currency}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => handleDeletePortfolio(p.id)}
                          className="text-[10px] uppercase text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <AttributionFooter />
    </div>
  );
}
