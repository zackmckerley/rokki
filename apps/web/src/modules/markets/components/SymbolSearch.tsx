"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { searchSymbols } from "../lib/client-api";
import type { SymbolMatch } from "@/lib/markets/providers/types";

/**
 * Debounced symbol search box. Selecting a result navigates to the (universal)
 * quote page. Used in the dashboard header and as a quick lookup.
 */
export function SymbolSearch({
  onPick,
  placeholder = "Search symbol or company…",
  autoFocus = false,
}: {
  onPick?: (symbol: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchSymbols(q.trim())
        .then((r) => {
          setResults(r);
          setOpen(true);
          setActive(0);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(symbol: string) {
    setOpen(false);
    setQ("");
    setResults([]);
    if (onPick) onPick(symbol);
    else router.push(`/modules/markets/quote/${encodeURIComponent(symbol)}`);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[active];
      if (r) pick(r.symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded border border-border bg-bg-2 px-2 py-1">
        <Search className="h-3.5 w-3.5 text-text-3" />
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs text-text-0 placeholder:text-text-3 focus:outline-none"
          aria-label="Search symbols"
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded border border-border bg-bg-1 shadow-lg">
          {results.map((r, i) => (
            <li key={`${r.symbol}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r.symbol);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-xs ${
                  i === active ? "bg-bg-2" : "hover:bg-bg-2"
                }`}
              >
                <span className="font-mono font-semibold text-accent">
                  {r.symbol}
                </span>
                <span className="truncate text-text-2">{r.name}</span>
                <span className="shrink-0 text-[10px] uppercase text-text-3">
                  {r.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
