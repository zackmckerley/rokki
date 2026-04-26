"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `UserView` mirrors the row returned by /api/v1/user-views. The pane
 * supplies typed `filter`/`sort` shapes (whatever it stores); the menu
 * just round-trips them as opaque values.
 */
export interface UserView<TFilter = unknown, TSort = unknown> {
  id: string;
  owner_id: string;
  scope: string;
  terminal_id: string | null;
  name: string;
  filter: TFilter;
  sort: TSort;
  columns: unknown[];
  is_shared: boolean;
  created_at: string;
  updated_at: string;
}

interface Props<TFilter, TSort> {
  /** "tasks" | "files" | "activity" | "audit" — passed to the API. */
  scope: "tasks" | "files" | "activity" | "audit";
  /** Optional terminal scoping. NULL means "scope-wide". */
  terminalId: string | null;
  /** Caller's auth uid — used to grey out delete/share on other people's shared views. */
  currentUserId: string | null;
  /** Caller's current filter/sort to seed "Save current view…". */
  currentFilter: TFilter;
  currentSort: TSort;
  /** Currently active view id (or null = unsaved local state). */
  activeViewId: string | null;
  /** Apply: parent overwrites its filter/sort with the view's payload. */
  onApply: (view: UserView<TFilter, TSort>) => void;
  /** Clear: parent resets to default filter/sort. */
  onClear: () => void;
}

/**
 * Saved-views dropdown. Lives next to the existing sort menu in a pane.
 *
 *   * Lists the caller's views + any shared views in the current terminal.
 *   * "Save current view…" prompts for a name and POSTs.
 *   * Per-view: open, share toggle (owner only), delete (owner only).
 *   * Deep-link via `?view=<id>` is the parent's job — this component just
 *     emits the events.
 */
export function ViewsMenu<TFilter, TSort>({
  scope,
  terminalId,
  currentUserId,
  currentFilter,
  currentSort,
  activeViewId,
  onApply,
  onClear,
}: Props<TFilter, TSort>) {
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState<UserView<TFilter, TSort>[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const reload = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const url = new URL(
          "/api/v1/user-views",
          window.location.origin,
        );
        url.searchParams.set("scope", scope);
        if (terminalId) url.searchParams.set("terminal", terminalId);
        const r = await fetch(url.toString(), { credentials: "include" });
        if (!r.ok) {
          setError("Could not load views");
          return;
        }
        const body = (await r.json()) as { data?: UserView<TFilter, TSort>[] };
        setViews(body.data ?? []);
        setError(null);
      } finally {
        setLoading(false);
      }
    },
    [scope, terminalId],
  );

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        e.target instanceof Node &&
        wrapRef.current &&
        !wrapRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function saveCurrent(name: string) {
    setError(null);
    const r = await fetch("/api/v1/user-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        scope,
        terminal_id: terminalId,
        name,
        filter: currentFilter,
        sort: currentSort,
        columns: [],
        is_shared: false,
      }),
    });
    if (!r.ok) {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      setError(body.errors?.[0]?.message ?? "Could not save view");
      return;
    }
    const body = (await r.json()) as { data?: UserView<TFilter, TSort> };
    if (body.data) {
      setViews((prev) =>
        [...prev, body.data!].sort((a, b) => a.name.localeCompare(b.name)),
      );
      onApply(body.data);
    }
    setCreating(false);
    setDraftName("");
  }

  async function deleteView(id: string) {
    if (!confirm("Delete this view?")) return;
    const r = await fetch(`/api/v1/user-views/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (r.ok) {
      setViews((prev) => prev.filter((v) => v.id !== id));
      if (activeViewId === id) onClear();
    }
  }

  async function toggleShared(view: UserView<TFilter, TSort>) {
    const next = !view.is_shared;
    // Optimistic
    setViews((prev) =>
      prev.map((v) => (v.id === view.id ? { ...v, is_shared: next } : v)),
    );
    const r = await fetch(`/api/v1/user-views/${view.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_shared: next }),
    });
    if (!r.ok) {
      // Roll back
      setViews((prev) =>
        prev.map((v) =>
          v.id === view.id ? { ...v, is_shared: view.is_shared } : v,
        ),
      );
    }
  }

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-sm px-2 py-1 text-xs hover:bg-bg-2 hover:text-text-0",
          activeView ? "text-accent" : "text-text-2",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Saved views"
      >
        <Bookmark className="h-3 w-3" />
        {activeView ? activeView.name : "Views"}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-sm border border-border bg-bg-1 text-sm shadow-xl"
        >
          {error ? (
            <div className="border-b border-border bg-danger-subtle px-3 py-1.5 text-xs text-danger">
              {error}
            </div>
          ) : null}

          {loading && views.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-3">Loading…</div>
          ) : views.length === 0 && !creating ? (
            <div className="px-3 py-3 text-xs text-text-3">
              No saved views yet.
            </div>
          ) : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto">
              {activeView ? (
                <li>
                  <button
                    onClick={() => {
                      onClear();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-text-3 hover:bg-bg-2 hover:text-text-1"
                  >
                    <X className="h-3 w-3" />
                    Clear active view
                  </button>
                </li>
              ) : null}
              {views.map((v) => {
                const owned = v.owner_id === currentUserId;
                const active = v.id === activeViewId;
                return (
                  <li
                    key={v.id}
                    className={cn(
                      "group flex items-center gap-1 px-2 py-1.5",
                      active ? "bg-accent-subtle" : "hover:bg-bg-2",
                    )}
                  >
                    <button
                      onClick={() => {
                        onApply(v);
                        setOpen(false);
                      }}
                      className="flex flex-1 items-center gap-2 truncate text-left"
                      title={v.name}
                    >
                      {active ? (
                        <Check className="h-3 w-3 flex-shrink-0 text-accent" />
                      ) : (
                        <span className="h-3 w-3 flex-shrink-0" />
                      )}
                      <span
                        className={cn(
                          "truncate",
                          active ? "text-text-0" : "text-text-1",
                        )}
                      >
                        {v.name}
                      </span>
                      {!owned ? (
                        <span className="font-mono text-[10px] text-text-3">
                          shared
                        </span>
                      ) : null}
                    </button>
                    {owned ? (
                      <>
                        <button
                          onClick={() => void toggleShared(v)}
                          className={cn(
                            "rounded-sm p-1 hover:bg-bg-3",
                            v.is_shared ? "text-accent" : "text-text-3",
                          )}
                          title={
                            v.is_shared
                              ? "Shared with terminal members"
                              : "Make visible to terminal members"
                          }
                          aria-pressed={v.is_shared}
                        >
                          <Share2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => void deleteView(v.id)}
                          className="rounded-sm p-1 text-text-3 opacity-0 hover:bg-bg-3 hover:text-danger group-hover:opacity-100"
                          title="Delete view"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="border-t border-border bg-bg-2 px-2 py-1.5">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = draftName.trim();
                  if (!name) return;
                  void saveCurrent(name);
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setCreating(false);
                      setDraftName("");
                    }
                  }}
                  placeholder="View name…"
                  className="flex-1 rounded-sm border border-border bg-bg-1 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
                  maxLength={80}
                />
                <button
                  type="submit"
                  className="rounded-sm bg-accent px-2 py-1 text-xs font-semibold text-bg-0 hover:bg-accent-hover"
                  disabled={!draftName.trim()}
                >
                  Save
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-xs text-text-1 hover:bg-bg-3 hover:text-text-0"
              >
                <BookmarkPlus className="h-3 w-3" />
                Save current view…
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
