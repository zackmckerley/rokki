"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, CheckCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";

interface NotificationTerminal {
  ticker: string;
  name: string;
}

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  terminal_id: string | null;
  actor_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
  terminal: NotificationTerminal | null;
}

interface NotificationGroup {
  /** Stable group key — terminal_id, or "__system__" for systems. */
  key: string;
  label: string;
  ticker: string | null;
  items: Notification[];
}

const SYSTEM_GROUP_KEY = "__system__";

/**
 * Top-bar notification bell. Shows an unread badge, click to open a
 * dropdown feed grouped by parent terminal. Live updates via Realtime.
 *
 * Grouping: notifications with a terminal_id appear under "TICKER · Name".
 * Anything without a terminal (system messages, account events) goes
 * under "System". Group order = newest activity first within each.
 *
 * Badge: hidden when unread = 0; shows the count when 1–9; shows "9+"
 * when >9 so the chip stays single-character-ish even for noisy users.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supa = createClient();
    void supa.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/notifications?limit=30", {
        credentials: "include",
      });
      if (!r.ok) return;
      const body = (await r.json()) as {
        data?: Notification[];
        unread_count?: number;
      };
      setItems(body.data ?? []);
      setUnread(body.unread_count ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh the unread count any time a notification row touches the client.
  useRealtimeTable<Notification>(
    {
      table: "notifications",
      filter: userId ? `user_id=eq.${userId}` : undefined,
      enabled: !!userId,
      channelKey: userId ? `notifications:${userId}` : undefined,
    },
    {
      onInsert: () => void load(),
      onUpdate: () => void load(),
      onDelete: () => void load(),
    },
  );

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (e.target instanceof Node && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAll() {
    await fetch("/api/v1/notifications/mark-all-read", {
      method: "PATCH",
      credentials: "include",
    });
    void load();
  }

  async function toggleRead(n: Notification) {
    const nowRead = !n.read_at;
    // Optimistic — flip locally so the row toggles instantly.
    setItems((prev) =>
      prev.map((x) =>
        x.id === n.id
          ? { ...x, read_at: nowRead ? new Date().toISOString() : null }
          : x,
      ),
    );
    setUnread((u) => Math.max(0, u + (nowRead ? -1 : 1)));
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [n.id], read: nowRead }),
    });
    // The realtime UPDATE event will reconcile if the optimistic state
    // diverged.
  }

  const groups = useMemo<NotificationGroup[]>(() => {
    const map = new Map<string, NotificationGroup>();
    for (const n of items) {
      const key = n.terminal_id ?? SYSTEM_GROUP_KEY;
      let g = map.get(key);
      if (!g) {
        g =
          key === SYSTEM_GROUP_KEY
            ? { key, label: "System", ticker: null, items: [] }
            : {
                key,
                label: n.terminal?.name ?? "Terminal",
                ticker: n.terminal?.ticker ?? null,
                items: [],
              };
        map.set(key, g);
      }
      g.items.push(n);
    }
    // Iteration order = first-seen order = newest-first (items already
    // sorted desc by the API). Push the System group to the end if it
    // exists — terminal-scoped notifications are usually more relevant.
    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.key === SYSTEM_GROUP_KEY) return 1;
      if (b.key === SYSTEM_GROUP_KEY) return -1;
      return 0;
    });
    return list;
  }, [items]);

  const badge = unread > 9 ? "9+" : unread > 0 ? String(unread) : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
      >
        <Bell className="h-4 w-4" />
        {badge !== null ? (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] font-semibold text-bg-0"
          >
            {badge}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border bg-bg-0 px-3 py-2">
            <span className="text-xs font-semibold text-text-1">
              Notifications
            </span>
            <button
              onClick={markAll}
              disabled={unread === 0}
              className={cn(
                "flex items-center gap-1 text-[11px]",
                unread === 0
                  ? "cursor-not-allowed text-text-3 opacity-50"
                  : "text-text-2 hover:text-text-0",
              )}
            >
              <CheckCheck className="h-3 w-3" /> Mark all as read
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="p-4 text-center text-xs text-text-3">Loading…</p>
            ) : items.length === 0 ? (
              <BellEmptyState />
            ) : (
              <ul className="divide-y divide-border">
                {groups.map((g) => (
                  <li key={g.key}>
                    <h3 className="flex items-center gap-2 border-b border-border bg-bg-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
                      {g.ticker ? (
                        <span className="font-mono text-text-2">{g.ticker}</span>
                      ) : null}
                      {g.ticker ? <span aria-hidden="true">·</span> : null}
                      <span className="truncate normal-case tracking-normal text-text-2">
                        {g.label}
                      </span>
                    </h3>
                    <ul className="divide-y divide-border">
                      {g.items.map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          onToggleRead={() => void toggleRead(n)}
                          onNavigate={() => setOpen(false)}
                        />
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NotificationRow({
  n,
  onToggleRead,
  onNavigate,
}: {
  n: Notification;
  onToggleRead: () => void;
  onNavigate: () => void;
}) {
  const isUnread = !n.read_at;
  return (
    <li className={cn("group flex gap-2 px-3 py-2 hover:bg-bg-2", isUnread && "bg-bg-2/50")}>
      <span
        aria-hidden="true"
        className={cn(
          "mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full",
          isUnread ? "bg-accent" : "bg-transparent",
        )}
      />
      <Link
        href={n.url ?? "#"}
        onClick={() => {
          if (isUnread) onToggleRead();
          onNavigate();
        }}
        className="flex-1 min-w-0 text-xs"
      >
        <div className="truncate font-semibold text-text-0">{n.title}</div>
        {n.body ? (
          <div className="mt-0.5 line-clamp-2 text-text-2">{n.body}</div>
        ) : null}
        <div className="mt-0.5 font-mono text-[10px] text-text-3">
          {formatRelative(n.created_at)}
        </div>
      </Link>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleRead();
        }}
        aria-label={isUnread ? "Mark as read" : "Mark as unread"}
        title={isUnread ? "Mark as read" : "Mark as unread"}
        className="flex-shrink-0 self-start rounded-sm p-1 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        {isUnread ? <Check className="h-3 w-3" /> : <Undo2 className="h-3 w-3" />}
      </button>
    </li>
  );
}

function BellEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-2 text-text-3">
        <Bell className="h-4 w-4" />
      </span>
      <p className="text-sm font-semibold text-text-1">All caught up</p>
      <p className="text-xs text-text-3">
        Mentions, assignments, and approvals will land here.
      </p>
    </div>
  );
}

/**
 * Compact relative time formatter — "now", "2m", "3h", "yesterday",
 * "3d", or a date for anything older. Sized to fit the dropdown's
 * font-mono caption.
 */
function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const ms = now - then;
  const s = Math.floor(ms / 1000);
  if (s < 45) return "now";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  // Day comparison uses the local calendar day, not the 24-hour mark —
  // "yesterday" should mean "the day before today" even if only 18h
  // elapsed past midnight.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thenDay = new Date(then);
  thenDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (today.getTime() - thenDay.getTime()) / 86_400_000,
  );
  if (dayDiff === 1) return "yesterday";
  if (dayDiff < 7) return `${dayDiff}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
