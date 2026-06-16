"use client";

import { useEffect, useState } from "react";
import {
  changeClass,
  fmtChange,
  fmtCompact,
  fmtMarketCap,
  fmtPct,
  fmtPrice,
} from "@/lib/markets/format";
import type { CompanyProfile, Quote } from "@/lib/markets/providers/types";
import { getQuote } from "../lib/client-api";
import { PriceChart } from "./PriceChart";
import { NewsList } from "./NewsList";
import { FinancialsTable } from "./FinancialsTable";
import { AttributionFooter } from "./AttributionFooter";

type Tab = "summary" | "chart" | "news" | "financials";
const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "chart", label: "Chart" },
  { key: "news", label: "News" },
  { key: "financials", label: "Financials" },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col border-b border-border py-1">
      <span className="text-[10px] uppercase tracking-wide text-text-3">{label}</span>
      <span className="font-mono text-xs text-text-1">{value}</span>
    </div>
  );
}

export function QuoteView({
  symbol,
  initialQuote,
  profile,
}: {
  symbol: string;
  initialQuote: Quote | null;
  profile: CompanyProfile | null;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [quote, setQuote] = useState<Quote | null>(initialQuote);

  useEffect(() => {
    let cancelled = false;
    getQuote(symbol)
      .then((r) => !cancelled && setQuote(r.quote))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="space-y-3 p-2 sm:p-3">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-mono text-xl font-bold text-text-0">{symbol}</h1>
        {(quote?.name || profile?.name) && (
          <span className="text-sm text-text-2">{quote?.name ?? profile?.name}</span>
        )}
        {profile?.exchange && (
          <span className="text-[10px] uppercase text-text-3">{profile.exchange}</span>
        )}
        <div className="ml-auto flex items-baseline gap-2">
          <span className="font-mono text-xl text-text-0">
            {fmtPrice(quote?.price, quote?.currency)}
          </span>
          <span className={`font-mono text-sm ${changeClass(quote?.change)}`}>
            {fmtChange(quote?.change)} ({fmtPct(quote?.changePct)})
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              tab === t.key
                ? "border-accent text-text-0"
                : "border-transparent text-text-2 hover:text-text-0"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-2 gap-x-6">
            <Stat label="Open" value={fmtPrice(quote?.open, quote?.currency)} />
            <Stat label="Prev Close" value={fmtPrice(quote?.prevClose, quote?.currency)} />
            <Stat label="Day High" value={fmtPrice(quote?.high, quote?.currency)} />
            <Stat label="Day Low" value={fmtPrice(quote?.low, quote?.currency)} />
            <Stat label="52W High" value={fmtPrice(quote?.week52High, quote?.currency)} />
            <Stat label="52W Low" value={fmtPrice(quote?.week52Low, quote?.currency)} />
            <Stat label="Volume" value={fmtCompact(quote?.volume)} />
            <Stat label="Market Cap" value={fmtMarketCap(quote?.marketCap ?? profile?.marketCap)} />
            <Stat label="Sector" value={profile?.sector ?? "—"} />
            <Stat label="Country" value={profile?.country ?? "—"} />
          </div>
          <div className="space-y-2 text-xs text-text-2">
            {profile?.description ? (
              <p>{profile.description}</p>
            ) : (
              <p className="text-text-3">No company profile available.</p>
            )}
            {profile?.weburl && (
              <a
                href={profile.weburl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info hover:underline"
              >
                {profile.weburl}
              </a>
            )}
          </div>
        </div>
      )}

      {tab === "chart" && <PriceChart symbol={symbol} />}
      {tab === "news" && (
        <div className="overflow-hidden rounded border border-border bg-bg-1">
          <NewsList symbol={symbol} />
        </div>
      )}
      {tab === "financials" && <FinancialsTable symbol={symbol} />}

      <AttributionFooter />
    </div>
  );
}
