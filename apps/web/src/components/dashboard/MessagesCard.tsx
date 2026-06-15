"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Hash,
  User as UserIcon,
  MessageSquare,
  MessageSquarePlus,
  Settings2,
} from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { useRealtimeTable } from "@/lib/supabase/realtime";

interface ThreadSummary {
  id: string;
  kind: "dm" | "terminal" | "space" | "group" | "reminders" | "signal";
  source?: "rokki" | "signal";
  label: string;
  last_message_at: string;
}

/**
 * Right-rail Messages card. Shows the most recent conversations you can see
 * with their last-touched time. Clicking a row opens /messages.
 */
export function MessagesCard() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/messages/threads", {
        credentials: "include",
      });
      if (!r.ok) return;
      const body = (await r.json()) as { data?: ThreadSummary[] };
      setThreads(body.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable<{ id: string }>(
    { table: "messages", channelKey: "dash:messages" },
    { onInsert: () => void load() },
  );
  useRealtimeTable<{ id: string }>(
    { table: "message_threads", channelKey: "dash:threads" },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  return (
    <DashboardCard
      title="Messages"
      count={threads.length}
      expandHref="/messages"
      headerRight={
        <Link
          href="/settings/modules/messages"
          aria-label="Messages settings"
          title="Connect Signal & settings"
          className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Settings2 className="h-3 w-3" />
        </Link>
      }
    >
      {loading && threads.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : threads.length === 0 ? (
        <Empty />
      ) : (
        <ul className="divide-y divide-border/40 text-sm">
          {threads.slice(0, 10).map((t) => (
            <li key={t.id}>
              <Link
                href="/messages"
                className="flex items-center gap-2 px-3 py-[var(--rk-row-py)] hover:bg-bg-2"
              >
                {t.kind === "terminal" ? (
                  <Hash className="h-3 w-3 flex-shrink-0 text-text-3" />
                ) : t.source === "signal" ? (
                  <MessageSquare className="h-3 w-3 flex-shrink-0 text-success" />
                ) : (
                  <UserIcon className="h-3 w-3 flex-shrink-0 text-text-3" />
                )}
                <span className="flex-1 truncate text-text-0">{t.label}</span>
                <span className="font-mono text-2xs text-text-3">
                  {formatRelative(t.last_message_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <MessageSquarePlus
        className="h-5 w-5 text-text-3"
        aria-hidden="true"
      />
      <p className="text-xs text-text-2">Quiet.</p>
      <p className="text-xs text-text-3">
        Start a DM or post in a terminal channel.
      </p>
      <Link
        href="/messages"
        className="mt-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 hover:bg-bg-3"
      >
        Open inbox
      </Link>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
