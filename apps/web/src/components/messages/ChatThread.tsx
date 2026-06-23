"use client";

import {
  Fragment,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  FileText,
  MoreHorizontal,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared chat rendering used by BOTH the dashboard Messages card
 * (ThreadQuickView) and the full-page Signal conversation (SignalThreadView),
 * so the two surfaces stay pixel-identical and never drift again.
 *
 * It matches iMessage / WhatsApp conventions: consecutive messages from the
 * same side are grouped (tight spacing, tail only on the last bubble, one
 * timestamp per run); emoji-only messages render jumbo and bubble-less; images
 * are full-bleed (the image *is* the bubble) with a 2-up collage for several
 * and a "GIF" badge on GIFs; videos play inline; audio gets a player; other
 * files render as a tidy card. A big time gap drops a centered date/time chip.
 */

export type SignalStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface ChatAttachment {
  /** Signed URL (or a local object URL on an optimistic bubble). */
  url?: string | null;
  content_type: string | null;
  filename: string | null;
  size: number | null;
}

export interface ChatMessage {
  id: string;
  /** True for outgoing messages (right side, accent bubble). */
  mine: boolean;
  /** Display name for an incoming message — shown above group runs. */
  sender?: string | null;
  body: string;
  /** ISO timestamp. */
  at: string;
  status?: SignalStatus;
  attachments: ChatAttachment[];
}

/** Render a thread's messages as grouped, iMessage/WhatsApp-style bubbles.
 *  The caller owns the scroll container; this renders the optional header and
 *  the message list (or an empty state). */
export function ChatMessageList({
  messages,
  showSender = false,
  onDeleteForMe,
  onDeleteForEveryone,
  onOpenImage,
  header,
  emptyText = "No messages yet.",
}: {
  messages: ChatMessage[];
  /** Show the sender's name above incoming group runs (group chats). */
  showSender?: boolean;
  /** When set, messages get a ⋯ menu with "Delete for me". */
  onDeleteForMe?: (id: string) => void;
  /** When set, your own messages also get "Delete for everyone". */
  onDeleteForEveryone?: (id: string) => void;
  /** When set, tapping an image calls this (lightbox) instead of opening a
   *  new tab. */
  onOpenImage?: (url: string) => void;
  header?: ReactNode;
  emptyText?: string;
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null);

  // Close an open per-message menu on any outside click.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    const t = setTimeout(() => window.addEventListener("mousedown", close), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", close);
    };
  }, [menuFor]);

  if (messages.length === 0) {
    return (
      <>
        {header}
        <p className="py-6 text-center text-xs text-text-3">{emptyText}</p>
      </>
    );
  }

  return (
    <>
      {header}
      <ul className="flex flex-col">
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const firstInGroup =
            !prev || prev.mine !== m.mine || !withinRun(prev.at, m.at);
          const lastInGroup =
            !next || next.mine !== m.mine || !withinRun(m.at, next.at);
          const bigGap =
            !prev ||
            new Date(m.at).getTime() - new Date(prev.at).getTime() >
              60 * 60_000;
          // Visual media needs a URL to render; anything without one (an
          // optimistic video, or an image whose signed URL failed) falls back
          // to a file card so we always show *something* (the filename).
          const imgs = m.attachments.filter((a) => isImage(a) && a.url);
          const vids = m.attachments.filter((a) => isVideo(a) && a.url);
          const docs = m.attachments.filter(
            (a) => !((isImage(a) || isVideo(a)) && a.url),
          );
          const emojiOnly =
            m.attachments.length === 0 && isEmojiOnly(m.body);
          const canDelete =
            Boolean(onDeleteForMe) && !m.id.startsWith("temp-");
          const hasBody = m.body.trim().length > 0;
          // The ⋯ menu is worth showing if there's text to copy or an action.
          const showMenu = hasBody || canDelete;
          const showName =
            showSender && !m.mine && firstInGroup && Boolean(m.sender);
          return (
            <Fragment key={m.id}>
              {bigGap ? (
                <li className="my-2 flex justify-center">
                  <span className="rounded-full bg-bg-2/70 px-2 py-0.5 text-[10px] font-medium text-text-3">
                    {formatStamp(m.at)}
                  </span>
                </li>
              ) : null}
              <li
                className={cn(
                  "group/msg relative flex flex-col",
                  m.mine ? "items-end" : "items-start",
                  firstInGroup ? "mt-2" : "mt-0.5",
                )}
              >
                {showName ? (
                  <span className="mb-0.5 px-1 text-2xs font-medium text-text-2">
                    {m.sender}
                  </span>
                ) : null}
                <div
                  className={cn(
                    "flex max-w-[82%] items-center gap-1",
                    m.mine ? "flex-row" : "flex-row-reverse",
                  )}
                >
                  {showMenu ? (
                    <button
                      type="button"
                      onClick={() =>
                        setMenuFor((cur) => (cur === m.id ? null : m.id))
                      }
                      aria-label="Message options"
                      className="flex-shrink-0 rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:text-text-0 group-hover/msg:opacity-100"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {emojiOnly ? (
                    <div
                      className={cn(
                        "px-1 py-0.5 leading-none",
                        emojiSize(m.body),
                      )}
                    >
                      {m.body}
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "relative overflow-hidden rounded-[18px] shadow-sm",
                        m.mine
                          ? "bg-accent text-bg-0"
                          : "bg-bg-2 text-text-0",
                        lastInGroup &&
                          (m.mine ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
                      )}
                    >
                      {imgs.length > 0 ? (
                        <ImageGroup imgs={imgs} onOpenImage={onOpenImage} />
                      ) : null}
                      {vids.map((a, k) =>
                        a.url ? (
                          <video
                            key={`v${k}`}
                            src={a.url}
                            controls
                            preload="metadata"
                            className="block max-h-60 max-w-[260px]"
                          />
                        ) : null,
                      )}
                      {docs.length > 0 ? (
                        <div className="flex flex-col gap-1 p-1.5">
                          {docs.map((a, k) => (
                            <DocAttachment key={k} att={a} mine={m.mine} />
                          ))}
                        </div>
                      ) : null}
                      {m.body ? (
                        <div className="whitespace-pre-wrap break-words px-3 py-2 text-xs leading-relaxed">
                          {linkify(m.body, m.mine)}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                {menuFor === m.id ? (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    className={cn(
                      "absolute top-6 z-20 flex flex-col rounded-md border border-border bg-bg-1 py-1 text-2xs shadow-lg",
                      m.mine ? "right-5" : "left-5",
                    )}
                  >
                    {hasBody ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          void navigator.clipboard?.writeText(m.body);
                        }}
                        className="whitespace-nowrap px-3 py-1 text-left text-text-1 hover:bg-bg-2"
                      >
                        Copy text
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          onDeleteForMe?.(m.id);
                        }}
                        className="whitespace-nowrap px-3 py-1 text-left text-text-1 hover:bg-bg-2"
                      >
                        Delete for me
                      </button>
                    ) : null}
                    {canDelete && m.mine && onDeleteForEveryone ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          onDeleteForEveryone(m.id);
                        }}
                        className="whitespace-nowrap px-3 py-1 text-left text-danger hover:bg-bg-2"
                      >
                        Delete for everyone
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {lastInGroup ? (
                  <span
                    title={new Date(m.at).toLocaleString()}
                    className="mt-0.5 flex items-center gap-1 px-1 text-2xs text-text-3"
                  >
                    {formatRelative(m.at)}
                    {m.mine && m.status ? <StatusTick status={m.status} /> : null}
                  </span>
                ) : null}
              </li>
            </Fragment>
          );
        })}
      </ul>
    </>
  );
}

