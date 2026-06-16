"use client";

import { useEffect, useState } from "react";
import { fmtCompact } from "@/lib/markets/format";
import { getFinancials } from "../lib/client-api";
import type { FinancialReport, StatementKind } from "@/lib/markets/providers/types";

const TABS: { key: StatementKind; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "balance", label: "Balance" },
  { key: "cash", label: "Cash Flow" },
];

const LABELS: Record<string, string> = {
  revenue: "Revenue",
  costOfRevenue: "Cost of Revenue",
  grossProfit: "Gross Profit",
  operatingExpenses: "Operating Expenses",
  operatingIncome: "Operating Income",
  netIncome: "Net Income",
  eps: "EPS",
  ebitda: "EBITDA",
  totalAssets: "Total Assets",
  totalCurrentAssets: "Current Assets",
  cashAndCashEquivalents: "Cash & Equivalents",
  totalLiabilities: "Total Liabilities",
  totalCurrentLiabilities: "Current Liabilities",
  totalDebt: "Total Debt",
  totalStockholdersEquity: "Shareholders' Equity",
  netCashProvidedByOperatingActivities: "Operating Cash Flow",
  netCashUsedForInvestingActivites: "Investing Cash Flow",
  netCashUsedProvidedByFinancingActivities: "Financing Cash Flow",
  freeCashFlow: "Free Cash Flow",
  capitalExpenditure: "CapEx",
  dividendsPaid: "Dividends Paid",
};

export function FinancialsTable({ symbol }: { symbol: string }) {
  const [statement, setStatement] = useState<StatementKind>("income");
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFinancials(symbol, statement)
      .then((r) => !cancelled && setReport(r))
      .catch((e) => {
        if (!cancelled) {
          setReport(null);
          setError(e instanceof Error ? e.message : "Financials unavailable");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, statement]);

  const rowKeys = report?.periods[0]
    ? Object.keys(report.periods[0].lineItems)
    : [];

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatement(t.key)}
            className={`rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              statement === t.key
                ? "bg-bg-3 text-text-0"
                : "text-text-2 hover:bg-bg-2 hover:text-text-0"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="p-3 text-xs text-text-3">Loading…</p>}
      {!loading && error && <p className="p-3 text-xs text-danger">{error}</p>}
      {!loading && !error && report && report.periods.length > 0 && (
        <div className="overflow-x-auto rounded border border-border bg-bg-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
                <th className="px-3 py-1 text-left font-semibold">Line item</th>
                {report.periods.map((p) => (
                  <th key={p.fiscalDate} className="px-3 py-1 text-right font-semibold">
                    {p.fiscalDate.slice(0, 7)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rowKeys.map((k) => (
                <tr key={k} className="hover:bg-bg-2">
                  <td className="px-3 py-1 text-text-1">{LABELS[k] ?? k}</td>
                  {report.periods.map((p) => (
                    <td key={p.fiscalDate} className="px-3 py-1 text-right font-mono text-text-2">
                      {p.lineItems[k] === null || p.lineItems[k] === undefined
                        ? "—"
                        : fmtCompact(p.lineItems[k] as number)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-1 text-[10px] text-text-3">
            {report.currency} · {report.provider}
          </p>
        </div>
      )}
    </div>
  );
}
