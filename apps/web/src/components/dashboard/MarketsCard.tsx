"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import {
  listWatchlists,
  type WatchlistWithSymbols,
} from "@/modules/markets/lib/client-api";

/**
 * Dashboard Markets panel. Shows the viewer's personal watchlists with their
 * symbol counts; the full board (quotes, charts, portfolios, screener) lives
 * at /modules/markets. Intentionally quote-free so it renders fine before the
 * market-data API keys are configured.
 */
export function MarketsCard() {
  const [watchlists, setWatchlists] = useState<WatchlistWithSymbols[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listWatchlists("user")
      .then((w) => {
        if (active) setWatchlists(w);
      })
      .catch(() => {
        /* unconfigured / no access → empty state */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <DashboardCard
      title="Markets"
      count={watchlists.length || undefined}
      expandHref="/modules/markets"
    >
      {loading && watchlists.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : watchlists.length === 0 ? (
        <Empty />
      ) : (
        <ul className="divide-y divide-border/40 text-sm">
          {watchlists.slice(0, 8).map((w) => (
            <li key={w.id}>
              <Link
                href="/modules/markets"
                className="flex items-center gap-2 px-3 py-[var(--rk-row-py)] hover:bg-bg-2"
              >
                <TrendingUp className="h-3 w-3 flex-shrink-0 text-success" />
                <span className="flex-1 truncate text-text-0">{w.name}</span>
                <span className="font-mono text-2xs text-text-3">
                  {w.symbols.length} {w.symbols.length === 1 ? "symbol" : "symbols"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <TrendingUp className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">No watchlists yet.</p>
      <p className="text-xs text-text-3">
        Track quotes, charts, portfolios, and alerts.
      </p>
      <Link
        href="/modules/markets"
        className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 hover:bg-bg-3"
      >
        Open Markets
      </Link>
    </div>
  );
}
