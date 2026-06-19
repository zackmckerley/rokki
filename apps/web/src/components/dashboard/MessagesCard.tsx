"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Hash,
  User as UserIcon,
  MessageSquare,
  MessageSquarePlus,
  Settings2,
  ChevronLeft,
  Send,
  Paperclip,
  Maximize2,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { PresenceDot, PresenceLabel } from "../presence/PresenceDot";
import { uploadSignalMedia } from "@/lib/signal/upload";
import {
  useInboxView,
  filterThreads,
  InboxFilterBar,
  InboxSearch,
  UnreadBadge,
  type InboxFilter,
} from "../messages/inbox-prefs";
import { useAutosize, usePersistedDraft, composerKeyDown } from "../messages/composer-utils";

interface ThreadSummary {
  id: string;
  kind: "dm" | "terminal" | "space" | "group" | "reminders" | "signal";
  source?: "rokki" | "signal";
  label: string;
  last_message_at: string;
  /** Native DM/group — the other participant (drives the presence dot). */
  other_user_id?: string | null;
  /** Count of unread messages since I last opened the thread. */
  unread?: number;
  /** Signal-only — the send target + conversation kind. */
  signal_id?: string;
  signal_kind?: "direct" | "group";
}

/**
 * Right-rail Messages card. Lists your conversations; clicking one opens an
 * inline thread view (recent messages + composer) so you can reply without
 * leaving the dashboard. The composer supports drag-and-drop, paste, and a
 * paperclip for Signal attachments (with upload progress). Native threads post
 * via /api/v1/messages; Signal threads send through the bridge. The whole pane
 * is height-responsive so it fills the panel at any size.
 */
export function MessagesCard() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ThreadSummary | null>(null);
  const [query, setQuery] = useState("");
  const { filter, setFilter, hidden, hide, clearHidden } = useInboxView();
  // Measure the card so we can switch to a two-pane (iMessage-style) layout
  // when it's wide enough.
  const [containerRef, width] = useElementWidth<HTMLDivElement>();

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

  const { visible, hiddenInFilter } = filterThreads(
    threads,
    filter,
    hidden,
    query,
  );
  // Two-pane (list + open chat side by side) once the card is wide enough,
  // like Messages on a Mac; below that, the single-pane list↔thread flow.
  const split = width >= 560;

  const selectThread = (t: ThreadSummary) => {
    // Optimistically clear the badge; the server marks it read on open.
    setThreads((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)),
    );
    setOpen(t);
  };
  const closeThread = () => {
    setOpen(null);
    void load();
  };

  const list = (
    <ConversationList
      visible={visible}
      filter={filter}
      setFilter={setFilter}
      hiddenInFilter={hiddenInFilter}
      clearHidden={clearHidden}
      hide={hide}
      query={query}
      setQuery={setQuery}
      activeId={split ? open?.id ?? null : null}
      onSelect={selectThread}
    />
  );

  let body: ReactNode;
  if (loading && threads.length === 0) {
    body = <p className="px-3 py-4 text-center text-xs text-text-3">Loading…</p>;
  } else if (threads.length === 0) {
    body = <Empty />;
  } else if (split) {
    body = (
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[240px] flex-shrink-0 flex-col border-r border-border">
          {list}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {open ? (
            <ThreadQuickView
              key={open.id}
              thread={open}
              showBack={false}
              onBack={closeThread}
            />
          ) : (
            <SelectPrompt />
          )}
        </div>
      </div>
    );
  } else if (open) {
    body = <ThreadQuickView key={open.id} thread={open} onBack={closeThread} />;
  } else {
    body = list;
  }

  return (
    <DashboardCard
      title="Messages"
      count={visible.length}
      expandHref="/messages"
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
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
      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        {body}
      </div>
    </DashboardCard>
  );
}

/** Measure an element's width via ResizeObserver (SSR-safe; 0 until mounted). */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** The conversation list — filter bar, rows (unread badge + hover-hide), and a
 *  footer link. Used standalone (narrow) and as the left pane (wide). */
