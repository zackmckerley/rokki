"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Settings, X } from "lucide-react";
import type { DashSpace, DashTerminal } from "@/lib/dashboard-queries";
import { cn } from "@/lib/utils";
import { AccountBlock } from "@/components/AccountBlock";
import { RailModules } from "./RailModules";
import { COLLAPSED_SPACES_KEY } from "@/lib/recent-terminals";
import {
  applyOrder,
  reorder,
  EXPLORER_SPACE_ORDER_KEY,
  EXPLORER_TERMINAL_ORDER_KEY,
} from "@/lib/explorer-order";

interface ExplorerRailProps {
  spaces: DashSpace[];
  terminals: DashTerminal[];
  userEmail: string;
  userName: string;
  isPlatformAdmin: boolean;
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
  userEmail,
  userName,
  isPlatformAdmin,
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
          t.slug.toLowerCase().includes(filterLower),
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

  // ---- Drag-to-reorder (per-device, same model as collapse state) -----
  // Saved orders: a list of space ids, and per-space lists of terminal
  // ids. Hydrated after mount for SSR safety; ids not present sink to the
  // end (see applyOrder), so a newly created space/terminal shows up at
  // the bottom rather than disappearing.
  const [spaceOrder, setSpaceOrder] = useState<string[]>([]);
  const [terminalOrder, setTerminalOrder] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    try {
      const s = window.localStorage.getItem(EXPLORER_SPACE_ORDER_KEY);
      if (s) {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) {
          setSpaceOrder(
            parsed.filter((v): v is string => typeof v === "string"),
          );
        }
      }
      const t = window.localStorage.getItem(EXPLORER_TERMINAL_ORDER_KEY);
      if (t) {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setTerminalOrder(parsed as Record<string, string[]>);
        }
      }
    } catch {
      // ignore — fall back to server order
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        EXPLORER_SPACE_ORDER_KEY,
        JSON.stringify(spaceOrder),
      );
    } catch {
      /* non-fatal */
    }
  }, [spaceOrder, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        EXPLORER_TERMINAL_ORDER_KEY,
        JSON.stringify(terminalOrder),
      );
    } catch {
      /* non-fatal */
    }
  }, [terminalOrder, hydrated]);

  // Live drag state. Reordering is disabled while filtering — the visible
  // set is a subset then, so persisting that order would be misleading.
  const dndEnabled = !isFiltering;
  const [dragSpaceId, setDragSpaceId] = useState<string | null>(null);
  const [overSpaceId, setOverSpaceId] = useState<string | null>(null);
  const [dragTerm, setDragTerm] = useState<{
    id: string;
    spaceId: string;
  } | null>(null);
  const [overTermId, setOverTermId] = useState<string | null>(null);

  // Spaces in the user's saved order (server order until hydrated, to
  // avoid an SSR/CSR mismatch on first paint).
  const orderedSpaces = useMemo(
    () =>
      hydrated ? applyOrder(visibleSpaces, (s) => s.id, spaceOrder) : visibleSpaces,
    [visibleSpaces, spaceOrder, hydrated],
  );

  function handleSpaceDrop(targetSpaceId: string | null) {
    if (!dragSpaceId) return;
    const currentIds = orderedSpaces.map((s) => s.id);
    setSpaceOrder(reorder(currentIds, dragSpaceId, targetSpaceId));
    setDragSpaceId(null);
    setOverSpaceId(null);
  }

  function handleTermDrop(
    spaceId: string,
    displayedIds: string[],
    targetTermId: string | null,
  ) {
    if (!dragTerm || dragTerm.spaceId !== spaceId) return;
    const moved = reorder(displayedIds, dragTerm.id, targetTermId);
    setTerminalOrder((prev) => ({ ...prev, [spaceId]: moved }));
    setDragTerm(null);
    setOverTermId(null);
  }

  // Collapse state for the two rail sections (Spaces / Modules),
  // persisted per-device like the per-space collapse.
  const [sectionsOpen, setSectionsOpen] = useState({
    spaces: true,
    modules: true,
  });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("rokki:explorer-sections");
      if (raw) {
        const p = JSON.parse(raw) as Partial<typeof sectionsOpen>;
        setSectionsOpen((s) => ({ ...s, ...p }));
      }
    } catch {
      /* default: both open */
    }
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        "rokki:explorer-sections",
        JSON.stringify(sectionsOpen),
      );
    } catch {
      /* non-fatal */
    }
  }, [sectionsOpen, hydrated]);
  const toggleSection = (k: "spaces" | "modules") =>
    setSectionsOpen((s) => ({ ...s, [k]: !s[k] }));

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
      <div className="flex h-10 flex-shrink-0 items-center border-b border-border px-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
          Explorer
        </span>
        {/* The "new space" plus button used to live here. Removed —
            space creation is admin-only, and admins always have it
            in the command palette ("New space") plus the
            `?new=space` query param. The plus button on every
            non-admin's screen was just dead pixels. */}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Filter input is sticky to the top of the scroll region so it
            stays in view as the tree scrolls. */}
        {spaces.length > 0 ? (
          <div className="sticky top-0 z-10 flex-shrink-0 border-b border-border bg-bg-0 px-2 py-2.5">
            <div className="relative">
              {/* The leading magnifying-glass icon was dropped per
                  Zack's report ("there is still a + in the filter").
                  At 12px the lucide-search circle + stroke combined
                  with the text cursor on focus visually read as a
                  "+" — so there's nothing inside the input now but
                  the placeholder, the value, and the clear button
                  on the right when there's a value. */}
              <input
                ref={filterRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search…"
                aria-label="Filter explorer"
                title="Press / to focus"
                className="h-8 w-full rounded-sm border border-border bg-bg-1 px-2 text-xs text-text-0 placeholder:text-text-3 focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
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
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="px-1 py-2">
          {/* ---- SPACES section (collapsible) ---- */}
          <button
            type="button"
            onClick={() => toggleSection("spaces")}
            className="flex w-full items-center gap-1 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-text-3 hover:text-text-1"
          >
            {sectionsOpen.spaces ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            )}
            Spaces
          </button>

          {!sectionsOpen.spaces ? null : spaces.length === 0 ? (
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
            <ul className="space-y-0.5 pl-3 text-xs">
              {orderedSpaces.map((s) => {
                const children =
                  filteredTerminalsBySpace.get(s.id) ??
                  terminalsBySpace.get(s.id) ??
                  [];
                const orderedChildren =
                  hydrated && dndEnabled
                    ? applyOrder(children, (t) => t.id, terminalOrder[s.id] ?? [])
                    : children;
                const isCollapsed = isFiltering ? false : collapsed.has(s.id);
                const canMakeTerminal = s.role === "owner" || s.role === "admin";
                return (
                  <li key={s.id}>
                    <div
                      draggable={dndEnabled}
                      onDragStart={
                        dndEnabled
                          ? (e) => {
                              e.dataTransfer.effectAllowed = "move";
                              e.dataTransfer.setData("text/plain", s.id);
                              setDragSpaceId(s.id);
                            }
                          : undefined
                      }
                      onDragOver={
                        dndEnabled && dragSpaceId
                          ? (e) => {
                              if (dragSpaceId === s.id) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              if (overSpaceId !== s.id) setOverSpaceId(s.id);
                            }
                          : undefined
                      }
                      onDragLeave={
                        dndEnabled
                          ? () => {
                              if (overSpaceId === s.id) setOverSpaceId(null);
                            }
                          : undefined
                      }
                      onDrop={
                        dndEnabled
                          ? (e) => {
                              e.preventDefault();
                              handleSpaceDrop(s.id);
                            }
                          : undefined
                      }
                      onDragEnd={
                        dndEnabled
                          ? () => {
                              setDragSpaceId(null);
                              setOverSpaceId(null);
                            }
                          : undefined
                      }
                      title={dndEnabled ? "Drag to reorder" : undefined}
                      className={cn(
                        "group flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-2",
                        dndEnabled && "cursor-grab active:cursor-grabbing",
                        overSpaceId === s.id &&
                          dragSpaceId !== s.id &&
                          "outline outline-2 -outline-offset-2 outline-accent",
                        dragSpaceId === s.id && "opacity-50",
                      )}
                    >
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
                      <Link
                        href={`/s/${s.slug}`}
                        draggable={false}
                        className="flex-1 truncate text-text-1 hover:text-text-0"
                        title={`Open ${s.name}`}
                      >
                        {s.name}
                      </Link>
                      {/* The "empty" italic hint that used to live here
                          for terminal-less spaces was dropped per UX
                          feedback — when a space has no terminals,
                          expanding it just shows nothing, which reads
                          fine on its own. */}
                      {/* Per-space "+ New terminal" was removed per
                          UX feedback ("why is there still a plus
                          sign in my filter under the explorer"). The
                          quick-create flow lives elsewhere now —
                          ⌘K → "new terminal" or the AccountBlock
                          dropdown. We keep the Settings cog because
                          space admin doesn't have a global entry
                          point yet. */}
                      {canMakeTerminal ? (
                        <Link
                          href={`/s/${s.slug}/settings`}
                          draggable={false}
                          aria-label={`Settings for ${s.name}`}
                          title="Space settings"
                          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        >
                          <Settings className="h-3 w-3" />
                        </Link>
                      ) : null}
                    </div>
                    {!isCollapsed && orderedChildren.length > 0 ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {orderedChildren.map((t) => (
                          <li
                            key={t.id}
                            draggable={dndEnabled}
                            onDragStart={
                              dndEnabled
                                ? (e) => {
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", t.id);
                                    setDragTerm({ id: t.id, spaceId: s.id });
                                  }
                                : undefined
                            }
                            onDragOver={
                              dndEnabled && dragTerm?.spaceId === s.id
                                ? (e) => {
                                    if (dragTerm.id === t.id) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                    if (overTermId !== t.id) setOverTermId(t.id);
                                  }
                                : undefined
                            }
                            onDragLeave={
                              dndEnabled
                                ? () => {
                                    if (overTermId === t.id) setOverTermId(null);
                                  }
                                : undefined
                            }
                            onDrop={
                              dndEnabled
                                ? (e) => {
                                    e.preventDefault();
                                    handleTermDrop(
                                      s.id,
                                      orderedChildren.map((c) => c.id),
                                      t.id,
                                    );
                                  }
                                : undefined
                            }
                            onDragEnd={
                              dndEnabled
                                ? () => {
                                    setDragTerm(null);
                                    setOverTermId(null);
                                  }
                                : undefined
                            }
                            className={cn(
                              dndEnabled && "cursor-grab active:cursor-grabbing",
                              overTermId === t.id &&
                                dragTerm?.id !== t.id &&
                                dragTerm?.spaceId === s.id &&
                                "rounded-sm outline outline-2 -outline-offset-2 outline-accent",
                              dragTerm?.id === t.id && "opacity-50",
                            )}
                          >
                            <Link
                              href={`/p/${t.slug}`}
                              draggable={false}
                              // pl-8 indents terminals one step under the
                              // space name, so the tree reads SPACES → space
                              // → terminal at aligned, increasing depths.
                              className="flex items-center gap-2 rounded-sm py-0.5 pl-8 pr-2 text-text-1 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              title={t.name}
                            >
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

          {/* ---- MODULES section (collapsible) ---- */}
          <button
            type="button"
            onClick={() => toggleSection("modules")}
            className="mt-3 flex w-full items-center gap-1 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-text-3 hover:text-text-1"
          >
            {sectionsOpen.modules ? (
              <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            )}
            Modules
          </button>
          {sectionsOpen.modules ? <RailModules /> : null}
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
