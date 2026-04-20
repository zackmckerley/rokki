"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Hash, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";

interface ThreadSummary {
  id: string;
  kind: "dm" | "terminal" | "space";
  label: string;
  last_message_at: string;
  href_ticker?: string | null;
  other_user_id?: string | null;
}

interface Message {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

/**
 * Full-page messages inbox.
 *
 *   ┌ threads │ conversation ─────────────┐
 *   │         │                             │
 *   └ …       │                             │
 *
 * Threads panel lists everything you can see (DMs + terminal channels).
 * Clicking loads that thread's messages on the right. Live via Realtime.
 */
export function MessagesInbox() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Who am I?
  useEffect(() => {
    const supa = createClient();
    void supa.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  // Load thread list.
  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/v1/messages/threads", {
      credentials: "include",
    });
    if (!r.ok) return;
    const body = (await r.json()) as { data?: ThreadSummary[] };
    setThreads(body.data ?? []);
    if (!activeId && body.data && body.data[0]) setActiveId(body.data[0].id);
  }, [activeId]);
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Load messages for active thread.
  const loadMessages = useCallback(async (threadId: string) => {
    const r = await fetch(`/api/v1/messages/threads/${threadId}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setMessages([]);
      return;
    }
    const body = (await r.json()) as { data?: Message[] };
    setMessages(body.data ?? []);
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
    });
  }, []);
  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  // Realtime: any message insert under the active thread appends in place.
  useRealtimeTable<{ id: string; thread_id: string }>(
    {
      table: "messages",
      filter: activeId ? `thread_id=eq.${activeId}` : undefined,
      enabled: !!activeId,
      channelKey: activeId ? `msg:${activeId}` : undefined,
    },
    {
      onInsert: () => {
        if (activeId) void loadMessages(activeId);
        void loadThreads();
      },
    },
  );
  // Realtime: new threads pop into the list.
  useRealtimeTable<{ id: string }>(
    {
      table: "message_threads",
      channelKey: "msg:threads",
    },
    {
      onInsert: () => void loadThreads(),
      onUpdate: () => void loadThreads(),
    },
  );

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/v1/messages/threads/${activeId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: text }),
      });
      if (r.ok) {
        setDraft("");
        await loadMessages(activeId);
      }
    } finally {
      setSending(false);
    }
  }

  const active = threads.find((t) => t.id === activeId) ?? null;

  return (
    <div className="flex h-full min-h-0 rounded border border-border bg-bg-1">
      <aside className="w-[260px] flex-shrink-0 border-r border-border">
        <header className="flex h-9 items-center border-b border-border px-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Conversations
          </span>
        </header>
        <ul className="overflow-y-auto">
          {threads.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-text-3">
              No conversations yet.
            </li>
          ) : (
            threads.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setActiveId(t.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-2",
                    activeId === t.id && "bg-bg-2 text-text-0",
                  )}
                >
                  {t.kind === "terminal" ? (
                    <Hash className="h-3 w-3 flex-shrink-0 text-text-3" />
                  ) : (
                    <UserIcon className="h-3 w-3 flex-shrink-0 text-text-3" />
                  )}
                  <span className="flex-1 truncate">{t.label}</span>
                  <span className="font-mono text-[10px] text-text-3">
                    {formatRelative(t.last_message_at)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
          {active ? (
            <>
              {active.kind === "terminal" ? (
                <Hash className="h-3 w-3 text-text-3" />
              ) : (
                <UserIcon className="h-3 w-3 text-text-3" />
              )}
              <span className="text-xs text-text-1">{active.label}</span>
            </>
          ) : (
            <span className="text-xs text-text-3">Select a conversation</span>
          )}
        </header>
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-3 py-2 text-xs"
        >
          {!active ? (
            <p className="py-10 text-center text-text-3">Pick a thread on the left.</p>
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-text-3">
              No messages yet. Start the conversation.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m) => {
                const mine = m.author_id === meId;
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "flex flex-col rounded-sm px-2 py-1",
                      mine ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded px-2 py-1 text-xs",
                        mine ? "bg-accent text-bg-0" : "bg-bg-2 text-text-0",
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3">
                      <span>{mine ? "you" : m.author_name}</span>
                      <span>·</span>
                      <span>{formatRelative(m.created_at)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {active ? (
          <form
            onSubmit={submit}
            className="flex gap-2 border-t border-border bg-bg-1 p-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Message ${active.label}`}
              className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
            >
              <Send className="h-3 w-3" /> Send
            </button>
          </form>
        ) : null}
      </section>
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
  return new Date(iso).toLocaleDateString();
}
