"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Client-side inbox view preferences: a source filter (All / Signal / Rokki)
 * and a per-conversation hide list. Stored in localStorage so the board stays
 * the way you left it (per device) with no extra backend — the filter alone
 * lets you drop every terminal/space channel with one tap ("Signal only"), and
 * hide handles the odd one-off.
 */
export type InboxFilter = "all" | "signal" | "rokki";

const FILTER_KEY = "rokki:inbox:filter";
const HIDDEN_KEY = "rokki:inbox:hidden";

export function useInboxView() {
  const [filter, setFilterState] = useState<InboxFilter>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const f = localStorage.getItem(FILTER_KEY);
      if (f === "signal" || f === "rokki" || f === "all") setFilterState(f);
      const h = localStorage.getItem(HIDDEN_KEY);
      if (h) setHidden(new Set(JSON.parse(h) as string[]));
    } catch {
      /* ignore unavailable/corrupt storage */
    }
  }, []);

  const setFilter = useCallback((f: InboxFilter) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (s: Set<string>) => {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]));
    } catch {
      /* ignore */
    }
  };
  const hide = useCallback((id: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      n.add(id);
      persist(n);
      return n;
    });
  }, []);
  const unhide = useCallback((id: string) => {
    setHidden((prev) => {
      const n = new Set(prev);
      n.delete(id);
      persist(n);
      return n;
    });
  }, []);
  const clearHidden = useCallback(() => {
    setHidden(new Set());
    persist(new Set());
  }, []);

  return { filter, setFilter, hidden, hide, unhide, clearHidden };
}

/** Apply a source filter + hide list + (optional) search query to a thread
 *  array. `hiddenInFilter` reflects hidden conversations within the active
 *  source filter, independent of the search query. */
export function filterThreads<
  T extends { id: string; source?: "rokki" | "signal"; label?: string },
>(
  threads: T[],
  filter: InboxFilter,
  hidden: Set<string>,
  query = "",
): { visible: T[]; hiddenInFilter: number } {
  const bySource = threads.filter((t) =>
    filter === "all" ? true : (t.source ?? "rokki") === filter,
  );
  const afterHidden = bySource.filter((t) => !hidden.has(t.id));
  const q = query.trim().toLowerCase();
  const visible = q
    ? afterHidden.filter((t) => (t.label ?? "").toLowerCase().includes(q))
    : afterHidden;
  return { visible, hiddenInFilter: bySource.length - afterHidden.length };
}

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "signal", label: "Signal" },
  { key: "rokki", label: "Rokki" },
];

/** Segmented source filter + a "show hidden" affordance. */
export function InboxFilterBar({
  filter,
  setFilter,
  hiddenCount,
  onShowHidden,
  className,
}: {
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
  hiddenCount: number;
  onShowHidden?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 border-b border-border/60 px-2 py-1.5",
        className,
      )}
    >
      <div className="flex rounded-sm border border-border bg-bg-0 p-0.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-[3px] px-2 py-0.5 text-2xs font-medium transition-colors",
              filter === f.key
                ? "bg-accent text-bg-0"
                : "text-text-3 hover:text-text-1",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {hiddenCount > 0 && onShowHidden ? (
        <button
          type="button"
          onClick={onShowHidden}
          className="ml-auto text-2xs text-text-3 hover:text-text-1"
          title="Restore hidden conversations"
        >
          {hiddenCount} hidden · show
        </button>
      ) : null}
    </div>
  );
}

/** Compact search input for filtering the conversation list by name. */
export function InboxSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 border-b border-border/60 px-2 py-1",
        className,
      )}
    >
      <Search className="h-3 w-3 flex-shrink-0 text-text-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search conversations"
        className="w-full bg-transparent text-xs text-text-0 outline-none placeholder:text-text-3"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="flex-shrink-0 text-text-3 hover:text-text-1"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

/** Blue unread-count pill, iMessage-style. Renders nothing when count is 0. */
export function UnreadBadge({ count }: { count?: number }) {
  if (!count || count <= 0) return null;
  return (
    <span className="flex h-4 min-w-[1rem] flex-shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-bg-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}