function ConversationList({
  visible,
  filter,
  setFilter,
  hiddenInFilter,
  clearHidden,
  hide,
  query,
  setQuery,
  activeId,
  onSelect,
}: {
  visible: ThreadSummary[];
  filter: InboxFilter;
  setFilter: (f: InboxFilter) => void;
  hiddenInFilter: number;
  clearHidden: () => void;
  hide: (id: string) => void;
  query: string;
  setQuery: (v: string) => void;
  activeId: string | null;
  onSelect: (t: ThreadSummary) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <InboxFilterBar
        filter={filter}
        setFilter={setFilter}
        hiddenCount={hiddenInFilter}
        onShowHidden={clearHidden}
      />
      <InboxSearch value={query} onChange={setQuery} />
      <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
        {visible.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-text-3">
            Nothing here.
          </li>
        ) : (
          visible.map((t) => (
            <li key={t.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(t)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-bg-2",
                  activeId === t.id && "bg-bg-2",
                )}
              >
                <ThreadIcon thread={t} />
                <span
                  className={cn(
                    "flex-1 truncate",
                    t.unread ? "font-semibold text-text-0" : "text-text-0",
                  )}
                >
                  {t.label}
                </span>
                <UnreadBadge count={t.unread} />
                <span className="flex-shrink-0 font-mono text-2xs text-text-3 group-hover:opacity-0">
                  {formatRelative(t.last_message_at)}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  hide(t.id);
                }}
                aria-label={`Hide ${t.label}`}
                title="Hide from this list"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))
        )}
      </ul>
      <Link
        href="/messages"
        className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-border/60 py-1.5 text-2xs uppercase tracking-wide text-text-3 hover:bg-bg-2 hover:text-text-1"
      >
        <Maximize2 className="h-3 w-3" />
        Open full messenger
      </Link>
    </div>
  );
}

/** Empty right pane in split layout, before a conversation is picked. */
function SelectPrompt() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-text-3">
      <MessageSquare className="h-6 w-6" />
      <p className="text-xs">Select a conversation</p>
    </div>
  );
}

/** Leading icon for a conversation row (with presence dot on native DMs). */
function ThreadIcon({ thread: t }: { thread: ThreadSummary }) {
  if (t.kind === "terminal")
    return <Hash className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />;
  if (t.source === "signal")
    return <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-success" />;
  if (t.kind === "dm" && t.other_user_id)
    return (
      <span className="relative flex-shrink-0">
        <UserIcon className="h-3.5 w-3.5 text-text-3" />
        <PresenceDot
          userId={t.other_user_id}
          className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 ring-1 ring-bg-1"
        />
      </span>
    );
  return <UserIcon className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />;
}

interface MsgAttachment {
  url?: string | null;
  content_type: string | null;
  filename: string | null;
  size: number | null;
}

/** Normalized message for the thread view. */
interface QuickMessage {
  id: string;
  mine: boolean;
  who: string;
  body: string;
  at: string;
  attachments: MsgAttachment[];
}

/** A file being / already uploaded, staged in the composer. */
interface PendingItem {
  id: string;
  storage_key?: string;
  content_type: string | null;
  filename: string | null;
  size: number | null;
  previewUrl?: string;
  progress: number;
  error?: boolean;
}

