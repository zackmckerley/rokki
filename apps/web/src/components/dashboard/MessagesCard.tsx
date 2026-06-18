"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Hash,
  User as UserIcon,
  MessageSquare,
  MessageSquarePlus,
  Settings2,
  ChevronLeft,
  Send,
  Paperclip,
} from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { PresenceDot, PresenceLabel } from "../presence/PresenceDot";

interface ThreadSummary {
  id: string;
  kind: "dm" | "terminal" | "space" | "group" | "reminders" | "signal";
  source?: "rokki" | "signal";
  label: string;
  last_message_at: string;
  /** Native DM/group — the other participant (drives the presence dot). */
  other_user_id?: string | null;
  /** Signal-only — the send target + conversation kind. */
  signal_id?: string;
  signal_kind?: "direct" | "group";
}

/**
 * Right-rail Messages card. Lists your most recent conversations; clicking one
 * opens an inline quick-reply view (recent messages + a one-line composer) so
 * you can answer without leaving the dashboard. Native threads post via
 * /api/v1/messages; Signal threads send through the bridge via
 * /api/v1/signal/send. The maximize button still opens the full /messages inbox.
 */
export function MessagesCard() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ThreadSummary | null>(null);

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
  useRealtimeTable<{ id: string }>(
    { table: "signal_messages", channelKey: "dash:sigmsgs" },
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
      {open ? (
        <ThreadQuickView
          thread={open}
          onBack={() => {
            setOpen(null);
            void load();
          }}
        />
      ) : loading && threads.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>
      ) : threads.length === 0 ? (
        <Empty />
      ) : (
        <ul className="divide-y divide-border/40 text-sm">
          {threads.slice(0, 10).map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => setOpen(t)}
                className="flex w-full items-center gap-2 px-3 py-[var(--rk-row-py)] text-left hover:bg-bg-2"
              >
                {t.kind === "terminal" ? (
                  <Hash className="h-3 w-3 flex-shrink-0 text-text-3" />
                ) : t.source === "signal" ? (
                  <MessageSquare className="h-3 w-3 flex-shrink-0 text-success" />
                ) : t.kind === "dm" && t.other_user_id ? (
                  <span className="relative flex-shrink-0">
                    <UserIcon className="h-3 w-3 text-text-3" />
                    <PresenceDot
                      userId={t.other_user_id}
                      className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 ring-1 ring-bg-1"
                    />
                  </span>
                ) : (
                  <UserIcon className="h-3 w-3 flex-shrink-0 text-text-3" />
                )}
                <span className="flex-1 truncate text-text-0">{t.label}</span>
                <span className="font-mono text-2xs text-text-3">
                  {formatRelative(t.last_message_at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

/** Normalized message for the compact quick-reply list. */
interface QuickMessage {
  id: string;
  mine: boolean;
  who: string;
  body: string;
  at: string;
  hasAttachment?: boolean;
}

function ThreadQuickView({
  thread,
  onBack,
}: {
  thread: ThreadSummary;
  onBack: () => void;
}) {
  const isSignal = thread.source === "signal";
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
      // `scrollTo` is absent in jsdom and older engines — guard it.
      el?.scrollTo?.(0, el.scrollHeight);
    });
  }, []);

  const load = useCallback(async () => {
    if (isSignal) {
      const r = await fetch(`/api/v1/signal/threads/${thread.id}`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const b = (await r.json()) as {
        data?: {
          messages?: {
            id: string;
            direction: "in" | "out";
            sender: string | null;
            body: string | null;
            sent_at: string;
            attachments?: unknown[];
          }[];
        };
      };
      setMessages(
        (b.data?.messages ?? []).map((m) => ({
          id: m.id,
          mine: m.direction === "out",
          who: m.direction === "out" ? "you" : m.sender ?? "them",
          body: m.body ?? "",
          at: m.sent_at,
          hasAttachment: Array.isArray(m.attachments) && m.attachments.length > 0,
        })),
      );
    } else {
      const r = await fetch(`/api/v1/messages/threads/${thread.id}`, {
        credentials: "include",
      });
      if (!r.ok) return;
      const b = (await r.json()) as {
        data?: {
          id: string;
          body: string;
          created_at: string;
          author_name?: string;
          is_mine?: boolean;
        }[];
      };
      setMessages(
        (b.data ?? []).map((m) => ({
          id: m.id,
          mine: Boolean(m.is_mine),
          who: m.author_name ?? "someone",
          body: m.body,
          at: m.created_at,
        })),
      );
    }
    scrollToEnd();
  }, [isSignal, thread.id, scrollToEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable<{ id: string }>(
    {
      table: isSignal ? "signal_messages" : "messages",
      filter: `thread_id=eq.${thread.id}`,
      channelKey: `dashqv:${thread.id}`,
    },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    // Optimistic bubble so the reply feels instant; realtime reconciles it.
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, mine: true, who: "you", body: text, at: new Date().toISOString() },
    ]);
    setDraft("");
    setError(null);
    setSending(true);
    scrollToEnd();
    try {
      const r = isSignal
        ? await fetch("/api/v1/signal/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              signalId: thread.signal_id,
              kind: thread.signal_kind ?? "direct",
              text,
            }),
          })
        : await fetch(`/api/v1/messages/threads/${thread.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ body: text }),
          });
      if (!r.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? "Couldn’t send.");
      } else {
        void load();
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError("Couldn’t send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border bg-bg-1 px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {isSignal ? (
          <MessageSquare className="h-3 w-3 flex-shrink-0 text-success" />
        ) : thread.kind === "terminal" ? (
          <Hash className="h-3 w-3 flex-shrink-0 text-text-3" />
        ) : (
          <UserIcon className="h-3 w-3 flex-shrink-0 text-text-3" />
        )}
        <span className="flex-1 truncate text-xs text-text-1">{thread.label}</span>
        {!isSignal && thread.kind === "dm" && thread.other_user_id ? (
          <span className="flex flex-shrink-0 items-center gap-1">
            <PresenceDot userId={thread.other_user_id} />
            <PresenceLabel userId={thread.other_user_id} />
          </span>
        ) : null}
        <Link
          href="/messages"
          aria-label="Open in full inbox"
          title="Open in full inbox"
          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <MessageSquare className="h-3 w-3" />
        </Link>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-3">No messages yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {messages.slice(-30).map((m) => (
              <li
                key={m.id}
                className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded px-2 py-1 text-xs",
                    m.mine ? "bg-accent text-bg-0" : "bg-bg-2 text-text-0",
                  )}
                >
                  {m.body ? (
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
                  ) : m.hasAttachment ? (
                    <span className="flex items-center gap-1 italic opacity-80">
                      <Paperclip className="h-3 w-3" /> Attachment
                    </span>
                  ) : null}
                </div>
                <span className="mt-0.5 px-1 text-2xs text-text-3">
                  {m.mine ? "you" : m.who} · {formatRelative(m.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        onSubmit={submit}
        className="flex flex-shrink-0 flex-col gap-1 border-t border-border bg-bg-1 p-2"
      >
        {error ? (
          <span className="px-1 text-2xs text-danger">{error}</span>
        ) : null}
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Reply${isSignal ? " on Signal" : ""}…`}
            className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send reply"
            className="flex items-center rounded-sm bg-accent px-2 text-bg-0 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </form>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <MessageSquarePlus className="h-5 w-5 text-text-3" aria-hidden="true" />
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
