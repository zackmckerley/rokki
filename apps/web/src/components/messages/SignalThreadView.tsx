"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Send,
  MessageSquare,
  Loader2,
  Trash2,
  X,
  Paperclip,
  FileText,
  Download,
  Images,
  ChevronLeft,
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
import { ChatMessageList, formatBytes } from "./ChatThread";
import { Lightbox } from "./Lightbox";

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
  // Ids optimistically deleted whose server delete hasn't landed yet — a
  // realtime reload must not re-add them mid-delete.
  const deletedRef = useRef<Set<string>>(new Set());
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
    // Drop anything mid-delete so an in-flight delete isn't undone by a reload.
    const server = (body.data?.messages ?? []).filter(
      (m) => !deletedRef.current.has(m.id),
    );
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
    // Optimistic — drop it immediately and guard against a racing reload, then
    // persist.
    deletedRef.current.add(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const r = await fetch(`/api/v1/signal/messages/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      deletedRef.current.delete(id);
      void load(); // restore on failure
      setError("Couldn’t delete that message.");
    }
  }

  // Delete for EVERYONE on Signal (remote delete) — only your own messages.
  async function deleteForEveryone(id: string) {
    deletedRef.current.add(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const r = await fetch(`/api/v1/signal/messages/${id}/remote-delete`, {
      method: "POST",
      credentials: "include",
    });
    if (!r.ok) {
      deletedRef.current.delete(id);
      void load();
      const b = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      setError(b.errors?.[0]?.message ?? "Couldn’t delete for everyone.");
    }
  }

  // All attachments with a usable URL, flattened across messages — powers the
  // media gallery + lightbox. Memoized so it isn't recomputed on every render
  // (this component re-renders on each composer keystroke).
  const mediaItems = useMemo(
    () =>
      messages
        .flatMap((m) =>
          (m.attachments ?? []).map((att) => ({ att, at: m.sent_at })),
        )
        .filter((x) => Boolean(x.att.url)),
    [messages],
  );
  const imageItems = useMemo(
    () =>
      mediaItems.filter((x) => (x.att.content_type ?? "").startsWith("image/")),
    [mediaItems],
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
        <ChatMessageList
          header={<HistoryNotice />}
          emptyText="No messages yet in this Signal chat."
          showSender={signalKind === "group"}
          onDeleteForMe={deleteMessage}
          onDeleteForEveryone={deleteForEveryone}
          onOpenImage={openLightbox}
          messages={messages.map((m) => ({
            id: m.id,
            mine: m.direction === "out",
            sender: m.sender,
            body: m.body ?? "",
            at: m.sent_at,
            status: m.status,
            attachments: m.attachments ?? [],
          }))}
        />
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
                      key={x.att.url ?? x.att.filename ?? i}
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
                    <li key={x.att.url ?? x.att.filename ?? i}>
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

/** Explains Signal's hard no-backfill limit at the top of a thread. */
function HistoryNotice() {
  return (
    <div className="mx-auto mb-2 max-w-[90%] rounded-sm border border-border/60 bg-bg-2/40 px-2.5 py-1.5 text-center text-[10px] leading-snug text-text-3">
      Beginning of this conversation in Rokki. Earlier messages stay on your
      phone — Signal doesn’t sync history to linked devices.
    </div>
  );
}
