"use client";

import { useEffect, useRef, useState } from "react";
import { Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickedUser {
  user_id: string;
  email: string;
  full_name: string | null;
}

/**
 * Autocomplete search that hits `/api/v1/admin/users?q=` and lets the
 * admin pick a user. Used in Create-Space (owner), Add-to-Space,
 * Transfer-Ownership, Emergency Access, etc.
 *
 * Debounces by 200ms. Keeps results scoped to active users only — the
 * endpoint filters out deleted/suspended.
 */
export function UserPicker({
  selected,
  onSelect,
  placeholder = "Search by email or name…",
  autoFocus = false,
}: {
  selected: PickedUser | null;
  onSelect: (u: PickedUser | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(
        `/api/v1/admin/users?q=${encodeURIComponent(query.trim())}&limit=8`,
        { credentials: "include" },
      )
        .then((r) => r.json())
        .then((body: { data?: PickedUser[] }) => {
          setResults(body.data ?? []);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm">
        <User className="h-3.5 w-3.5 text-text-3" />
        <span className="flex-1 truncate text-text-0">
          {selected.full_name ?? selected.email}{" "}
          <span className="ml-1 font-mono text-[11px] text-text-3">
            {selected.email}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="text-[11px] text-text-3 hover:text-text-0"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5 focus-within:border-border-focus">
        <Search className="h-3.5 w-3.5 text-text-3" />
        <input
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
        />
      </div>
      {open && (query || results.length > 0) ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-sm border border-border bg-bg-1 shadow-lg">
          {loading ? (
            <li className="px-3 py-2 text-xs text-text-3">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-text-3">No match.</li>
          ) : (
            results.map((u) => (
              <li key={u.user_id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(u);
                    setQuery("");
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-2",
                  )}
                >
                  <User className="h-3.5 w-3.5 text-text-3" />
                  <span className="flex-1 truncate text-text-0">
                    {u.full_name ?? u.email}
                  </span>
                  <span className="truncate font-mono text-[11px] text-text-3">
                    {u.email}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
