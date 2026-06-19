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
  Images,
  ChevronLeft,
  ChevronRight,
  Film,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import {
  useAutosize,
  usePersistedDraft,
  composerKeyDown,
} from "./composer-utils";

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
  const [draft, setDraft] = usePersistedDraft(threadId);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deletingConvo, setDeletingConvo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "media">("chat");
  const [lightbox, setLightbox] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element; count depth so the drop
  // overlay only clears when the cursor truly leaves the pane.
  const dragDepth = useRef(0);
  // Temp ids of optimistic bubbles whose send is still in flight — a realtime
  // reload must not wipe these before the stored row exists.
  const inFlightRef = useRef<Set<string>>(new Set());
  // Mirror of `pending` so the unmount cleanup can revoke any staged object URLs.
  const pendingRef = useRef<PendingAttachment[]>([]);
  pendingRef.current = pending;
  useAutosize(composerRef, draft);

  const load = useCallback(async () => {
    const r = await fetch(`/api/v1/signal/threads/${threadId}`, {
      credentials: "include",
    });
    if (!r.ok) return; // transient — keep what we have rather than blanking
    const body = (await r.json()) as { data?: { messages?: SignalMessage[] } };
    const server = body.data?.messages ?? [];
    setMessages((prev) => {
      // Preserve optimistic bubbles whose send hasn't resolved yet, so a
      // realtime-triggered reload mid-send doesn't make the message vanish.
      const keptTemps = prev.filter(
        (m) => m.id.startsWith("temp-") && inFlightRef.current.has(m.id),
      );
      return [...server, ...keptTemps];
    });
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
    });
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  // On unmount (pane closed / thread switched), revoke any object URLs still
  // staged in the composer so we don't leak them.
  useEffect(
    () => () => {
      for (const p of pendingRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    },
    [],
  );

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

  // Stage files (from the paperclip picker OR a drag-and-drop) as pending
  // attachments: upload each to /signal/media, then drop it in the composer
  // ready to send. Used by both the file input and the drop handler.
  async function uploadFiles(files: File[]) {
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

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // let the same file be picked again later
    void uploadFiles(files);
  }

  // Drag-and-drop: drop a file anywhere on the conversation to auto-upload it.
  function hasFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer.types).includes("Files");
  }
  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault(); // required to allow the drop
  }
  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
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
    inFlightRef.current.add(tempId);
    setDraft("");
    setPending([]);
    setError(null);
    requestAnimationFrame(() => {
      scrollerRef.current?.scrollTo(0, scrollerRef.current.scrollHeight);
    });
    // Roll back the optimistic bubble and put the text + staged attachments back
    // in the composer so the user can retry without re-typing or re-attaching.
    // Keep the preview object URLs alive (the restored chips still need them);
    // they're revoked on success, or on unmount if the draft is abandoned.
    const rollback = () => {
      inFlightRef.current.delete(tempId);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft((cur) => (cur ? cur : text));
      setPending((cur) => [...atts, ...cur]);
    };
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
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        rollback();
        setError(b.errors?.[0]?.message ?? "Couldn’t send.");
      } else {
        // Sent: drop the now-owned previews and let the stored row replace the
        // optimistic bubble on the next load (no longer in flight).
        inFlightRef.current.delete(tempId);
        atts.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
        void load();
      }
    } catch {
      rollback();
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

  // All attachments with a usable URL, flattened across messages — powers the
  // media gallery + lightbox.
  const mediaItems = messages
    .flatMap((m) => (m.attachments ?? []).map((att) => ({ att, at: m.sent_at })))
    .filter((x) => Boolean(x.att.url));
  const imageItems = mediaItems.filter((x) =>
    (x.att.content_type ?? "").startsWith("image/"),
  );
  const openLightbox = (url: string) => {
    const idx = imageItems.findIndex((x) => x.att.url === url);
    if (idx >= 0) setLightbox(idx);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
        <MessageSquare className="h-3 w-3 text-success" />
        <span className="text-xs text-text-1">{label}</span>
        <span className="rounded-sm border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-text-3">
          Signal
        </span>
        <button
          type="button"
          onClick={() => setView((v) => (v === "media" ? "chat" : "media"))}
          title={view === "media" ? "Back to chat" : "Shared media & files"}
          aria-label={view === "media" ? "Back to chat" : "Shared media"}
          className={cn(
            "ml-auto flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] hover:bg-bg-2 hover:text-text-0",
            view === "media" ? "text-accent" : "text-text-3",
          )}
        >
          <Images className="h-3 w-3" />
          Media
        </button>
        <button
          type="button"
          onClick={deleteConversation}
          disabled={deletingConvo}
          title="Delete this conversation from Rokki"
          aria-label="Delete conversation"
          className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-[10px] text-text-3 hover:bg-bg-2 hover:text-danger disabled:opacity-40"
        >
          {deletingConvo ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          Delete
        </button>
      </header>
      {view === "media" ? (
        <MediaGallery
          items={mediaItems}
          onOpenImage={openLightbox}
          onBack={() => setView("chat")}
        />
      ) : (
        <>
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-3 py-2 text-xs">
        <HistoryNotice />
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
                            <AttachmentView
                              key={i}
                              att={a}
                              mine={mine}
                              onOpenImage={openLightbox}
                            />
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
          <textarea
            ref={composerRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => composerKeyDown(e, () => void submit())}
            rows={1}
            placeholder={`Message ${label} on Signal`}
            className="max-h-[140px] flex-1 resize-none rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
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
      )}
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-sm border-2 border-dashed border-accent/60 bg-bg-0/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Paperclip className="h-6 w-6" />
            <span className="text-sm font-medium">Drop to attach</span>
          </div>
        </div>
      ) : null}
      {lightbox !== null && imageItems[lightbox] ? (
        <Lightbox
          items={imageItems.map((x) => x.att)}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNav={setLightbox}
        />
      ) : null}
    </div>
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
  onOpenImage,
}: {
  att: MessageAttachment;
  mine: boolean;
  onOpenImage?: (url: string) => void;
}) {
  const type = att.content_type ?? "";
  const name = att.filename ?? "file";

  if (type.startsWith("image/") && att.url) {
    const url = att.url;
    return (
      <button type="button" onClick={() => onOpenImage?.(url)} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          className="max-h-56 max-w-full cursor-zoom-in rounded object-cover"
        />
      </button>
    );
  }
  if (type.startsWith("video/") && att.url) {
    return (
      <video
        src={att.url}
        controls
        className="max-h-56 max-w-full rounded"
        preload="metadata"
      />
    );
  }
  if (type.startsWith("audio/") && att.url) {
    return <audio src={att.url} controls className="w-full" preload="metadata" />;
  }

  // Non-media (or a file still missing its signed URL) → compact file card.
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

type MediaEntry = { att: MessageAttachment; at: string };

/** WhatsApp-style "shared media & files" view for a conversation. */
function MediaGallery({
  items,
  onOpenImage,
  onBack,
}: {
  items: MediaEntry[];
  onOpenImage: (url: string) => void;
  onBack: () => void;
}) {
  const images = items.filter((x) =>
    (x.att.content_type ?? "").startsWith("image/"),
  );
  const files = items.filter(
    (x) => !(x.att.content_type ?? "").startsWith("image/"),
  );
  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 text-xs">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 flex items-center gap-1 text-[10px] text-text-3 hover:text-text-1"
      >
        <ChevronLeft className="h-3 w-3" /> Back to chat
      </button>
      {items.length === 0 ? (
        <p className="py-10 text-center text-text-3">
          No media or files shared in this chat yet.
        </p>
      ) : (
        <>
          {images.length > 0 ? (
            <section className="mb-4">
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
                Media · {images.length}
              </h3>
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                {images.map((x, i) =>
                  x.att.url ? (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onOpenImage(x.att.url as string)}
                      className="aspect-square overflow-hidden rounded-sm bg-bg-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={x.att.url}
                        alt={x.att.filename ?? "image"}
                        className="h-full w-full cursor-zoom-in object-cover transition-transform hover:scale-105"
                      />
                    </button>
                  ) : null,
                )}
              </div>
            </section>
          ) : null}
          {files.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
                Files · {files.length}
              </h3>
              <ul className="flex flex-col gap-1">
                {files.map((x, i) => {
                  const type = x.att.content_type ?? "";
                  return (
                    <li key={i}>
                      <a
                        href={x.att.url ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={x.att.filename ?? "file"}
                        className="flex items-center gap-2 rounded-sm border border-border bg-bg-0 px-2 py-1.5 hover:bg-bg-2"
                      >
                        {type.startsWith("video/") ? (
                          <Film className="h-4 w-4 flex-shrink-0 text-text-3" />
                        ) : type.startsWith("audio/") ? (
                          <Music className="h-4 w-4 flex-shrink-0 text-text-3" />
                        ) : (
                          <FileText className="h-4 w-4 flex-shrink-0 text-text-3" />
                        )}
                        <span className="flex-1 truncate text-text-1">
                          {x.att.filename ?? "file"}
                        </span>
                        {x.att.size ? (
                          <span className="text-[10px] text-text-3">
                            {formatBytes(x.att.size)}
                          </span>
                        ) : null}
                        <Download className="h-3 w-3 flex-shrink-0 text-text-3" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Full-screen image viewer with prev/next + keyboard nav. */
function Lightbox({
  items,
  index,
  onClose,
  onNav,
}: {
  items: MessageAttachment[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const current = items[index];
  const go = useCallback(
    (delta: number) => onNav((index + delta + items.length) % items.length),
    [index, items.length, onNav],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);
  if (!current?.url) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {items.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            go(-1);
          }}
          aria-label="Previous"
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt={current.filename ?? "image"}
        onClick={stop}
        className="max-h-full max-w-full rounded object-contain"
      />
      {items.length > 1 ? (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            go(1);
          }}
          aria-label="Next"
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      ) : null}
      <a
        href={current.url}
        download={current.filename ?? "image"}
        onClick={stop}
        className="absolute bottom-4 flex items-center gap-1.5 rounded-sm bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/20"
      >
        <Download className="h-3.5 w-3.5" /> Download
      </a>
    </div>
  );
}

/** Explains Signal's hard no-backfill limit at the top of a thread. */
function HistoryNotice() {
  return (
    <div className="mx-auto mb-2 max-w-[90%] rounded-sm border border-border/60 bg-bg-2/40 px-2.5 py-1.5 text-center text-[10px] leading-snug text-text-3">
      Beginning of this conversation in Rokki. Earlier messages stay on your
      phone — Signal doesn’t sync history to linked devices.
    </div>
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
