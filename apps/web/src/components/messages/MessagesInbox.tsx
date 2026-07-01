"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  Hash,
  User as UserIcon,
  Pin,
  Bell,
  RefreshCw,
  MessageSquare,
  PenSquare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";
import { SignalThreadView } from "./SignalThreadView";
import { SignalContactPicker } from "./SignalContactPicker";
import { PresenceProvider } from "../presence/PresenceProvider";
import { PresenceDot, PresenceLabel } from "../presence/PresenceDot";
import {
  useInboxView,
  filterThreads,
  InboxSearch,
  UnreadBadge,
} from "./inbox-prefs";
import {
  useAutosize,
  usePersistedDraft,
  composerKeyDown,
} from "./composer-utils";

interface ThreadSummary {
  id: string;
  kind: "dm" | "terminal" | "space" | "group" | "reminders" | "signal";
  source?: "rokki" | "signal";
  label: string;
  last_message_at: string;
  href_ticker?: string | null;
  other_user_id?: string | null;
  unread?: number;
  signal_id?: string;
  signal_kind?: "direct" | "group";
}

interface PingingTask {
  id: string;
  ticker_seq: number;
  title: string;
  ticker: string;
}

interface Message {
  id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  pinging_task_id: string | null;
  pinging_task: PingingTask | null;
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
  const [picking, setPicking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = usePersistedDraft(activeId ?? "none");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  /**
   * Maps message_id → in-progress draft for the "Reply with status"
   * inline composer attached to a `pinging_task_id` ping. Storing the
   * open state alongside the draft text lets the user keep typing while
   * other thread events stream in without losing what they wrote.
   */
  const [statusDrafts, setStatusDrafts] = useState<Record<string, string>>({});
  const [statusSending, setStatusSending] = useState<string | null>(null);
  const [refreshingReminders, setRefreshingReminders] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { hidden, hide, clearHidden } = useInboxView();
  useAutosize(composerRef, draft);

  const active = threads.find((t) => t.id === activeId) ?? null;
  // Signal-only: everything goes through Signal, so the inbox shows Signal
  // conversations exclusively (no native/Rokki category).
  const { visible, hiddenInFilter } = filterThreads(
    threads,
    "signal",
    hidden,
    query,
  );
  // Signal threads load + send through a different pipeline (the bridge), so
  // the native message-load and realtime below skip them.
  const activeIsSignal = active?.source === "signal";

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

  // Deep-link `?to=<phone>` (from a contact's Call/Message action): once threads
  // load, open the matching Signal conversation, or the contact picker to start
  // one. Read from window.location (client-only) so no Suspense boundary is
  // needed at every render site. Matched on the last 10 digits.
  const appliedToRef = useRef<boolean>(false);
  useEffect(() => {
    if (appliedToRef.current || threads.length === 0) return;
    if (typeof window === "undefined") return;
    const toParam = new URLSearchParams(window.location.search).get("to");
    if (!toParam) return;
    const want = toParam.replace(/\D/g, "").slice(-10);
    if (want.length !== 10) return;
    appliedToRef.current = true;
    const match = threads.find(
      (t) =>
        t.source === "signal" &&
        (t.signal_id ?? "").replace(/\D/g, "").slice(-10) === want,
    );
    if (match) setActiveId(match.id);
    else setPicking(true);
  }, [threads]);

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
    if (activeId && !activeIsSignal) void loadMessages(activeId);
  }, [activeId, activeIsSignal, loadMessages]);

  // Realtime: any message insert under the active (native) thread appends in
  // place. Signal threads have their own realtime inside SignalThreadView.
  useRealtimeTable<{ id: string; thread_id: string }>(
    {
      table: "messages",
      filter: activeId ? `thread_id=eq.${activeId}` : undefined,
      enabled: !!activeId && !activeIsSignal,
      channelKey: activeId ? `msg:${activeId}` : undefined,
    },
    {
      onInsert: () => {
        if (activeId && !activeIsSignal) void loadMessages(activeId);
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

  /**
   * Refresh the reminders thread — server scans the user's open
   * tasks for overdue / due-today and posts new pinging messages.
   * Idempotent (24h dedupe per task on the server). After refresh
   * we reload the active thread and the thread list so any new
   * messages + last_message_at bump show up immediately.
   */
  async function refreshReminders() {
    if (refreshingReminders) return;
    setRefreshingReminders(true);
    try {
      const r = await fetch("/api/v1/reminders/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (r.ok) {
        // Threads first so the new reminders thread (if first
        // refresh) appears in the sidebar; then messages so the
        // active thread refreshes if it was already selected.
        await loadThreads();
        if (activeId) await loadMessages(activeId);
      }
    } finally {
      setRefreshingReminders(false);
    }
  }

  /**
   * Submit a reply to a "request update" ping. Hits the task's
   * status-update endpoint, which both updates the latest_status_*
   * columns AND echoes the reply into this thread (with `Status update:`
   * prefix). Closes the inline composer on success.
   */
  async function submitStatusReply(messageId: string, taskId: string) {
    const text = (statusDrafts[messageId] ?? "").trim();
    if (!text || statusSending) return;
    setStatusSending(messageId);
    try {
      const r = await fetch(`/api/v1/tasks/${taskId}/status-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text, post_to_thread: true }),
      });
      if (r.ok) {
        setStatusDrafts((prev) => {
          const next = { ...prev };
          delete next[messageId];
          return next;
        });
        if (activeId) await loadMessages(activeId);
      }
    } finally {
      setStatusSending(null);
    }
  }

  return (
    <PresenceProvider>
    <div className="flex h-full min-h-0 rounded border border-border bg-bg-1">
      <aside className="w-[260px] flex-shrink-0 border-r border-border">
        <header className="flex h-9 items-center gap-2 border-b border-border px-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
            Conversations
          </span>
          <button
            type="button"
            onClick={() => setPicking(true)}
            title="New Signal message"
            aria-label="New Signal message"
            className="ml-auto rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
          >
            <PenSquare className="h-3 w-3" />
          </button>
        </header>
        <InboxSearch
          value={query}
          onChange={setQuery}
          hiddenCount={hiddenInFilter}
          onShowHidden={clearHidden}
        />
        {/* Reminders CTA — shows once until the user enables it; the
            refresh endpoint creates the thread + posts pings for the
            user's overdue / due-today tasks. After first run the
            thread surfaces in the list below and this banner clears. */}
        {!threads.some((t) => t.kind === "reminders") ? (
          <button
            type="button"
            onClick={refreshReminders}
            disabled={refreshingReminders}
            className="flex w-full items-center gap-2 border-b border-border bg-bg-2 px-3 py-2 text-left text-xs text-text-1 hover:bg-bg-3 disabled:opacity-50"
          >
            <Bell className="h-3 w-3 flex-shrink-0 text-accent" />
            <span className="flex-1">
              {refreshingReminders
                ? "Setting up reminders…"
                : "Turn on Reminders"}
            </span>
            <span className="font-mono text-[10px] text-text-3">+</span>
          </button>
        ) : null}
        <ul className="overflow-y-auto">
          {visible.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-text-3">
              {threads.length === 0 ? "No conversations yet." : "Nothing here."}
            </li>
          ) : (
            visible.map((t) => (
              <li key={t.id} className="group relative">
                <button
                  onClick={() => {
                    setThreads((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)),
                    );
                    setActiveId(t.id);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-2",
                    activeId === t.id && "bg-bg-2 text-text-0",
                  )}
                >
                  {t.kind === "terminal" ? (
                    <Hash className="h-3 w-3 flex-shrink-0 text-text-3" />
                  ) : t.kind === "reminders" ? (
                    <Bell className="h-3 w-3 flex-shrink-0 text-accent" />
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
                  <span
                    className={cn(
                      "flex-1 truncate",
                      t.unread ? "font-semibold text-text-0" : undefined,
                    )}
                  >
                    {t.label}
                  </span>
                  <UnreadBadge count={t.unread} />
                  <span className="font-mono text-[10px] text-text-3 group-hover:opacity-0">
                    {formatRelative(t.last_message_at)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hide(t.id);
                  }}
                  aria-label={`Archive ${t.label}`}
                  title="Archive"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      <section className="flex min-h-0 flex-1 flex-col">
        {picking ? (
          <SignalContactPicker
            onClose={() => setPicking(false)}
            onPick={(id) => {
              setActiveId(id);
              setPicking(false);
              void loadThreads();
            }}
          />
        ) : activeIsSignal && active ? (
          <SignalThreadView
            key={active.id}
            threadId={active.id}
            signalId={active.signal_id ?? ""}
            signalKind={active.signal_kind ?? "direct"}
            label={active.label}
            onDeleted={() => {
              setActiveId(null);
              void loadThreads();
            }}
          />
        ) : (
          <>
        <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
          {active ? (
            <>
              {active.kind === "terminal" ? (
                <Hash className="h-3 w-3 text-text-3" />
              ) : active.kind === "reminders" ? (
                <Bell className="h-3 w-3 text-accent" />
              ) : (
                <UserIcon className="h-3 w-3 text-text-3" />
              )}
              <span className="text-xs text-text-1">{active.label}</span>
              {active.kind === "dm" && active.other_user_id ? (
                <span className="flex items-center gap-1">
                  <PresenceDot userId={active.other_user_id} />
                  <PresenceLabel userId={active.other_user_id} />
                </span>
              ) : null}
              {active.kind === "reminders" ? (
                <button
                  type="button"
                  onClick={refreshReminders}
                  disabled={refreshingReminders}
                  title="Scan for new overdue / due-today tasks"
                  className="ml-auto flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-2 hover:border-accent/40 hover:text-text-0 disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn(
                      "h-2.5 w-2.5",
                      refreshingReminders && "animate-spin",
                    )}
                  />
                  {refreshingReminders ? "Refreshing…" : "Refresh"}
                </button>
              ) : null}
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
                const ping = m.pinging_task;
                const composerOpen = m.id in statusDrafts;
                const isStatusEcho = m.body.startsWith("Status update:");
                return (
                  <li
                    key={m.id}
                    className={cn(
                      "flex flex-col rounded-sm px-2 py-1",
                      mine ? "items-end" : "items-start",
                    )}
                  >
                    {/* "📌 task" chip — shown for both the original ping
                        AND the status echo so the connection stays
                        legible as the thread grows. */}
                    {ping ? (
                      <Link
                        href={`/p/${ping.ticker}/task/${ping.ticker_seq}`}
                        className="mb-1 inline-flex max-w-[75%] items-center gap-1 truncate rounded-sm bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-2 hover:text-text-0"
                      >
                        <Pin className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="truncate">
                          {ping.ticker}-{ping.ticker_seq} · {ping.title}
                        </span>
                      </Link>
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[75%] rounded px-2 py-1 text-xs",
                        mine ? "bg-accent text-bg-0" : "bg-bg-2 text-text-0",
                        isStatusEcho && !mine && "border border-accent/40",
                      )}
                    >
                      {m.body}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3">
                      <span>{mine ? "you" : m.author_name}</span>
                      <span>·</span>
                      <span>{formatRelative(m.created_at)}</span>
                      {/* "Reply with status" — only on the original ping
                          (the status-update echo isn't itself replyable),
                          and only when the viewer is NOT the requester
                          (the requester sent the ping; replies come from
                          assignees). */}
                      {ping && !mine && !isStatusEcho ? (
                        <>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() =>
                              setStatusDrafts((prev) =>
                                m.id in prev
                                  ? (() => {
                                      const next = { ...prev };
                                      delete next[m.id];
                                      return next;
                                    })()
                                  : { ...prev, [m.id]: "" },
                              )
                            }
                            className="rounded-sm px-1 py-0.5 text-text-2 hover:bg-bg-3 hover:text-text-0"
                          >
                            {composerOpen ? "Cancel" : "Reply with status"}
                          </button>
                        </>
                      ) : null}
                    </div>
                    {ping && composerOpen ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submitStatusReply(m.id, ping.id);
                        }}
                        className="mt-1 flex w-full max-w-[75%] flex-col gap-1 rounded border border-border bg-bg-1 p-1.5"
                      >
                        <textarea
                          value={statusDrafts[m.id] ?? ""}
                          onChange={(e) =>
                            setStatusDrafts((prev) => ({
                              ...prev,
                              [m.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              (e.metaKey || e.ctrlKey)
                            ) {
                              e.preventDefault();
                              void submitStatusReply(m.id, ping.id);
                            }
                          }}
                          rows={2}
                          autoFocus
                          placeholder={`Status of "${ping.title}"…`}
                          className="resize-none rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
                          disabled={statusSending === m.id}
                        />
                        <div className="flex justify-end gap-2">
                          <span className="font-mono text-[10px] text-text-3">
                            ⌘↵ to send
                          </span>
                          <button
                            type="submit"
                            disabled={
                              !(statusDrafts[m.id] ?? "").trim() ||
                              statusSending === m.id
                            }
                            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-0.5 text-[11px] text-bg-0 disabled:opacity-40"
                          >
                            <Send className="h-2.5 w-2.5" /> Send status
                          </button>
                        </div>
                      </form>
                    ) : null}
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
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => composerKeyDown(e, () => void submit())}
              rows={1}
              placeholder={`Message ${active.label}`}
              className="max-h-[140px] flex-1 resize-none rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
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
          </>
        )}
      </section>
    </div>
    </PresenceProvider>
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
