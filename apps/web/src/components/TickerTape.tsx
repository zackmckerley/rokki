"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/lib/supabase/realtime";

interface TickerItem {
  id: string;
  text: string;
  when: string;
  href?: string;
  /** Set for injected tool-tip pseudo-items. */
  tip?: boolean;
}

interface ActivityRow {
  id: string;
  action: string;
  actor_id: string | null;
  terminal_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface TickerTapeProps {
  /** Initial items rendered server-side so there's no flash-of-empty. */
  items: TickerItem[];
  /**
   * Optional terminal scope. When set, only that terminal's activity
   * streams into the tape. Omit to hear about everything the caller can see.
   */
  projectId?: string;
}

type SyncStatus = "connected" | "reconnecting" | "offline";

/**
 * Ticker tape — the permanent horizontal band under the TopBar that shows
 * what just happened across the user's world. No notification bell; this
 * IS the notification surface. Every row is clickable.
 *
 * Also renders:
 *   - a sync dot on the left edge that reflects the Realtime connection
 *     state (green / amber / grey)
 *   - a rotating "💡 Try …" tool tip every ~10 items so tools stay
 *     discoverable without a dedicated card
 */
export function TickerTape({ items: initial, projectId }: TickerTapeProps) {
  const [liveRows, setLiveRows] = useState<TickerItem[]>([]);
  const [sync, setSync] = useState<SyncStatus>("connected");

  useRealtimeTable<ActivityRow>(
    {
      table: "activity",
      filter: projectId ? `terminal_id=eq.${projectId}` : undefined,
      channelKey: projectId ? `ticker:${projectId}` : "ticker:global",
    },
    {
      onInsert: (row) => {
        const item = toTickerItem(row);
        if (!item) return;
        setLiveRows((prev) => {
          if (prev.some((r) => r.id === item.id)) return prev;
          return [item, ...prev].slice(0, 30);
        });
      },
    },
  );

  // Sync dot — watch the browser's online state plus Supabase socket.
  useEffect(() => {
    const supa = createClient();
    const ch = supa.channel("sync-heartbeat");
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") setSync("connected");
      else if (status === "CHANNEL_ERROR" || status === "CLOSED")
        setSync("reconnecting");
      else if (status === "TIMED_OUT") setSync("reconnecting");
    });
    const onOnline = () => setSync("connected");
    const onOffline = () => setSync("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setSync("offline");
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void supa.removeChannel(ch);
    };
  }, []);

  const combined = useMemo(() => {
    const seen = new Set<string>();
    const out: TickerItem[] = [];
    for (const row of [...liveRows, ...initial]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    return withToolTips(out);
  }, [liveRows, initial]);

  const dotClass = {
    connected: "bg-success",
    reconnecting: "bg-warning",
    offline: "bg-danger",
  }[sync];
  const dotTitle = {
    connected: "Live — connected to sync",
    reconnecting: "Reconnecting…",
    offline: "Offline — showing cached activity",
  }[sync];

  if (combined.length === 0) {
    return (
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3 text-xs text-text-3">
        <span
          className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", dotClass)}
          title={dotTitle}
          aria-label={dotTitle}
        />
        <Activity className="h-3 w-3" aria-hidden="true" />
        <span>No recent activity.</span>
      </div>
    );
  }

  // Duplicate content so the horizontal scroll wraps smoothly.
  const doubled = [...combined, ...combined];

  return (
    <div className="flex h-8 flex-shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-bg-1 px-3 text-xs text-text-2">
      <span
        className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", dotClass)}
        title={dotTitle}
        aria-label={dotTitle}
      />
      <Activity
        className="h-3 w-3 flex-shrink-0 text-accent"
        aria-hidden="true"
      />
      <div
        className={cn(
          "flex gap-6 whitespace-nowrap",
          "animate-[scroll_90s_linear_infinite] [&:hover]:[animation-play-state:paused]",
        )}
      >
        {doubled.map((item, i) => (
          <TickerRow key={`${item.id}-${i}`} item={item} />
        ))}
      </div>
      <style>{`
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function TickerRow({ item }: { item: TickerItem }) {
  const content = (
    <span className="flex items-center gap-2">
      {item.tip ? (
        <Sparkles
          className="h-3 w-3 flex-shrink-0 text-accent"
          aria-hidden="true"
        />
      ) : null}
      <span className={item.tip ? "text-text-1" : ""}>{item.text}</span>
      {!item.tip ? (
        <span className="text-text-3">· {item.when}</span>
      ) : null}
    </span>
  );
  if (!item.href) return content;
  return (
    <Link
      href={item.href}
      className="flex items-center gap-2 rounded-sm hover:text-text-0"
    >
      {content}
    </Link>
  );
}

/**
 * Sprinkle a tool tip in roughly every 10th slot so power users keep
 * discovering what they can do via MCP without a dedicated toolbox card.
 */
function withToolTips(items: TickerItem[]): TickerItem[] {
  if (items.length < 5) return items;
  const tips: TickerItem[] = [
    {
      id: "tip:ask",
      text: `Try: "ask rokki what's in the permit folder" — ⌘K "ask"`,
      when: "",
      href: "/tools",
      tip: true,
    },
    {
      id: "tip:search",
      text: `Try: "search across all my files" — ⌘K "search"`,
      when: "",
      href: "/tools",
      tip: true,
    },
    {
      id: "tip:tool",
      text: `💡 Your tools are one keystroke away — ⌘K`,
      when: "",
      href: "/tools",
      tip: true,
    },
  ];
  const out: TickerItem[] = [];
  items.forEach((it, idx) => {
    out.push(it);
    // Every 10th item, sprinkle a tip. Use Math.floor so we land on
    // an integer array index — `(idx / 10) % 3` evaluates to 0.9,
    // 1.9, 2.9 at idx=9,19,29, and `tips[0.9]` is `undefined`. Once
    // the activity stream crosses 10 rows, that undefined gets
    // pushed into the ticker and the renderer trips on `item.id`,
    // which is what the recent dashboard 500s were.
    if ((idx + 1) % 10 === 0) {
      const tip = tips[Math.floor(idx / 10) % tips.length];
      if (tip) out.push(tip);
    }
  });
  return out;
}

/**
 * Convert a raw activity row into a ticker item with a sensible deep link.
 */
function toTickerItem(row: ActivityRow): TickerItem | null {
  const text = describeActivity(row);
  if (!text) return null;
  return {
    id: row.id,
    text,
    when: relativeTime(row.created_at),
    href: hrefForActivity(row),
  };
}

function hrefForActivity(row: ActivityRow): string | undefined {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const ticker = typeof m.ticker === "string" ? m.ticker : null;
  if (ticker) return `/p/${ticker}`;
  if (row.entity_type === "file" || row.action.startsWith("file."))
    return ticker ? `/p/${ticker}` : undefined;
  return undefined;
}

function describeActivity(row: ActivityRow): string | null {
  const m = (row.metadata ?? {}) as Record<string, unknown>;
  const pick = (key: string): string | null => {
    const v = m[key];
    return typeof v === "string" ? v : null;
  };
  switch (row.action) {
    case "terminal.create":
      return `terminal created: ${pick("name") ?? ""}`;
    case "terminal.update":
      return `terminal updated`;
    case "terminal.archive":
      return `terminal archived`;
    case "member.invite":
      return `invited ${pick("email") ?? "a member"}`;
    case "member.join":
      return `joined the terminal`;
    case "task.create":
      return `task: "${pick("title") ?? ""}"`;
    case "task.complete":
      return `task complete`;
    case "task.delete":
      return `task deleted${pick("title") ? `: "${pick("title")}"` : ""}`;
    case "task.update":
      return `task updated`;
    case "file.upload": {
      const op = pick("op");
      if (op === "folder.create") return `folder: ${pick("path") ?? ""}`;
      if (op === "file.duplicate") return `duplicated ${pick("filename") ?? "file"}`;
      return `uploaded ${pick("filename") ?? "a file"}`;
    }
    case "file.update": {
      const op = pick("op");
      if (op === "file.rename")
        return `renamed ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      if (op === "folder.rename")
        return `renamed ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      if (op === "file.move")
        return `moved file ${pick("from") ?? ""} → ${pick("to") ?? ""}`;
      return `file updated`;
    }
    case "file.delete":
      return `deleted ${pick("filename") ?? pick("path") ?? "item"}`;
    case "file.download":
      return `read ${pick("filename") ?? "a file"}`;
    case "tool.invoke":
      return `called tool ${pick("slug") ? `"${pick("slug")}"` : ""}`.trim();
    default:
      return row.action.replace(/[._]/g, " ");
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
