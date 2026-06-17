"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { MktAlertRow } from "@/lib/markets/db";
import {
  createAlert,
  deleteAlert,
  updateAlert,
} from "../lib/client-api";
import { AttributionFooter } from "./AttributionFooter";

const CONDITIONS: { key: MktAlertRow["condition"]; label: string }[] = [
  { key: "price_above", label: "Price above" },
  { key: "price_below", label: "Price below" },
  { key: "pct_up", label: "Day % above" },
  { key: "pct_down", label: "Day % below" },
];

export function AlertsView({ initial }: { initial: MktAlertRow[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [symbol, setSymbol] = useState("");
  const [condition, setCondition] = useState<MktAlertRow["condition"]>("price_above");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    const t = Number(threshold);
    if (!symbol.trim()) return setError("Symbol is required");
    if (Number.isNaN(t)) return setError("Threshold must be a number");
    setBusy(true);
    try {
      const a = await createAlert(symbol.trim().toUpperCase(), condition, t);
      setAlerts((prev) => [a, ...prev]);
      setSymbol("");
      setThreshold("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create alert");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: MktAlertRow) {
    const updated = await updateAlert(a.id, { active: !a.active }).catch(() => null);
    if (updated) setAlerts((prev) => prev.map((x) => (x.id === a.id ? updated : x)));
  }

  async function remove(id: string) {
    await deleteAlert(id).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  function label(c: MktAlertRow["condition"]) {
    return CONDITIONS.find((x) => x.key === c)?.label ?? c;
  }

  return (
    <div className="space-y-4 p-2 sm:p-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-text-0">Price Alerts</h1>
        <Link href="/modules/markets" className="text-xs text-text-2 hover:text-text-0">
          ← Dashboard
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded border border-border bg-bg-1 p-3">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol"
          className="w-24 rounded border border-border bg-bg-2 px-2 py-1 text-xs uppercase text-text-1 placeholder:text-text-3"
        />
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as MktAlertRow["condition"])}
          className="rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
        >
          {CONDITIONS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Threshold"
          type="number"
          className="w-28 rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3"
        />
        <Button size="sm" variant="accent" onClick={add} loading={busy}>
          Add alert
        </Button>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-1 text-left font-semibold">Symbol</th>
              <th className="px-3 py-1 text-left font-semibold">Condition</th>
              <th className="px-3 py-1 text-right font-semibold">Threshold</th>
              <th className="px-3 py-1 text-center font-semibold">Status</th>
              <th className="w-16 px-2 py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {alerts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-3 text-text-3">
                  No alerts. Create one above — they’re evaluated by a scheduled job
                  and notify you in Rokki when tripped.
                </td>
              </tr>
            ) : (
              alerts.map((a) => (
                <tr key={a.id} className="group hover:bg-bg-2">
                  <td className="px-3 py-1 font-mono font-semibold text-accent">{a.symbol}</td>
                  <td className="px-3 py-1 text-text-1">{label(a.condition)}</td>
                  <td className="px-3 py-1 text-right font-mono">{a.threshold}</td>
                  <td className="px-3 py-1 text-center">
                    <button
                      onClick={() => toggle(a)}
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        a.active ? "text-success" : "text-text-3"
                      }`}
                    >
                      {a.active ? "Active" : "Paused"}
                    </button>
                  </td>
                  <td className="px-2 py-1 text-right">
                    <button
                      onClick={() => remove(a.id)}
                      className="text-[10px] uppercase text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      Del
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AttributionFooter />
    </div>
  );
}
