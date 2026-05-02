"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import type { DashSpace, DashTerminal } from "@/lib/dashboard-queries";
import { AccountBlock } from "@/components/AccountBlock";
import {
  COLLAPSED_SPACES_KEY,
  readRecentTerminals,
  type RecentTerminal,
} from "@/lib/recent-terminals";

interface ExplorerRailProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  toolCount: number;
  userEmail: string;
  userName: string;
  isPlatformAdmin: boolean;
  canCreateSpace: boolean;
}

/**
 * The left-rail Explorer. Three regions, top to bottom:
 *   - Search/filter input (sticky to the top of the scroll region)
 *   - Recently-viewed terminals — local-only ring of the last 5 the
 *     user opened, click to jump.
 *   - Two-level tree of spaces → their terminals. Collapse state
 *     persists per-device via localStorage.
 *
 * Bottom region:
 *   - Tools tile (count → /tools)
 *   - AccountBlock dropdown (full account-action surface)
 *
 * Density principles:
 *   - Per-row leading content is the chevron only — no provider/space
 *     glyph cluttering the leading area. Names carry the visual weight.
 *   - Settings + new-terminal actions are always visible (subtle), not
 *     opacity-0 on hover, so members can see they exist and admins
 *     don't have to discover the feature.
 *   - Tickers render in a fixed-width column so terminal names align
 *     vertically across rows regardless of ticker length.
 */
