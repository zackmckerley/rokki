"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Activity, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { summarizeActivity } from "@/lib/activity-summary";
import { withToolTips } from "@/lib/ticker-tips";

type ActivityRange = "today" | "week" | "all";

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
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
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
  /**
   * Time window for the initial fetch. The toggle on the tape's right
   * edge mutates the URL (`?activity_range=`); the server re-renders
   * and feeds a narrowed initial item list. Realtime updates are not
   * filtered by date — new rows always stream in.
   */
  range?: ActivityRange;
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
export function TickerTape({
  items: initial,
  projectId,
  range = "all",
}: TickerTapeProps) {
  const [liveRows, setLiveRows] = useState<TickerItem[]>([]);
  const [sync, setSync] = useState<SyncStatus>("connected");
  const router = useRouter();
  const searchParams = useSearchParams();

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

  /** Push a new ?activity_range= without touching other params. */
  function selectRange(next: ActivityRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("activity_range");
    else params.set("activity_range", next);
    router.push(`/${params.size ? `?${params.toString()}` : ""}`);
  }

  if (combined.length === 0) {
    return (
      <div className="flex h-8 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-1 px-3 text-xs text-text-3">
        <span
          className={cn("h-1.5 w-1.5 flex-shrink-0 rounded-full", dotClass)}
          title={dotTitle}
          aria-label={dotTitle}
        />
        <Activity className="h-3 w-3" aria-hidden="true" />
        <span>
          {range === "today"
            ? "No activity today yet."
            : range === "week"
              ? "No activity this week."
              : "No recent activity."}
        </span>
        <div className="ml-auto flex-shrink-0">
          <RangeToggle range={range} onSelect={selectRange} />
        </div>
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
          "flex min-w-0 flex-1 gap-6 overflow-hidden whitespace-nowrap",
          "animate-[scroll_90s_linear_infinite] [&:hover]:[animation-play-state:paused]",
        )}
      >
        {doubled.map((item, i) => (
          <TickerRow key={`${item.id}-${i}`} item={item} />
        ))}
      </div>
      <div className="flex-shrink-0">
        <RangeToggle range={range} onSelect={selectRange} />
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

/**
 * Compact segmented control rendered on the right edge of the tape.
 * Mirrors the Week card's RangeToggle visually but at a smaller scale
 * so it fits inside the 32px-tall tape without crowding the scroll.
 */
function RangeToggle({
  range,
  onSelect,
}: {
  range: ActivityRange;
  onSelect: (r: ActivityRange) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Activity time range"
      className="flex overflow-hidden rounded-sm border border-border bg-bg-2"
    >
      {(["today", "week", "all"] as const).map((r, i) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={range === r}
          onClick={() => onSelect(r)}
          className={cn(
            "px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide transition-colors",
            i > 0 && "border-l border-border",
            range === r
              ? "bg-accent text-bg-0"
              : "text-text-3 hover:bg-bg-3 hover:text-text-1",
          )}
        >
          {r === "today" ? "1d" : r === "week" ? "7d" : "All"}
        </button>
      ))}
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
 * Convert a raw activity row into a ticker item with a sensible deep link.
 *
 * Uses the shared `summarizeActivity` helper so the dashboard ticker,
 * per-terminal ticker, and notification descriptions all read the same
 * way and pick up new action types in one place.
 */
function toTickerItem(row: ActivityRow): TickerItem | null {
  const text = summarizeActivity({
    action: row.action,
    metadata: row.metadata,
    before_json: row.before_json ?? null,
    after_json: row.after_json ?? null,
  });
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
