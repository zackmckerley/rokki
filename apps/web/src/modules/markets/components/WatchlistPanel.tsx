"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { fmtChange, fmtPct, fmtPrice, changeClass } from "@/lib/markets/format";
import type { Quote } from "@/lib/markets/providers/types";
import type { WatchlistWithSymbols } from "../lib/client-api";

/**
 * A single watchlist rendered as a dense quote table. Quotes come from the
 * parent (batched + live-updated); this component is presentational plus
 * add/remove affordances.
 */
export function WatchlistPanel({
  watchlist,
  quotes,
  onRemoveSymbol,
  onDelete,
}: {
  watchlist: WatchlistWithSymbols;
  quotes: Record<string, Quote>;
  onRemoveSymbol: (watchlistId: string, symbol: string) => void;
  onDelete: (watchlistId: string) => void;
}) {
  const symbols = [...watchlist.symbols].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5">
        <h3 className="text-xs font-semibold text-text-0">{watchlist.name}</h3>
        <button
          onClick={() => onDelete(watchlist.id)}
          className="text-[10px] uppercase tracking-wide text-text-3 hover:text-danger"
          aria-label={`Delete ${watchlist.name}`}
        >
          Delete
        </button>
      </header>

      {symbols.length === 0 ? (
        <p className="px-3 py-3 text-xs text-text-3">
          No symbols yet. Use search above to add one.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-1 text-left font-semibold">Symbol</th>
              <th className="px-3 py-1 text-right font-semibold">Price</th>
              <th className="px-3 py-1 text-right font-semibold">Chg</th>
              <th className="px-3 py-1 text-right font-semibold">Chg %</th>
              <th className="w-8 px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {symbols.map((s) => {
              const q = quotes[s.symbol];
              return (
                <tr key={s.id} className="group hover:bg-bg-2">
                  <td className="px-3 py-1">
                    <Link
                      href={`/modules/markets/quote/${encodeURIComponent(s.symbol)}`}
                      className="font-mono font-semibold text-accent hover:underline"
                    >
                      {s.symbol}
                    </Link>
                  </td>
                  <td className="px-3 py-1 text-right font-mono">
                    {q ? fmtPrice(q.price, q.currency) : "—"}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono ${changeClass(q?.change)}`}>
                    {q ? fmtChange(q.change) : "—"}
                  </td>
                  <td className={`px-3 py-1 text-right font-mono ${changeClass(q?.changePct)}`}>
                    {q ? fmtPct(q.changePct) : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => onRemoveSymbol(watchlist.id, s.symbol)}
                      className="text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                      aria-label={`Remove ${s.symbol}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
