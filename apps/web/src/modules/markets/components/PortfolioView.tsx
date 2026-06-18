"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  changeClass,
  fmtChange,
  fmtCompact,
  fmtPct,
  fmtPrice,
} from "@/lib/markets/format";
import type { MktLotRow, MktPortfolioRow } from "@/lib/markets/db";
import type { PortfolioPerformance } from "@/lib/markets/portfolio";
import { addLot, deleteLot, getPortfolio } from "../lib/client-api";
import { AttributionFooter } from "./AttributionFooter";

interface Data {
  portfolio: MktPortfolioRow;
  lots: MktLotRow[];
  performance: PortfolioPerformance;
}

const emptyForm = {
  symbol: "",
  side: "buy" as "buy" | "sell",
  quantity: "",
  price: "",
  fees: "",
  tradeDate: "",
};

export function PortfolioView({ initial }: { initial: Data }) {
  const [data, setData] = useState<Data>(initial);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { portfolio, performance, lots } = data;
  const cur = portfolio.base_currency;

  async function refresh() {
    setData(await getPortfolio(portfolio.id));
  }

  async function submit() {
    setError(null);
    const quantity = Number(form.quantity);
    const price = Number(form.price);
    if (!form.symbol.trim()) return setError("Symbol is required");
    if (!(quantity > 0)) return setError("Quantity must be > 0");
    if (!(price >= 0)) return setError("Price must be ≥ 0");
    setBusy(true);
    try {
      await addLot(portfolio.id, {
        symbol: form.symbol.trim().toUpperCase(),
        side: form.side,
        quantity,
        price,
        fees: form.fees ? Number(form.fees) : 0,
        tradeDate: form.tradeDate || undefined,
      });
      setForm(emptyForm);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add lot");
    } finally {
      setBusy(false);
    }
  }

  async function removeLot(id: string) {
    await deleteLot(portfolio.id, id).catch(() => {});
    await refresh();
  }

  return (
    <div className="space-y-4 p-2 sm:p-3">
      {/* Header KPIs */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-lg font-semibold text-text-0">{portfolio.name}</h1>
        <div className="flex gap-6">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-text-3">Value</div>
            <div className="font-mono text-sm text-text-0">
              {fmtPrice(performance.totalMarketValue, cur)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-text-3">Unrealized</div>
            <div className={`font-mono text-sm ${changeClass(performance.totalUnrealizedPL)}`}>
              {fmtChange(performance.totalUnrealizedPL)} ({fmtPct(performance.unrealizedPct)})
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-text-3">Day</div>
            <div className={`font-mono text-sm ${changeClass(performance.totalDayChange)}`}>
              {fmtChange(performance.totalDayChange)}
            </div>
          </div>
        </div>
      </div>

      {/* Holdings */}
      <div className="overflow-x-auto rounded border border-border bg-bg-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-1 text-left font-semibold">Symbol</th>
              <th className="px-3 py-1 text-right font-semibold">Qty</th>
              <th className="px-3 py-1 text-right font-semibold">Avg Cost</th>
              <th className="px-3 py-1 text-right font-semibold">Price</th>
              <th className="px-3 py-1 text-right font-semibold">Mkt Value</th>
              <th className="px-3 py-1 text-right font-semibold">Unreal. P/L</th>
              <th className="px-3 py-1 text-right font-semibold">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {performance.positions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-3 text-text-3">
                  No open positions. Add a lot below.
                </td>
              </tr>
            ) : (
              performance.positions.map((p) => (
                <tr key={p.symbol} className="hover:bg-bg-2">
                  <td className="px-3 py-1 font-mono font-semibold text-accent">{p.symbol}</td>
                  <td className="px-3 py-1 text-right font-mono">{p.quantity}</td>
                  <td className="px-3 py-1 text-right font-mono text-text-2">
                    {fmtPrice(p.avgCost, cur)}
                  </td>
                  <td className="px-3 py-1 text-right font-mono">{fmtPrice(p.price, cur)}</td>
                  <td className="px-3 py-1 text-right font-mono">{fmtPrice(p.marketValue, cur)}</td>
                  <td className={`px-3 py-1 text-right font-mono ${changeClass(p.unrealizedPL)}`}>
                    {fmtChange(p.unrealizedPL)} ({fmtPct(p.unrealizedPct)})
                  </td>
                  <td className="px-3 py-1 text-right font-mono text-text-2">
                    {p.weight !== null ? `${p.weight.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add lot */}
      <div className="rounded border border-border bg-bg-1 p-3">
        <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
          Add lot
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            placeholder="Symbol"
            className="w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs uppercase text-text-1 placeholder:text-text-3"
          />
          <select
            value={form.side}
            onChange={(e) => setForm({ ...form, side: e.target.value as "buy" | "sell" })}
            className="rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
          <input
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="Qty"
            type="number"
            className="w-20 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
          />
          <input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="Price"
            type="number"
            className="w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
          />
          <input
            value={form.fees}
            onChange={(e) => setForm({ ...form, fees: e.target.value })}
            placeholder="Fees"
            type="number"
            className="w-20 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
          />
          <input
            value={form.tradeDate}
            onChange={(e) => setForm({ ...form, tradeDate: e.target.value })}
            type="date"
            className="rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          />
          <Button size="sm" variant="accent" onClick={submit} loading={busy}>
            Add
          </Button>
        </div>
        {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      </div>

      {/* Lot ledger */}
      {lots.length > 0 && (
        <details className="rounded border border-border bg-bg-1">
          <summary className="cursor-pointer px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Lot ledger ({lots.length})
          </summary>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-y border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
                <th className="px-3 py-1 text-left font-semibold">Date</th>
                <th className="px-3 py-1 text-left font-semibold">Symbol</th>
                <th className="px-3 py-1 text-left font-semibold">Side</th>
                <th className="px-3 py-1 text-right font-semibold">Qty</th>
                <th className="px-3 py-1 text-right font-semibold">Price</th>
                <th className="w-8 px-2 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lots.map((l) => (
                <tr key={l.id} className="group hover:bg-bg-2">
                  <td className="px-3 py-1 font-mono text-text-2">{l.trade_date}</td>
                  <td className="px-3 py-1 font-mono text-accent">{l.symbol}</td>
                  <td className="px-3 py-1 uppercase text-text-2">{l.side}</td>
                  <td className="px-3 py-1 text-right font-mono">{l.quantity}</td>
                  <td className="px-3 py-1 text-right font-mono">{fmtPrice(l.price, cur)}</td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => removeLot(l.id)}
                      className="text-[10px] uppercase text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <p className="text-[10px] text-text-3">
        Realized P/L to date: {fmtChange(performance.totalRealizedPL)} {cur} ·{" "}
        cost basis {fmtCompact(performance.totalCostBasis)}
      </p>

      <AttributionFooter />
    </div>
  );
}