function ThreadQuickView({
  thread,
  onBack,
  showBack = true,
}: {
  thread: ThreadSummary;
  onBack: () => void;
  showBack?: boolean;
}) {
  const isSignal = thread.source === "signal";
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [draft, setDraft] = usePersistedDraft(thread.id);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const pendingRef = useRef<PendingItem[]>([]);
  pendingRef.current = pending;
  useAutosize(composerRef, draft);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollerRef.current;
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
            attachments?: MsgAttachment[];
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
          attachments: Array.isArray(m.attachments) ? m.attachments : [],
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
          attachments: [],
        })),
      );
    }
    scrollToEnd();
  }, [isSignal, thread.id, scrollToEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  // Revoke any staged previews on unmount / thread switch.
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

  useRealtimeTable<{ id: string }>(
    {
      table: isSignal ? "signal_messages" : "messages",
      filter: `thread_id=eq.${thread.id}`,
      channelKey: `dashqv:${thread.id}`,
    },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  // ── attachments (Signal only) ──────────────────────────────────────────────
  async function uploadFiles(files: File[]) {
    if (!isSignal || files.length === 0) return;
    setError(null);
    for (const file of files) {
      const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      setPending((prev) => [
        ...prev,
        {
          id: localId,
          content_type: file.type || null,
          filename: file.name || null,
          size: file.size,
          previewUrl,
          progress: 0,
        },
      ]);
      try {
        const stored = await uploadSignalMedia(file, (p) =>
          setPending((prev) =>
            prev.map((it) =>
              it.id === localId ? { ...it, progress: p.pct } : it,
            ),
          ),
        );
        setPending((prev) =>
          prev.map((it) =>
            it.id === localId
              ? { ...it, storage_key: stored.storage_key, progress: 100 }
              : it,
          ),
        );
      } catch (e) {
        setPending((prev) =>
          prev.map((it) => (it.id === localId ? { ...it, error: true } : it)),
        );
        setError(e instanceof Error ? e.message : `Couldn’t attach ${file.name}.`);
      }
    }
  }

  function removePending(id: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    void uploadFiles(files);
  }
  function onPaste(e: React.ClipboardEvent) {
    if (!isSignal) return;
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      void uploadFiles(files);
    }
  }
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }
  function onDragEnter(e: React.DragEvent) {
    if (!isSignal || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!isSignal || !hasFiles(e)) return;
    e.preventDefault();
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!isSignal || !hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  }

  const uploadingNow = pending.some((p) => !p.storage_key && !p.error);
  const ready = pending.filter((p) => p.storage_key);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if ((!text && ready.length === 0) || sending || uploadingNow) return;
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        mine: true,
        who: "you",
        body: text,
        at: new Date().toISOString(),
        attachments: ready.map((p) => ({
          url: p.previewUrl ?? null,
          content_type: p.content_type,
          filename: p.filename,
          size: p.size,
        })),
      },
    ]);
    setDraft("");
    setPending([]);
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
              attachments: ready.map((p) => ({
                storage_key: p.storage_key,
                content_type: p.content_type,
                filename: p.filename,
                size: p.size,
              })),
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
        setDraft((cur) => (cur ? cur : text));
        setPending(ready);
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? "Couldn’t send.");
      } else {
        ready.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
        void load();
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft((cur) => (cur ? cur : text));
      setPending(ready);
      setError("Couldn’t send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPaste={onPaste}
    >
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border bg-bg-1 px-2 py-1.5">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="rounded-sm p-0.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : null}
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
          aria-label="Open full messenger"
          title="Open full messenger"
          className="rounded-sm p-0.5 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Maximize2 className="h-3 w-3" />
        </Link>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-3">No messages yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {messages.map((m) => (
              <li
                key={m.id}
                className={cn(
                  "flex flex-col",
                  m.mine ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "flex max-w-[85%] flex-col gap-1 rounded-lg px-2.5 py-1.5 text-xs",
                    m.mine
                      ? "rounded-br-sm bg-accent text-bg-0"
                      : "rounded-bl-sm bg-bg-2 text-text-0",
                  )}
                >
                  {m.attachments.map((a, i) => (
                    <BubbleAttachment key={i} att={a} />
                  ))}
                  {m.body ? (
                    <span className="whitespace-pre-wrap break-words">{m.body}</span>
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
        {pending.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 px-0.5">
            {pending.map((p) => (
              <li
                key={p.id}
                className="relative flex items-center gap-1.5 rounded-sm border border-border bg-bg-0 py-1 pl-1 pr-1.5"
              >
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt={p.filename ?? "attachment"}
                    className="h-6 w-6 rounded-sm object-cover"
                  />
                ) : (
                  <FileText className="h-4 w-4 text-text-3" />
                )}
                <span className="max-w-[8rem] truncate text-2xs text-text-1">
                  {p.filename ?? "file"}
                </span>
                {p.error ? (
                  <span className="text-2xs text-danger">failed</span>
                ) : p.storage_key ? null : (
                  <span className="text-2xs text-text-3">{p.progress}%</span>
                )}
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  aria-label={`Remove ${p.filename ?? "attachment"}`}
                  className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
                {!p.storage_key && !p.error ? (
                  <span
                    className="absolute bottom-0 left-0 h-0.5 rounded-full bg-accent transition-all"
                    style={{ width: `${p.progress}%` }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-1.5">
          {isSignal ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={onPickFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingNow}
                title="Attach files"
                aria-label="Attach files"
                className="flex items-center rounded-sm border border-border bg-bg-0 px-2 text-text-2 hover:text-text-0 disabled:opacity-40"
              >
                {uploadingNow ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          ) : null}
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => composerKeyDown(e, () => void submit())}
            rows={1}
            placeholder={`Reply${isSignal ? " on Signal" : ""}…`}
            className="max-h-[120px] flex-1 resize-none rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && ready.length === 0) || sending || uploadingNow}
            aria-label="Send reply"
            className="flex items-center rounded-sm bg-accent px-2 text-bg-0 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </form>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent/60 bg-bg-0/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-1.5 text-accent">
            <Paperclip className="h-5 w-5" />
            <span className="text-xs font-medium">Drop to attach</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BubbleAttachment({ att }: { att: MsgAttachment }) {
  const isImage = (att.content_type ?? "").startsWith("image/");
  const name = att.filename ?? "file";
  if (isImage && att.url) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={name}
          className="max-h-40 max-w-full rounded object-cover"
        />
      </a>
    );
  }
  const card = (
    <span className="flex items-center gap-1.5 rounded border border-current/20 px-1.5 py-1">
      <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-80" />
      <span className="truncate text-2xs">{name}</span>
    </span>
  );
  return att.url ? (
    <a href={att.url} target="_blank" rel="noopener noreferrer" download={name}>
      {card}
    </a>
  ) : (
    card
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
