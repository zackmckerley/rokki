"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, MessageSquare, Loader2, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";

interface SignalMessage {
  id: string;
  direction: "in" | "out";
  sender: string | null;
  body: string | null;
  sent_at: string;
}

/**
 * The conversation pane for a Signal thread, swapped into the Messages inbox
 * when the active thread's source is "signal". Kept separate from the native
 * conversation so neither path complicates the other: messages come from
 * signal_messages (direction in/out), and the composer sends via the bridge
 * through /api/v1/signal/send.
 *
 * Deleting a conversation or a message removes Rokki's local copy only — it
 * does NOT delete on Signal or the other participant's device.
 */
export function SignalThreadView({
  threadId,
  signalId,
  signalKind,
  label,
  onDeleted,
}: {
  threadId: string;
  signalId: string;
  signalKind: "direct" | "group";
  label: string;
  /** Called after the whole conversation is deleted, so the inbox can close
   *  this pane and refresh the thread list. */
  onDeleted?: () => void;
}) {
  const [messages, setMessages] = useState<SignalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingConvo, setDeletingConvo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/signal/threads/${threadId}`, {
      credentials: "include",
    });
    if (!r.ok) {
      setMessages([]);
      return;
    }
    const body = (await r.json()) as { data?: { messages?: SignalMessage[] } };
    setMessages(body.data?.messages ?? []);
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
    });
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable<{ id: string; thread_id: string }>(
    {
      table: "signal_messages",
      filter: `thread_id=eq.${threadId}`,
      channelKey: `sig:${threadId}`,
    },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/signal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signalId, kind: signalKind, text }),
      });
      if (r.ok) {
        setDraft("");
        await load();
      } else {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? "Couldn’t send.");
      }
    } finally {
      setSending(false);
    }
  }

  async function deleteConversation() {
    if (deletingConvo) return;
    if (!window.confirm(`Delete this Signal conversation from Rokki?\n\nThis removes Rokki's copy only — it won't delete the chat on Signal.`))
      return;
    setDeletingConvo(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/signal/threads/${threadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (r.ok) {
        onDeleted?.();
      } else {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? "Couldn’t delete the conversation.");
      }
    } finally {
      setDeletingConvo(false);
    }
  }

  async function deleteMessage(id: string) {
    // Optimistic — drop it immediately, then persist.
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const r = await fetch(`/api/v1/signal/messages/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) void load(); // restore on failure
  }

  return (
    <>
      <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
        <MessageSquare className="h-3 w-3 text-success" />
        <span className="text-xs text-text-1">{label}</span>
        <span className="rounded-sm border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-text-3">
          Signal
        </span>
        <button
          type="button"
          onClick={deleteConversation}
          disabled={deletingConvo}
          title="Delete this conversation from Rokki"
          aria-label="Delete conversation"
          className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-text-3 hover:bg-bg-2 hover:text-danger disabled:opacity-40"
        >
          {deletingConvo ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          Delete
        </button>
      </header>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-text-3">
            No messages yet in this Signal chat.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const mine = m.direction === "out";
              return (
                <li
                  key={m.id}
                  className={cn(
                    "group flex flex-col rounded-sm px-2 py-1",
                    mine ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1",
                      mine ? "flex-row" : "flex-row-reverse",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => void deleteMessage(m.id)}
                      title="Delete this message from Rokki"
                      aria-label="Delete message"
                      className="rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div
                      className={cn(
                        "max-w-[75%] rounded px-2 py-1 text-xs",
                        mine ? "bg-accent text-bg-0" : "bg-bg-2 text-text-0",
                      )}
                    >
                      {m.body}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3">
                    <span>{mine ? "you" : (m.sender ?? "them")}</span>
                    <span>·</span>
                    <span>{formatRelative(m.sent_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <form
        onSubmit={submit}
        className="flex flex-col gap-1 border-t border-border bg-bg-1 p-2"
      >
        {error ? (
          <span className="px-1 text-[10px] text-danger">{error}</span>
        ) : null}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${label} on Signal`}
            className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Send
          </button>
        </div>
      </form>
    </>
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
