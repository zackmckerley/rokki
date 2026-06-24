"use client";

import { useEffect, useState } from "react";
import { changeClass, fmtPct } from "@/lib/markets/format";
import type { RatesBoard } from "@/lib/markets/rates";
import { getOverview, getRatesBoard, type BoardRow } from "../lib/client-api";

/**
 * Live market-context band for the top of the Markets module dashboard — the
 * major indices plus a few benchmark rates, so the landing page opens with
 * actual market context instead of just the viewer's (possibly empty)
 * watchlists. Reuses the same overview + FRED rates endpoints as the
 * dashboard panel. Hides itself entirely when neither feed returns anything.
 */
export function MarketContextBand() {
  const [indices, setIndices] = useState<BoardRow[]>([]);
  const [rates, setRates] = useState<RatesBoard | null>(null);

  useEffect(() => {
    let alive = true;
    getOverview()
      .then((b) => {
        if (alive) setIndices(b.indices);
      })
      .catch(() => {
        /* feed down → band shrinks or hides */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getRatesBoard()
      .then((r) => {
        if (alive && r.configured) setRates(r.board);
      })
      .catch(() => {
        /* no FRED key → rates omitted */
      });
    return () => {
      alive = false;
    };
  }, []);

  const rateRows = rates
    ? [...rates.treasury, ...rates.reference].filter((r) => r.value !== null).slice(0, 6)
    : [];

  if (indices.length === 0 && rateRows.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-border bg-bg-1 px-3 py-2 text-xs">
      {indices.map((i) => (
        <span key={i.symbol} className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-text-2">{i.label}</span>
          <span className={`font-mono tabular-nums ${changeClass(i.changePct)}`}>
            {i.changePct != null ? fmtPct(i.changePct) : "—"}
          </span>
        </span>
      ))}
      {rateRows.length > 0 ? (
        <span className="mx-1 hidden h-3 w-px bg-border sm:inline-block" aria-hidden="true" />
      ) : null}
      {rateRows.map((r) => (
        <span key={r.id} className="flex items-baseline gap-1.5 whitespace-nowrap text-text-2">
          <span className="uppercase tracking-wide text-text-3">{r.label}</span>
          <span className="font-mono tabular-nums text-text-1">{r.value!.toFixed(2)}</span>
        </span>
      ))}
    </div>
  );
}
