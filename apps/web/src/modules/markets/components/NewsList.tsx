"use client";

import { useEffect, useState } from "react";
import { fmtRelative } from "@/lib/markets/format";
import { getNews } from "../lib/client-api";
import type { NewsItem } from "@/lib/markets/providers/types";

export function NewsList({ symbol }: { symbol: string }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getNews(symbol, 14)
      .then((i) => !cancelled && setItems(i))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "No news"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) return <p className="p-3 text-xs text-text-3">Loading news…</p>;
  if (error) return <p className="p-3 text-xs text-danger">{error}</p>;
  if (items.length === 0)
    return <p className="p-3 text-xs text-text-3">No recent news.</p>;

  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id} className="px-3 py-2 hover:bg-bg-2">
          <a
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <p className="text-xs font-medium text-text-0">{n.headline}</p>
            <p className="mt-0.5 text-[10px] text-text-3">
              {n.source} · {fmtRelative(n.datetime)}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}
