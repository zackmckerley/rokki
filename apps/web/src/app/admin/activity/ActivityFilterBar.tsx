"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActivityFilterState {
  actor: string | null;
  actions: string[];
  /** ISO timestamp (inclusive). */
  since: string;
  /** ISO timestamp (exclusive); null = up to now. */
  until: string | null;
  terminal: string | null;
  q: string;
}

interface FacetActor {
  actor_id: string;
  email: string;
  full_name: string | null;
}
interface FacetTerminal {
  terminal_id: string;
  ticker: string;
  name: string;
}
interface Facets {
  actors: FacetActor[];
  terminals: FacetTerminal[];
  actions: string[];
}

/**
 * Client filter bar for `/admin/activity`. State is synced into the URL
 * search params with a 250ms debounce on the free-text input — the page is
 * a server component, so updating the URL re-runs the DB query with the
 * new `WHERE` clauses.
 */
export function ActivityFilterBar({
  initial,
}: {
  initial: ActivityFilterState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [actor, setActor] = useState(initial.actor);
  const [actions, setActions] = useState<string[]>(initial.actions);
  const [since, setSince] = useState(initial.since);
  const [until, setUntil] = useState(initial.until);
  const [terminal, setTerminal] = useState(initial.terminal);
  const [q, setQ] = useState(initial.q);

  const [facets, setFacets] = useState<Facets | null>(null);

  // Lazy-load facets on first render so the dropdowns can populate.
  useEffect(() => {
    fetch("/api/v1/admin/activity/facets", { credentials: "include" })
      .then((r) => r.json())
      .then((b: { data?: Facets }) => setFacets(b.data ?? null))
      .catch(() => setFacets(null));
  }, []);

  // Apply state → URL with a debounce so typing in the free-text box
  // doesn't fire a new server render every keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const next = new URLSearchParams();
      // Preserve unrelated params (none today, but future-proof).
      for (const [k, v] of searchParams.entries()) {
        if (
          !["actor", "action", "since", "until", "terminal", "q", "before"].includes(
            k,
          )
        ) {
          next.set(k, v);
        }
      }
      if (actor) next.set("actor", actor);
      if (actions.length > 0) next.set("action", actions.join(","));
      if (since) next.set("since", since);
      if (until) next.set("until", until);
      if (terminal) next.set("terminal", terminal);
      if (q.trim()) next.set("q", q.trim());
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // We deliberately omit searchParams from the deps: it's only read for
    // preservation, and including it would re-run on our own router.replace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, actions, since, until, terminal, q, pathname, router]);

  const filtersActive =
    Boolean(actor) ||
    actions.length > 0 ||
    Boolean(until) ||
    Boolean(terminal) ||
    q.trim().length > 0 ||
    !isDefaultSince(since);

  function clearAll() {
    setActor(null);
    setActions([]);
    setSince(defaultSince());
    setUntil(null);
    setTerminal(null);
    setQ("");
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-bg-1 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <ActorPicker
          value={actor}
          onChange={setActor}
          actors={facets?.actors ?? []}
        />
        <ActionPicker
          values={actions}
          onChange={setActions}
          options={facets?.actions ?? []}
        />
        <TerminalPicker
          value={terminal}
          onChange={setTerminal}
          terminals={facets?.terminals ?? []}
        />
        <DateInput
          label="Since"
          value={since}
          onChange={(v) => setSince(v ?? defaultSince())}
        />
        <DateInput label="Until" value={until} onChange={setUntil} />
        <div className="flex flex-1 min-w-[240px] items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search action + payload…"
            className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            aria-label="Free-text search"
          />
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1.5 font-mono text-[11px] uppercase tracking-wide text-text-2 hover:bg-bg-3 hover:text-text-0"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Actor — searchable dropdown over the facets list.                     */
/* -------------------------------------------------------------------- */

function ActorPicker({
  value,
  onChange,
  actors,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  actors: FacetActor[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = actors.find((a) => a.actor_id === value) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return actors;
    return actors.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.full_name ?? "").toLowerCase().includes(q) ||
        a.actor_id.toLowerCase().includes(q),
    );
  }, [actors, search]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border bg-bg-0 px-2 py-1.5 text-sm",
          value ? "border-accent text-text-0" : "border-border text-text-2",
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
          Actor
        </span>
        <span className="max-w-[160px] truncate">
          {selected
            ? selected.email || selected.full_name || selected.actor_id.slice(0, 8)
            : "any"}
        </span>
        <ChevronDown className="h-3 w-3 text-text-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-sm border border-border bg-bg-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3 w-3 text-text-3" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter actors…"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text-3 hover:bg-bg-2"
              >
                Any actor
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-text-3">No match.</li>
            ) : (
              filtered.map((a) => (
                <li key={a.actor_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(a.actor_id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-2",
                      value === a.actor_id && "bg-bg-2",
                    )}
                  >
                    <span className="truncate text-text-0">
                      {a.full_name ?? a.email}
                    </span>
                    <span className="truncate font-mono text-[11px] text-text-3">
                      {a.email || a.actor_id.slice(0, 8)}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Action — multi-select chips.                                          */
/* -------------------------------------------------------------------- */

function ActionPicker({
  values,
  onChange,
  options,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle(opt: string) {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border bg-bg-0 px-2 py-1.5 text-sm",
          values.length > 0
            ? "border-accent text-text-0"
            : "border-border text-text-2",
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
          Action
        </span>
        <span>
          {values.length === 0
            ? "any"
            : values.length === 1
              ? values[0]
              : `${values.length} selected`}
        </span>
        <ChevronDown className="h-3 w-3 text-text-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-sm border border-border bg-bg-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3 w-3 text-text-3" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter actions…"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            />
            {values.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-[10px] uppercase text-text-3 hover:text-text-0"
              >
                clear
              </button>
            ) : null}
          </div>
          <ul className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-text-3">No match.</li>
            ) : (
              filtered.map((opt) => (
                <li key={opt}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-bg-2">
                    <input
                      type="checkbox"
                      checked={values.includes(opt)}
                      onChange={() => toggle(opt)}
                      className="h-3.5 w-3.5 accent-accent"
                    />
                    <span className="font-mono text-xs text-text-0">{opt}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Terminal — searchable dropdown over the facets list.                  */
/* -------------------------------------------------------------------- */

function TerminalPicker({
  value,
  onChange,
  terminals,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  terminals: FacetTerminal[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const selected = terminals.find((t) => t.terminal_id === value) ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return terminals;
    return terminals.filter(
      (t) =>
        t.ticker.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }, [terminals, search]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm border bg-bg-0 px-2 py-1.5 text-sm",
          value ? "border-accent text-text-0" : "border-border text-text-2",
        )}
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
          Terminal
        </span>
        <span className="max-w-[120px] truncate font-mono">
          {selected ? selected.ticker : "any"}
        </span>
        <ChevronDown className="h-3 w-3 text-text-3" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-sm border border-border bg-bg-1 shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
            <Search className="h-3 w-3 text-text-3" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter terminals…"
              className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-text-3 hover:bg-bg-2"
              >
                Any terminal
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-text-3">No match.</li>
            ) : (
              filtered.map((t) => (
                <li key={t.terminal_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t.terminal_id);
                      setOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg-2",
                      value === t.terminal_id && "bg-bg-2",
                    )}
                  >
                    <span className="font-mono text-accent">{t.ticker}</span>
                    <span className="truncate text-xs text-text-2">
                      {t.name}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* Date input — converts <input type="datetime-local"> ↔ ISO.            */
/* -------------------------------------------------------------------- */

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const local = value ? toLocalInput(value) : "";
  return (
    <label className="flex items-center gap-1 rounded-sm border border-border bg-bg-0 px-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <input
        type="datetime-local"
        value={local}
        onChange={(e) =>
          onChange(e.target.value ? new Date(e.target.value).toISOString() : null)
        }
        className="bg-transparent font-mono text-xs text-text-0 outline-none"
      />
    </label>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function defaultSince(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function isDefaultSince(iso: string): boolean {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return false;
  // Within 60s of "7 days ago" — generated default + a small clock skew.
  return Math.abs(Date.now() - ms - 7 * 24 * 60 * 60 * 1000) < 60_000;
}
