"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { TrendingUp, ChevronUp, ChevronDown } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { fmtPrice, fmtPct, changeClass } from "@/lib/markets/format";
import type { Quote } from "@/lib/markets/providers/types";
import {
  WATCHING_ID,
  watchingList,
  type MarketsList,
} from "@/lib/markets/watching";
import { getQuotes, listWatchlists } from "@/modules/markets/lib/client-api";

/** Index/ETF pulse shown at the top of the card (free-feed-friendly proxies). */
const INDICES = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq" },
  { symbol: "DIA", label: "Dow" },
];

interface QuoteCacheRow {
  symbol: string;
  payload: Quote;
}

/**
 * Dashboard Markets panel — a scale-adaptive, live-quote terminal that renders
 * inline on the dashboard (no need to open the module). The built-in "Watching"
 * list (Zack's tracked instruments) leads; the viewer's own watchlists follow
 * in the picker. An indices pulse strip sits on top; below it the active list
 * streams live quotes. Density adapts to the panel's width: tight
 * (symbol · price · %chg) when narrow, a fuller table (+ company name) when
 * wide. The full board (charts, portfolios, screener, news, TV) is one maximize
 * away at /modules/markets.
 */
export function MarketsCard() {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [userLists, setUserLists] = useState<MarketsList[]>([]);
  const [activeId, setActiveId] = useState<string>(WATCHING_ID);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  // The built-in Watching list always leads; the viewer's own watchlists follow.
  const lists = useMemo(() => [watchingList(), ...userLists], [userLists]);
  const active = lists.find((l) => l.id === activeId) ?? lists[0];
  const wide = width >= 460;

  useEffect(() => {
    let alive = true;
    listWatchlists("user")
      .then((w) => {
        if (!alive) return;
        setUserLists(
          w.map((wl) => ({
            id: wl.id,
            name: wl.name,
            symbols: wl.symbols.map((s) => ({ symbol: s.symbol })),
          })),
        );
      })
      .catch(() => {
        /* unconfigured / no access → just the built-in Watching list */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Quote every symbol on screen: the indices strip + the active list.
  const symbols = [
    ...INDICES.map((i) => i.symbol),
    ...(active?.symbols.map((s) => s.symbol) ?? []),
  ];
  const symbolsKey = symbols.join(",");
  useEffect(() => {
    if (symbols.length === 0) return;
    let cancelled = false;
    getQuotes(symbols)
      .then((q) => {
        if (!cancelled) setQuotes((prev) => ({ ...prev, ...q }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // Stream live updates from the published quote cache.
  useRealtimeTable<QuoteCacheRow>(
    { table: "mkt_quote_cache", channelKey: "dash:markets-quotes" },
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

  return (
    <DashboardCard
      title="Markets"
      count={active?.symbols.length || undefined}
      expandHref="/modules/markets"
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
      headerRight={
        lists.length > 1 ? (
          <select
            value={active?.id ?? WATCHING_ID}
            onChange={(e) => setActiveId(e.target.value)}
            aria-label="Watchlist"
            className="rounded-sm border border-border bg-bg-0 px-1.5 py-0.5 text-2xs text-text-1 outline-none focus:border-border-focus"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        <IndicesStrip quotes={quotes} />
        {!active || active.symbols.length === 0 ? (
          <Empty />
        ) : (
          <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
            {active.symbols.map((s) => (
              <QuoteRow
                key={s.symbol}
                symbol={s.symbol}
                label={s.label}
                quote={quotes[s.symbol]}
                wide={wide}
              />
            ))}
          </ul>
        )}
      </div>
    </DashboardCard>
  );
}

/** The always-on index pulse: S&P / Nasdaq / Dow with % change. */
function IndicesStrip({ quotes }: { quotes: Record<string, Quote> }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-3 overflow-x-auto border-b border-border/40 px-3 py-1.5">
      {INDICES.map((idx) => {
        const q = quotes[idx.symbol];
        return (
          <div key={idx.symbol} className="flex items-baseline gap-1.5">
            <span className="text-2xs font-medium text-text-2">{idx.label}</span>
            <span className={cnPct(q)}>{q ? fmtPct(q.changePct) : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

/** One list row — density adapts to the panel width. */
function QuoteRow({
  symbol,
  label,
  quote,
  wide,
}: {
  symbol: string;
  label?: string;
  quote: Quote | undefined;
  wide: boolean;
}) {
  const up = (quote?.changePct ?? 0) >= 0;
  return (
    <li>
      <Link
        href={`/modules/markets/quote/${encodeURIComponent(symbol)}`}
        className="flex items-center gap-2 px-3 py-[var(--rk-row-py)] hover:bg-bg-2"
      >
        <span className="w-16 flex-shrink-0 truncate font-mono text-xs font-semibold text-text-0">
          {symbol}
        </span>
        {wide ? (
          <span className="flex-1 truncate text-2xs text-text-3">
            {label ?? quote?.name ?? ""}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <span className="font-mono text-xs tabular-nums text-text-0">
          {quote ? fmtPrice(quote.price, quote.currency) : "—"}
        </span>
        <span
          className={`flex w-16 items-center justify-end gap-0.5 font-mono text-2xs tabular-nums ${
            quote ? changeClass(quote.changePct) : "text-text-3"
          }`}
        >
          {quote ? (
            up ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )
          ) : null}
          {quote ? fmtPct(quote.changePct) : "—"}
        </span>
      </Link>
    </li>
  );
}

function cnPct(q: Quote | undefined): string {
  return `font-mono text-2xs tabular-nums ${q ? changeClass(q.changePct) : "text-text-3"}`;
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <TrendingUp className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">This watchlist is empty.</p>
      <Link
        href="/modules/markets"
        className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 hover:bg-bg-3"
      >
        Open Markets
      </Link>
    </div>
  );
}

/** Measure an element's width via ResizeObserver (SSR-safe; 0 until mounted). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