export function ExplorerRail({
  spaces,
  terminals,
  toolCount,
  userEmail,
  userName,
  isPlatformAdmin,
  canCreateSpace,
}: ExplorerRailProps) {
  const terminalsBySpace = useMemo(() => {
    const m = new Map<string, DashTerminal[]>();
    for (const t of terminals) {
      if (!m.has(t.space_id)) m.set(t.space_id, []);
      m.get(t.space_id)!.push(t);
    }
    return m;
  }, [terminals]);

  // Search/filter — purely local, no URL state. Empty string = no
  // filter. Match is case-insensitive against space name, terminal
  // name, and ticker.
  const [filter, setFilter] = useState("");
  const filterLower = filter.trim().toLowerCase();
  const isFiltering = filterLower.length > 0;

  const filteredTerminalsBySpace = useMemo(() => {
    if (!isFiltering) return terminalsBySpace;
    const next = new Map<string, DashTerminal[]>();
    for (const [spaceId, list] of terminalsBySpace) {
      const matches = list.filter(
        (t) =>
          t.name.toLowerCase().includes(filterLower) ||
          t.ticker.toLowerCase().includes(filterLower),
      );
      if (matches.length > 0) next.set(spaceId, matches);
    }
    return next;
  }, [terminalsBySpace, filterLower, isFiltering]);

  const visibleSpaces = useMemo(() => {
    if (!isFiltering) return spaces;
    return spaces.filter(
      (s) =>
        s.name.toLowerCase().includes(filterLower) ||
        filteredTerminalsBySpace.has(s.id),
    );
  }, [spaces, filteredTerminalsBySpace, filterLower, isFiltering]);

  // Persisted collapse state. Hydrate from localStorage after mount
  // (SSR safety) so a refresh keeps the tree the way the user left it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSED_SPACES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setCollapsed(new Set(parsed.filter((v): v is string => typeof v === "string")));
        }
      }
    } catch {
      // ignore — fall back to all-expanded
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        COLLAPSED_SPACES_KEY,
        JSON.stringify([...collapsed]),
      );
    } catch {
      // non-fatal
    }
  }, [collapsed, hydrated]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Recently-viewed terminals. Hydrate on mount + listen for the
  // custom event the tracker dispatches when a new terminal is opened.
  const [recents, setRecents] = useState<RecentTerminal[]>([]);
  useEffect(() => {
    setRecents(readRecentTerminals());
    const onChange = () => setRecents(readRecentTerminals());
    window.addEventListener("rokki:recent-terminals-changed", onChange);
    return () =>
      window.removeEventListener("rokki:recent-terminals-changed", onChange);
  }, []);

  const liveRecents = useMemo(() => {
    if (recents.length === 0) return [];
    const byTicker = new Map(terminals.map((t) => [t.ticker, t]));
    return recents
      .map((r) => {
        const live = byTicker.get(r.ticker);
        return live ? { ticker: live.ticker, name: live.name } : null;
      })
      .filter((r): r is { ticker: string; name: string } => r !== null);
  }, [recents, terminals]);

  const filterRef = useRef<HTMLInputElement>(null);

  // `/` global shortcut → focus the filter. Skip when the user is
  // already typing into another input/textarea/contenteditable so we
  // don't steal their slash from a chat box.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      filterRef.current?.focus();
      filterRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-full flex-col bg-bg-0">
      <div className="flex h-9 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
          Explorer
        </span>
        {/* Plus is always rendered — disabled with a tooltip for
            non-admins so the affordance is visible (and the tooltip
            tells them why it's grayed out). */}
        {canCreateSpace ? (
          <Link
            href="/?new=space"
            aria-label="New space"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            title="New space (admin)"
          >
            <Plus className="h-3 w-3" />
          </Link>
        ) : (
          <span
            aria-label="New space (admin only)"
            title="Only platform admins can create spaces"
            className="rounded-sm p-1 text-text-3/50"
          >
            <Plus className="h-3 w-3" />
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Filter input is sticky to the top of the scroll region so it
            stays in view as the tree scrolls. */}
        {spaces.length > 0 ? (
          <div className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-bg-0 px-2 py-1.5">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3"
                aria-hidden="true"
              />
              <input
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter explorer"
                title="Press / to focus"
                className="h-7 w-full rounded-sm border border-border bg-bg-1 pl-7 pr-7 text-xs text-text-0 placeholder:text-text-3 focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              />
              {filter ? (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("");
                    filterRef.current?.focus();
                  }}
                  aria-label="Clear filter"
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-bg-2 px-1 font-mono text-[9px] text-text-3"
                  aria-hidden="true"
                >
                  /
                </kbd>
              )}
            </div>
          </div>
        ) : null}

        <div className="px-1 py-2">
          {/* Recently-viewed — only when not filtering, and only if
              there's anything in the ring. Heading style now matches
              the "Explorer" heading at the top — same density. */}
          {!isFiltering && liveRecents.length > 0 ? (
            <div className="mb-3">
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-text-3">
                Recent
              </p>
              <ul className="space-y-0.5">
                {liveRecents.map((r) => (
                  <li key={r.ticker}>
                    <Link
                      href={`/p/${r.ticker}`}
                      className="flex items-center gap-2 rounded-sm px-2 py-0.5 text-text-1 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      <Clock className="h-3 w-3 flex-shrink-0 text-text-3" />
                      <span className="w-12 flex-shrink-0 truncate font-mono text-[10px] text-text-3">
                        {r.ticker}
                      </span>
                      <span className="flex-1 truncate text-xs">{r.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mx-2 mt-2 border-t border-border" />
            </div>
          ) : null}

          {spaces.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-3">
              You&apos;re not in any spaces yet.
            </p>
          ) : visibleSpaces.length === 0 ? (
            <p className="px-3 py-4 text-xs text-text-3">
              No spaces or terminals match{" "}
              <span className="font-mono text-text-2">&ldquo;{filter}&rdquo;</span>
              .
            </p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {visibleSpaces.map((s) => {
                const children =
                  filteredTerminalsBySpace.get(s.id) ??
                  terminalsBySpace.get(s.id) ??
                  [];
                const isCollapsed = isFiltering ? false : collapsed.has(s.id);
                const canMakeTerminal = s.role === "owner" || s.role === "admin";
                return (
                  <li key={s.id}>
                    <div className="group flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-2">
                      <button
                        onClick={() => toggle(s.id)}
                        aria-label={isCollapsed ? "Expand" : "Collapse"}
                        className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-text-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                      <span
                        className="flex-1 truncate text-text-1"
                        title={s.name}
                      >
                        {s.name}
                      </span>
                      {/* Inline "empty" hint when this space has no
                          terminals. Cheaper than rendering a separate
                          row in the tree below. */}
                      {children.length === 0 ? (
                        <span
                          className="font-mono text-[9px] italic text-text-3"
                          aria-hidden="true"
                        >
                          empty
                        </span>
                      ) : null}
                      {canMakeTerminal ? (
                        <>
                          <Link
                            href={`/s/${s.slug}/settings`}
                            aria-label={`Settings for ${s.name}`}
                            title="Space settings"
                            className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            <Settings className="h-3 w-3" />
                          </Link>
                          <Link
                            href={`/?new=terminal&space=${s.slug}`}
                            aria-label="New terminal"
                            title="New terminal"
                            className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            <Plus className="h-3 w-3" />
                          </Link>
                        </>
                      ) : null}
                    </div>
                    {!isCollapsed && children.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {children.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/p/${t.ticker}`}
                              className="flex items-center gap-2 rounded-sm py-0.5 pl-7 pr-2 text-text-1 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              title={t.name}
                            >
                              <span className="w-12 flex-shrink-0 truncate font-mono text-[10px] text-text-3">
                                {t.ticker}
                              </span>
                              <span className="flex-1 truncate text-xs">
                                {t.name}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Tools — promoted from a buried muted row to a small
              panel-like tile so users actually find it. */}
          <div className="mt-4 px-2">
            <Link
              href="/tools"
              className="flex items-center gap-2 rounded-sm border border-border bg-bg-1 px-2 py-1.5 text-xs text-text-1 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              <Sparkles className="h-3 w-3 text-accent" />
              <span className="flex-1">Tools</span>
              <span className="rounded-sm bg-bg-2 px-1.5 font-mono text-[10px] text-text-2 group-hover:bg-bg-3">
                {toolCount}
              </span>
            </Link>
          </div>
        </div>
      </div>

      <AccountBlock
        name={userName}
        email={userEmail}
        isPlatformAdmin={isPlatformAdmin}
      />
    </div>
  );
}
