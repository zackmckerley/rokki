"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown, Focus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashSpace, DashTerminal } from "@/lib/dashboard-queries";

interface Props {
  terminals: DashTerminal[];
  spaces: DashSpace[];
  /**
   * The currently active scope, as resolved by the server. `null`
   * means "all terminals" — equivalent to no `?focus=` param.
   */
  scopeTerminalId: string | null;
}

/**
 * Dashboard-level terminal scope filter. Lets the user focus the
 * Week card, Tasks card, and activity Ticker on a single terminal
 * without leaving the dashboard.
 *
 * Single-select — radio semantics. "All terminals" is the default
 * and corresponds to no `?focus=` param. Picking a terminal pushes
 * `?focus=<terminalId>`, which the server reads and threads down to
 * every streamed slot.
 *
 * UI mirrors the calendar's SourceFilter (Filter + ChevronDown
 * button with a count chip) but renames it "Focus" so it reads as
 * a scope picker rather than a multi-select source toggle.
 */
export function TerminalScopeFilter({ terminals, spaces, scopeTerminalId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => terminals.find((t) => t.id === scopeTerminalId) ?? null,
    [terminals, scopeTerminalId],
  );

  // Close on outside click. Same pattern the calendar's SourceFilter uses.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Auto-focus the search input on open so power users can type-to-filter
  // without grabbing the mouse.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function navigate(terminalId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (terminalId) {
      params.set("focus", terminalId);
    } else {
      params.delete("focus");
    }
    router.push(`/${params.size ? `?${params.toString()}` : ""}`);
    setOpen(false);
    setQuery("");
  }

  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return terminals;
    return terminals.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.ticker.toLowerCase().includes(q),
    );
  }, [terminals, query]);

  // Group by space — matches the explorer rail's mental model so the
  // popover feels like the rail collapsed into a menu.
  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      { name: string; items: DashTerminal[] }
    >();
    for (const t of filtered) {
      const space = spaceById.get(t.space_id);
      const spaceName = space?.name ?? "Unknown space";
      const g = groups.get(t.space_id) ?? { name: spaceName, items: [] };
      g.items.push(t);
      groups.set(t.space_id, g);
    }
    return Array.from(groups.values());
  }, [filtered, spaceById]);

  // Don't render the filter at all if the user has no terminals yet —
  // there's nothing to focus on.
  if (terminals.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title={
          selected
            ? `Dashboard focused on ${selected.ticker} — click to change`
            : "Focus the dashboard on a single terminal"
        }
        className={cn(
          "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
          selected
            ? "border-accent/40 bg-accent-subtle text-text-0"
            : open
              ? "border-border bg-bg-3 text-text-0"
              : "border-border bg-bg-2 text-text-1 hover:bg-bg-3 hover:text-text-0",
        )}
      >
        <Focus className="h-3 w-3" aria-hidden="true" />
        <span>Focus</span>
        {selected ? (
          <span className="rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-accent">
            {selected.ticker}
          </span>
        ) : (
          <span className="rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-text-3">
            All
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Focus dashboard on a terminal"
          className="absolute right-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <span>Dashboard scope</span>
            <span className="font-mono text-text-2">
              {selected ? `1 / ${terminals.length}` : `All · ${terminals.length}`}
            </span>
          </header>

          {/* Search — type-to-filter on name or ticker. Hidden when
              there are few terminals because the search bar takes a
              row away from the list and a hash of terminals isn't
              worth filtering. */}
          {terminals.length > 6 ? (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg-1 px-2 py-1.5">
              <Search
                className="h-3 w-3 flex-shrink-0 text-text-3"
                aria-hidden="true"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter terminals…"
                aria-label="Filter terminals"
                className="flex-1 bg-transparent text-xs text-text-0 placeholder:text-text-3 outline-none"
              />
            </div>
          ) : null}

          <ul className="max-h-80 overflow-y-auto py-1 text-xs">
            {/* "All terminals" pseudo-option — clears the focus. */}
            <li>
              <button
                type="button"
                role="option"
                aria-selected={scopeTerminalId === null}
                onClick={() => navigate(null)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-2",
                  scopeTerminalId === null ? "text-text-0" : "text-text-1",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                    scopeTerminalId === null
                      ? "border-accent bg-accent text-bg-0"
                      : "border-border bg-bg-0",
                  )}
                  aria-hidden="true"
                >
                  {scopeTerminalId === null ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : null}
                </span>
                <span className="flex-1 font-semibold">All terminals</span>
                <span className="font-mono text-[10px] text-text-3">
                  {terminals.length}
                </span>
              </button>
            </li>

            {grouped.length === 0 ? (
              <li>
                <p className="px-3 py-3 text-[11px] text-text-3">
                  No terminals match{" "}
                  <span className="font-mono text-text-2">
                    &ldquo;{query}&rdquo;
                  </span>
                  .
                </p>
              </li>
            ) : (
              grouped.map((g) => (
                <li
                  key={g.name}
                  className="border-t border-border/60 first:border-t-0"
                >
                  <p className="px-3 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-text-3">
                    {g.name}
                  </p>
                  <ul role="none" className="py-1">
                    {g.items.map((t) => {
                      const isSelected = t.id === scopeTerminalId;
                      return (
                        <li key={t.id} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => navigate(t.id)}
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-2",
                              isSelected
                                ? "bg-accent-subtle text-text-0"
                                : "text-text-1",
                            )}
                          >
                            {/* Radio-style indicator — paired with the
                                "All terminals" option above, it reads
                                as "exactly one selected". */}
                            <span
                              className={cn(
                                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border",
                                isSelected
                                  ? "border-accent bg-accent text-bg-0"
                                  : "border-border bg-bg-0",
                              )}
                              aria-hidden="true"
                            >
                              {isSelected ? (
                                <Check className="h-2.5 w-2.5" />
                              ) : null}
                            </span>
                            <span className="w-14 flex-shrink-0 truncate font-mono text-[10px] text-accent">
                              {t.ticker}
                            </span>
                            <span className="flex-1 truncate">{t.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
