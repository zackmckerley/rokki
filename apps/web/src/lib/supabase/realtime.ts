"use client";

import { useEffect, useRef } from "react";
import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
} from "@supabase/supabase-js";
import { createClient } from "./client";
import { traceBreadcrumb } from "@/lib/observability";

/**
 * useRealtimeTable — subscribe to INSERT/UPDATE/DELETE events on a single
 * table, optionally filtered. Payloads are routed to the provided handlers.
 *
 * Designed to pair with an existing `useState<Row[]>` + imperative `fetch`
 * pattern: the component still does its initial fetch, and this hook keeps
 * that list current without polling or full-page reloads.
 *
 * Rules:
 * - `filter` must be a server-side filter string like `terminal_id=eq.<uuid>`.
 *   The client won't let you use app-side filters here; RLS already narrows
 *   what you can see, but filtering keeps noise off the socket.
 * - Handlers must be stable or their latest value captured via a ref; this
 *   hook only re-subscribes when `table` / `filter` / `enabled` change.
 *
 * The `channelKey` param is a *debug prefix* only — we always append a
 * random suffix so the underlying Supabase channel is unique per hook
 * instance. Sharing a channel name across re-mounts reproducibly causes
 * Supabase to throw `cannot add postgres_changes callbacks after
 * subscribe()` because the client caches channels by name and returns
 * the already-subscribed one on the second mount.
 */
export interface RealtimeHandlers<Row> {
  onInsert?: (row: Row) => void;
  onUpdate?: (newRow: Row, oldRow: Partial<Row>) => void;
  onDelete?: (oldRow: Partial<Row>) => void;
}

export function useRealtimeTable<Row extends object = Record<string, unknown>>(
  opts: {
    table: string;
    filter?: string;
    enabled?: boolean;
    channelKey?: string;
  },
  handlers: RealtimeHandlers<Row>,
): void {
  const { table, filter, enabled = true, channelKey } = opts;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    // Always unique — see the note in the JSDoc. The prefix helps when
    // reading supabase.getChannels() in devtools.
    const prefix = channelKey ?? `${table}:${filter ?? "all"}`;
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `${prefix}:${suffix}`;

    // Belt-and-braces: defensively remove any stale channel still
    // hanging around with a name that matches our prefix. Cleans up
    // after double-mounts that didn't fully tear down.
    try {
      for (const existing of supabase.getChannels()) {
        const name = (existing as unknown as { topic?: string }).topic ?? "";
        if (name.startsWith(`realtime:${prefix}:`)) {
          void supabase.removeChannel(existing);
        }
      }
    } catch {
      // getChannels is best-effort; ignore failures.
    }

    const channel = supabase
      .channel(key)
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table, filter },
        (payload: RealtimePostgresInsertPayload<Row>) => {
          handlersRef.current.onInsert?.(payload.new);
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table, filter },
        (payload: RealtimePostgresUpdatePayload<Row>) => {
          handlersRef.current.onUpdate?.(payload.new, payload.old);
        },
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table, filter },
        (payload: RealtimePostgresDeletePayload<Row>) => {
          handlersRef.current.onDelete?.(payload.old);
        },
      )
      .subscribe((status: string) => {
        // Breadcrumb on every state change so a downstream error
        // shows exactly which channel was up/down at the time.
        traceBreadcrumb({
          category: "realtime",
          message: `channel.${status.toLowerCase()}`,
          data: { table, filter, key, status },
          level:
            status === "CHANNEL_ERROR" || status === "TIMED_OUT"
              ? "warning"
              : "info",
        });
      });

    return () => {
      traceBreadcrumb({
        category: "realtime",
        message: "channel.unsubscribe",
        data: { table, filter, key },
      });
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, channelKey]);
}
