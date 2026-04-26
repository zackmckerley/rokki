"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { useVirtualList } from "@/lib/use-virtual-list";
import { createClient } from "@/lib/supabase/client";

const NOTIFICATION_ROW_HEIGHT = 64;
const NOTIFICATION_VIRTUALIZE_THRESHOLD = 50;

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
}

/**
 * Top-bar notification bell. Shows an unread badge, click to open a
 * dropdown feed. Live updates via Realtime — new notifications pop in
 * without a refresh.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const supa = createClient();
    void supa.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/notifications?limit=20", {
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

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!btnRef.current) return;
      if (
        e.target instanceof Node &&
        !btnRef.current.parentElement?.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markAll() {
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ all: true, read: true }),
    });
    void load();
  }

  async function markOne(id: string) {
    await fetch("/api/v1/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [id], read: true }),
    });
    void load();
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative rounded-sm p-1 text-text-2 hover:bg-bg-2 hover:text-text-0"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 font-mono text-[9px] text-bg-0">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <NotificationDropdown
          items={items}
          loading={loading}
          unread={unread}
          onMarkAll={markAll}
          onMarkOne={markOne}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function NotificationDropdown({
  items,
  loading,
  unread,
  onMarkAll,
  onMarkOne,
  onClose,
}: {
  items: Notification[];
  loading: boolean;
  unread: number;
  onMarkAll: () => void;
  onMarkOne: (id: string) => void;
  onClose: () => void;
}) {
  // Virtualize once we'd have enough rows for blank-out scrolling to be
  // noticeable (>50). Below that, the plain list is friendlier — focus
  // order and a11y are simpler with real <ul>/<li>.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = items.length > NOTIFICATION_VIRTUALIZE_THRESHOLD;
  const virtual = useVirtualList({
    count: virtualize ? items.length : 0,
    rowHeight: NOTIFICATION_ROW_HEIGHT,
    scrollRef,
    overscan: 6,
  });

  return (
    <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-xl">
      <div className="flex items-center justify-between border-b border-border bg-bg-0 px-3 py-2">
        <span className="text-xs font-semibold text-text-1">
          Notifications
        </span>
        {unread > 0 ? (
          <button
            onClick={onMarkAll}
            className="flex items-center gap-1 text-[11px] text-text-3 hover:text-text-0"
          >
            <CheckCheck className="h-3 w-3" /> Mark all read
          </button>
        ) : null}
      </div>
      <div ref={scrollRef} className="max-h-[60vh] overflow-y-auto">
        {loading && items.length === 0 ? (
          <p className="p-4 text-center text-xs text-text-3">Loading…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">Nothing new.</p>
        ) : virtualize ? (
          <ul
            className="relative m-0 list-none p-0"
            style={{ height: virtual.totalHeight }}
          >
            {virtual.items.map((vi) => {
              const n = items[vi.index];
              if (!n) return null;
              return (
                <li
                  key={n.id}
                  style={{
                    position: "absolute",
                    top: vi.offset,
                    left: 0,
                    right: 0,
                    height: NOTIFICATION_ROW_HEIGHT,
                  }}
                  className="border-b border-border"
                >
                  <NotificationLink
                    n={n}
                    onMarkOne={onMarkOne}
                    onClose={onClose}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationLink
                  n={n}
                  onMarkOne={onMarkOne}
                  onClose={onClose}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function NotificationLink({
  n,
  onMarkOne,
  onClose,
}: {
  n: Notification;
  onMarkOne: (id: string) => void;
  onClose: () => void;
}) {
  const unread_ = !n.read_at;
  return (
    <Link
      href={n.url ?? "#"}
      onClick={() => {
        if (unread_) onMarkOne(n.id);
        onClose();
      }}
      className={cn(
        "block px-3 py-2 text-xs hover:bg-bg-2",
        unread_ && "bg-bg-2/50",
      )}
    >
      <div className="flex items-start gap-2">
        {unread_ ? (
          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
        ) : (
          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="truncate font-semibold text-text-0">{n.title}</div>
          {n.body ? (
            <div className="mt-0.5 line-clamp-2 text-text-2">{n.body}</div>
          ) : null}
          <div className="mt-0.5 font-mono text-[10px] text-text-3">
            {formatWhen(n.created_at)}
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
