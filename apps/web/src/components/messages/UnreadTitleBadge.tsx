"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeTable } from "@/lib/supabase/realtime";

/**
 * Mirrors total unread message count into the browser tab title, e.g.
 * "(3) Rokki — …", so you notice new messages from any tab. Renders nothing.
 * Refreshes on realtime inserts and when the tab regains focus.
 */
export function UnreadTitleBadge() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/messages/threads", {
        credentials: "include",
      });
      if (!r.ok) return;
      const b = (await r.json()) as { data?: { unread?: number }[] };
      setCount((b.data ?? []).reduce((s, t) => s + (t.unread ?? 0), 0));
    } catch {
      /* leave the count as-is on transient failure */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable<{ id: string }>(
    { table: "messages", channelKey: "title:messages" },
    { onInsert: () => void load() },
  );
  useRealtimeTable<{ id: string }>(
    { table: "signal_messages", channelKey: "title:sigmsgs" },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  // Prefix the existing title with "(N) " when there's unread; strip any
  // stale prefix first so the count never compounds.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s*/, "");
    };
  }, [count]);

  return null;
}