/** Image attachment(s) rendered flush inside the bubble — a single image fills
 *  the bubble (image *is* the bubble); multiple become a 2-up collage with a
 *  "+N" overlay. GIFs get a badge and loop on their own (animated <img>). When
 *  onOpenImage is provided the tile opens a lightbox; otherwise a new tab. */
function ImageGroup({
  imgs,
  onOpenImage,
}: {
  imgs: ChatAttachment[];
  onOpenImage?: (url: string) => void;
}) {
  if (imgs.length === 1) {
    const a = imgs[0];
    const gif = (a.content_type ?? "") === "image/gif";
    const inner = (
      <span className="relative block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={a.url ?? undefined}
          alt={a.filename ?? "image"}
          className="block max-h-60 max-w-[260px] object-cover"
        />
        {gif ? (
          <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
            GIF
          </span>
        ) : null}
      </span>
    );
    if (!a.url) return inner;
    return onOpenImage ? (
      <button
        type="button"
        onClick={() => onOpenImage(a.url as string)}
        className="block cursor-zoom-in"
      >
        {inner}
      </button>
    ) : (
      <a href={a.url} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  const shown = imgs.slice(0, 4);
  const extra = imgs.length - shown.length;
  return (
    <div className="grid w-[238px] grid-cols-2 gap-0.5">
      {shown.map((a, i) => {
        const last = i === shown.length - 1 && extra > 0;
        const tile = (
          <span className="relative block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url ?? undefined}
              alt={a.filename ?? "image"}
              className="aspect-square w-full object-cover"
            />
            {last ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-semibold text-white">
                +{extra}
              </span>
            ) : null}
          </span>
        );
        if (!a.url) return <Fragment key={i}>{tile}</Fragment>;
        return onOpenImage ? (
          <button
            key={i}
            type="button"
            onClick={() => onOpenImage(a.url as string)}
            className="block cursor-zoom-in"
          >
            {tile}
          </button>
        ) : (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer">
            {tile}
          </a>
        );
      })}
    </div>
  );
}

/** Audio gets an inline player; any other non-visual file gets a tidy card
 *  (icon + filename + human size) that inherits the bubble's text color. */
function DocAttachment({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const type = att.content_type ?? "";
  if (type.startsWith("audio/") && att.url) {
    return (
      <audio
        src={att.url}
        controls
        preload="metadata"
        className="w-full min-w-[180px]"
      />
    );
  }
  const name = att.filename ?? "file";
  const card = (
    <span
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5",
        mine ? "bg-black/10" : "bg-black/15",
      )}
    >
      <FileText className="h-4 w-4 flex-shrink-0 opacity-80" />
      <span className="min-w-0">
        <span className="block max-w-[180px] truncate text-xs">{name}</span>
        {att.size ? (
          <span className="block text-[10px] opacity-70">
            {formatBytes(att.size)}
          </span>
        ) : null}
      </span>
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

/** Sent / delivered / read ticks under an outgoing message. */
export function StatusTick({ status }: { status: SignalStatus }) {
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
      return (
        <AlertCircle
          className="h-2.5 w-2.5 text-danger"
          aria-label="failed to send"
        />
      );
    default:
      return null;
  }
}

// Matches http(s) URLs, stopping before trailing punctuation so a URL at the
// end of a sentence ("see https://x.com.") doesn't swallow the period.
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,!?;:'")\]}]/gi;

/** Turn bare URLs in message text into safe, clickable links (iMessage/WhatsApp
 *  parity). Builds React nodes by splitting on matches — never innerHTML — so
 *  there's no injection surface. */
export function linkify(text: string, mine: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(URL_RE); // fresh instance: reset lastIndex per call
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const url = m[0];
    out.push(
      <a
        key={`${m.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={cn(
          "break-all underline underline-offset-2",
          mine ? "text-bg-0" : "text-accent",
        )}
      >
        {url}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function isImage(att: ChatAttachment): boolean {
  return (att.content_type ?? "").startsWith("image/");
}
function isVideo(att: ChatAttachment): boolean {
  return (att.content_type ?? "").startsWith("video/");
}

/** Two messages are in the same "run" when from the same side within 5 min. */
function withinRun(a: string, b: string): boolean {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) < 5 * 60_000;
}

/** Split into user-perceived characters (grapheme clusters) so emoji ZWJ
 *  sequences (👨‍👩‍👧), flags (🇺🇸) and keycaps (1️⃣) each count as one. */
function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(s), (g) => g.segment);
  }
  return Array.from(s); // fallback: code points (imperfect for ZWJ runs)
}

/** True when a grapheme reads as an emoji — pictographic, flag, or keycap. */
function isEmojiGrapheme(g: string): boolean {
  return (
    /[0-9#*]️?⃣/u.test(g) || // keycap: 1️⃣ #️⃣
    /\p{Regional_Indicator}/u.test(g) || // flag: two regional indicators
    /\p{Extended_Pictographic}/u.test(g) // most emoji, incl. ZWJ sequences
  );
}

/** Visible (non-space) grapheme clusters of a trimmed string. */
function visibleGraphemes(s: string): string[] {
  return graphemes((s ?? "").trim()).filter((g) => g.trim() !== "");
}

/** True when a message is nothing but emoji (≤6) — iMessage/WhatsApp render
 *  those big and bubble-less. */
export function isEmojiOnly(s: string): boolean {
  const gs = visibleGraphemes(s);
  return gs.length > 0 && gs.length <= 6 && gs.every(isEmojiGrapheme);
}

/** Jumbo size for an emoji-only message — biggest for a lone emoji. */
function emojiSize(s: string): string {
  const n = visibleGraphemes(s).length;
  if (n <= 1) return "text-5xl";
  if (n === 2) return "text-4xl";
  return "text-3xl";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Date/time chip shown between messages with a big time gap (iMessage-style).*/
function formatStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return time;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

/** Compact relative timestamp (now / 5m / 3h / 2d / Jun 4). */
export function formatRelative(iso: string): string {
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
