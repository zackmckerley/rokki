"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  MessageSquare,
  Loader2,
  Trash2,
  X,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  Paperclip,
  FileText,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";

type SignalStatus = "sending" | "sent" | "delivered" | "read" | "failed";

interface MessageAttachment {
  storage_key?: string;
  content_type: string | null;
  filename: string | null;
  size: number | null;
  /** Short-lived signed URL minted by the GET route, or a local object URL on
   *  an optimistic bubble before the stored row arrives. */
  url?: string | null;
}

interface SignalMessage {
  id: string;
  direction: "in" | "out";
  sender: string | null;
  body: string | null;
  sent_at: string;
  status?: SignalStatus;
  attachments?: MessageAttachment[];
}

/** A file already uploaded to staging and ready to ride the next send. */
interface PendingAttachment {
  storage_key: string;
  content_type: string | null;
  filename: string | null;
  size: number | null;
  /** Object URL for the composer thumbnail; revoked once sent. */
  previewUrl?: string;
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
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingConvo, setDeletingConvo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Opening a direct conversation marks its inbound messages read (sends read
  // receipts so the other person sees ✓✓). Groups are skipped.
  useEffect(() => {
    if (signalKind !== "direct") return;
    const t = setTimeout(() => {
      void fetch(`/api/v1/signal/threads/${threadId}/read`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [threadId, signalKind]);

  useRealtimeTable<{ id: string; thread_id: string }>(
    {
      table: "signal_messages",
      filter: `thread_id=eq.${threadId}`,
      channelKey: `sig:${threadId}`,
    },
    { onInsert: () => void load(), onUpdate: () => void load() },
  );

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    // Let the same file be picked again later.
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/v1/signal/media", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!r.ok) {
          const b = (await r.json().catch(() => ({}))) as {
            errors?: { message: string }[];
          };
          setError(b.errors?.[0]?.message ?? `Couldn’t attach ${file.name}.`);
          continue;
        }
        const b = (await r.json()) as { data?: PendingAttachment };
        if (!b.data) continue;
        const previewUrl = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;
        setPending((prev) => [...prev, { ...b.data!, previewUrl }]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removePending(key: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.storage_key === key);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.storage_key !== key);
    });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    const atts = pending;
    if (!text && atts.length === 0) return;
    // Optimistic: drop the bubble in and clear the box immediately so sending
    // feels instant. The bridge persists it and the realtime insert reconciles
    // this temp row to the stored one on the next load().
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        direction: "out",
        sender: null,
        body: text,
        sent_at: new Date().toISOString(),
        status: "sending",
        attachments: atts.map((a) => ({
          content_type: a.content_type,
          filename: a.filename,
          size: a.size,
          url: a.previewUrl ?? null,
        })),
      },
    ]);
    setDraft("");
    setPending([]);
    setError(null);
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
    });
    try {
      const r = await fetch("/api/v1/signal/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          signalId,
          kind: signalKind,
          text,
          attachments: atts.map((a) => ({
            storage_key: a.storage_key,
            content_type: a.content_type,
            filename: a.filename,
            size: a.size,
          })),
        }),
      });
      if (!r.ok) {
        // Roll back the optimistic bubble and surface the error.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? "Couldn’t send.");
      } else {
        // Drop the composer previews now that the message owns them.
        atts.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError("Couldn’t send.");
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
                        "flex max-w-[75%] flex-col gap-1 rounded px-2 py-1 text-xs",
                        mine ? "bg-accent text-bg-0" : "bg-bg-2 text-text-0",
                      )}
                    >
                      {m.attachments && m.attachments.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {m.attachments.map((a, i) => (
                            <AttachmentView key={i} att={a} mine={mine} />
                          ))}
                        </div>
                      ) : null}
                      {m.body ? <span>{m.body}</span> : null}
                    </div>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3">
                    <span>{mine ? "you" : (m.sender ?? "them")}</span>
                    <span>·</span>
                    <span>{formatRelative(m.sent_at)}</span>
                    {mine && m.status ? <StatusIndicator status={m.status} /> : null}
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
        {pending.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 px-1 pb-0.5">
            {pending.map((p) => (
              <li
                key={p.storage_key}
                className="flex items-center gap-1.5 rounded-sm border border-border bg-bg-0 py-1 pl-1 pr-1.5"
              >
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt={p.filename ?? "attachment"}
                    className="h-7 w-7 rounded-sm object-cover"
                  />
                ) : (
                  <FileText className="h-4 w-4 text-text-3" />
                )}
                <span className="max-w-[10rem] truncate text-[10px] text-text-1">
                  {p.filename ?? "file"}
                </span>
                <button
                  type="button"
                  onClick={() => removePending(p.storage_key)}
                  aria-label={`Remove ${p.filename ?? "attachment"}`}
                  className="rounded-sm p-0.5 text-text-3 hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex gap-2">
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
            disabled={uploading}
            title="Attach files"
            aria-label="Attach files"
            className="flex items-center rounded-sm border border-border bg-bg-0 px-2 text-text-2 hover:text-text-0 disabled:opacity-40"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Message ${label} on Signal`}
            className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && pending.length === 0) || uploading}
            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
          >
            <Send className="h-3 w-3" />
            Send
          </button>
        </div>
      </form>
    </>
  );
}

function StatusIndicator({ status }: { status: SignalStatus }) {
  switch (status) {
    case "sending":
      return <Clock className="h-2.5 w-2.5" aria-label="sending" />;
    case "sent":
      return <Check className="h-2.5 w-2.5" aria-label="sent" />;
    case "delivered":
      return <CheckCheck className="h-2.5 w-2.5" aria-label="delivered" />;
    case "read":
      return <CheckCheck className="h-2.5 w-2.5 text-accent" aria-label="read" />;
    case "failed":
      return <AlertCircle className="h-2.5 w-2.5 text-danger" aria-label="failed to send" />;
    default:
      return null;
  }
}

function AttachmentView({
  att,
  mine,
}: {
  att: MessageAttachment;
  mine: boolean;
}) {
  const isImage = (att.content_type ?? "").startsWith("image/");
  const name = att.filename ?? "file";

  if (isImage && att.url) {
    return (
      <a href={att.url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={att.url}
          alt={name}
          className="max-h-48 max-w-full rounded object-cover"
        />
      </a>
    );
  }

  // Non-image (or an image still missing its signed URL) → compact file card.
  const card = (
    <span
      className={cn(
        "flex items-center gap-2 rounded border px-2 py-1.5",
        mine ? "border-bg-0/30" : "border-border bg-bg-0",
      )}
    >
      <FileText className="h-4 w-4 flex-shrink-0 opacity-80" />
      <span className="flex flex-col overflow-hidden">
        <span className="truncate text-[11px]">{name}</span>
        {att.size ? (
          <span className="text-[10px] opacity-60">{formatBytes(att.size)}</span>
        ) : null}
      </span>
      {att.url ? <Download className="ml-1 h-3 w-3 flex-shrink-0 opacity-70" /> : null}
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
