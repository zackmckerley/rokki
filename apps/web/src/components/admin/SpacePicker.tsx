"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Building2 } from "lucide-react";

export interface PickedSpace {
  space_id: string;
  slug: string;
  name: string;
}

/**
 * Same UX as UserPicker but for spaces. Reads from
 * `/api/v1/admin/spaces?q=` (built later in the same wave).
 */
export function SpacePicker({
  selected,
  onSelect,
  placeholder = "Search spaces…",
}: {
  selected: PickedSpace | null;
  onSelect: (s: PickedSpace | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedSpace[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("limit", "8");
      fetch(`/api/v1/admin/spaces?${params.toString()}`, {
        credentials: "include",
      })
        .then((r) => r.json())
        .then((body: { data?: PickedSpace[] }) => setResults(body.data ?? []))
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
        <Building2 className="h-3.5 w-3.5 text-text-3" />
        <span className="flex-1 truncate text-text-0">
          {selected.name}{" "}
          <span className="ml-1 font-mono text-[11px] text-text-3">
            /{selected.slug}
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
      {open ? (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-sm border border-border bg-bg-1 shadow-lg">
          {loading ? (
            <li className="px-3 py-2 text-xs text-text-3">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-text-3">No match.</li>
          ) : (
            results.map((s) => (
              <li key={s.space_id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(s);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-2"
                >
                  <Building2 className="h-3.5 w-3.5 text-text-3" />
                  <span className="flex-1 truncate text-text-0">{s.name}</span>
                  <span className="truncate font-mono text-[11px] text-text-3">
                    /{s.slug}
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
