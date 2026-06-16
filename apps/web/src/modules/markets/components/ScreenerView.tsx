"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { changeClass, fmtMarketCap, fmtPct, fmtPrice } from "@/lib/markets/format";
import type { Quote } from "@/lib/markets/providers/types";
import { runScreener, type ScreenerFilters } from "../lib/client-api";
import { AttributionFooter } from "./AttributionFooter";

const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function ScreenerView() {
  const [f, setF] = useState({
    minPrice: "",
    maxPrice: "",
    minChangePct: "",
    minMarketCap: "",
  });
  const [results, setResults] = useState<Quote[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ran, setRan] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    const filters: ScreenerFilters = {
      minPrice: numOrUndef(f.minPrice),
      maxPrice: numOrUndef(f.maxPrice),
      minChangePct: numOrUndef(f.minChangePct),
      minMarketCap: f.minMarketCap.trim()
        ? Number(f.minMarketCap) * 1e9
        : undefined,
    };
    try {
      const r = await runScreener(filters);
      setResults(r.results);
      setNote(r.note);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screener failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-2 sm:p-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-0">Screener</h1>
        <Link href="/app/markets" className="text-xs text-text-2 hover:text-text-0">
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded border border-border bg-bg-1 p-3">
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-3">
          Min price
          <input
            value={f.minPrice}
            onChange={(e) => setF({ ...f, minPrice: e.target.value })}
            type="number"
            className="mt-0.5 w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-3">
          Max price
          <input
            value={f.maxPrice}
            onChange={(e) => setF({ ...f, maxPrice: e.target.value })}
            type="number"
            className="mt-0.5 w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-3">
          Min day %
          <input
            value={f.minChangePct}
            onChange={(e) => setF({ ...f, minChangePct: e.target.value })}
            type="number"
            className="mt-0.5 w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-wide text-text-3">
          Min mkt cap ($B)
          <input
            value={f.minMarketCap}
            onChange={(e) => setF({ ...f, minMarketCap: e.target.value })}
            type="number"
            className="mt-0.5 w-28 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          />
        </label>
        <Button size="sm" variant="accent" onClick={run} loading={busy}>
          Run
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      {ran && (
        <div className="overflow-hidden rounded border border-border bg-bg-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
                <th className="px-3 py-1 text-left font-semibold">Symbol</th>
                <th className="px-3 py-1 text-right font-semibold">Price</th>
                <th className="px-3 py-1 text-right font-semibold">Day %</th>
                <th className="px-3 py-1 text-right font-semibold">Mkt Cap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-text-3">
                    No matches.
                  </td>
                </tr>
              ) : (
                results.map((q) => (
                  <tr key={q.symbol} className="hover:bg-bg-2">
                    <td className="px-3 py-1">
                      <Link
                        href={`/app/markets/quote/${encodeURIComponent(q.symbol)}`}
                        className="font-mono font-semibold text-accent hover:underline"
                      >
                        {q.symbol}
                      </Link>
                    </td>
                    <td className="px-3 py-1 text-right font-mono">{fmtPrice(q.price)}</td>
                    <td className={`px-3 py-1 text-right font-mono ${changeClass(q.changePct)}`}>
                      {fmtPct(q.changePct)}
                    </td>
                    <td className="px-3 py-1 text-right font-mono text-text-2">
                      {fmtMarketCap(q.marketCap)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {note && <p className="text-[10px] text-text-3">{note}</p>}

      <AttributionFooter />
    </div>
  );
}
