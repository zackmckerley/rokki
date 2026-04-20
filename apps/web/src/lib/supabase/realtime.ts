"use client";

import { useEffect, useRef } from "react";
import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
  RealtimePostgresDeletePayload,
} from "@supabase/supabase-js";
import { createClient } from "./client";

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
    const key =
      channelKey ?? `${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2, 8)}`;
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, channelKey]);
}
