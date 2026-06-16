"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { changeClass, fmtChange, fmtPct, fmtPrice } from "@/lib/markets/format";
import type { Mover, MoverKind } from "@/lib/markets/providers/types";
import { getMovers, getOverview, type BoardRow } from "../lib/client-api";
import { AttributionFooter } from "./AttributionFooter";

function BoardGroup({ title, rows }: { title: string; rows: BoardRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      <header className="border-b border-border bg-bg-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {title}
      </header>
      <table className="w-full text-xs">
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.symbol} className="hover:bg-bg-2">
              <td className="px-3 py-1 text-text-1">{r.label}</td>
              <td className="px-3 py-1 text-right font-mono">{fmtPrice(r.price)}</td>
              <td className={`px-3 py-1 text-right font-mono ${changeClass(r.changePct)}`}>
                {fmtPct(r.changePct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MOVER_TABS: { key: MoverKind; label: string }[] = [
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
  { key: "active", label: "Most Active" },
];

export function MarketsBoard() {
  const [board, setBoard] = useState<Awaited<ReturnType<typeof getOverview>> | null>(
    null,
  );
  const [boardErr, setBoardErr] = useState<string | null>(null);
  const [moverKind, setMoverKind] = useState<MoverKind>("gainers");
  const [movers, setMovers] = useState<Mover[]>([]);
  const [moverErr, setMoverErr] = useState<string | null>(null);

  useEffect(() => {
    getOverview()
      .then(setBoard)
      .catch((e) => setBoardErr(e instanceof Error ? e.message : "Unavailable"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMoverErr(null);
    getMovers(moverKind)
      .then((m) => !cancelled && setMovers(m))
      .catch((e) => {
        if (!cancelled) {
          setMovers([]);
          setMoverErr(e instanceof Error ? e.message : "Movers unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [moverKind]);

  return (
    <div className="space-y-4 p-2 sm:p-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-0">Markets</h1>
        <Link href="/app/markets" className="text-xs text-text-2 hover:text-text-0">
          ← Dashboard
        </Link>
      </div>

      {boardErr && <p className="text-xs text-danger">{boardErr}</p>}
      {board && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <BoardGroup title="Indices" rows={board.indices} />
          <BoardGroup title="Sectors" rows={board.sectors} />
          <BoardGroup title="Commodities" rows={board.commodities} />
          <BoardGroup title="FX" rows={board.fx} />
        </div>
      )}

      <div>
        <div className="mb-2 flex gap-1">
          {MOVER_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setMoverKind(t.key)}
              className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                moverKind === t.key
                  ? "bg-bg-3 text-text-0"
                  : "text-text-2 hover:bg-bg-2 hover:text-text-0"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {moverErr ? (
          <p className="text-xs text-text-3">{moverErr}</p>
        ) : (
          <div className="overflow-hidden rounded border border-border bg-bg-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
                  <th className="px-3 py-1 text-left font-semibold">Symbol</th>
                  <th className="px-3 py-1 text-left font-semibold">Name</th>
                  <th className="px-3 py-1 text-right font-semibold">Price</th>
                  <th className="px-3 py-1 text-right font-semibold">Chg</th>
                  <th className="px-3 py-1 text-right font-semibold">Chg %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movers.map((m) => (
                  <tr key={m.symbol} className="hover:bg-bg-2">
                    <td className="px-3 py-1">
                      <Link
                        href={`/app/markets/quote/${encodeURIComponent(m.symbol)}`}
                        className="font-mono font-semibold text-accent hover:underline"
                      >
                        {m.symbol}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-1 text-text-2">
                      {m.name ?? "—"}
                    </td>
                    <td className="px-3 py-1 text-right font-mono">{fmtPrice(m.price)}</td>
                    <td className={`px-3 py-1 text-right font-mono ${changeClass(m.change)}`}>
                      {fmtChange(m.change)}
                    </td>
                    <td className={`px-3 py-1 text-right font-mono ${changeClass(m.changePct)}`}>
                      {fmtPct(m.changePct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AttributionFooter />
    </div>
  );
}
