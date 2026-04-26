"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare, Send, X, Pencil, Trash2, MoreVertical } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";
import { ConfirmDialog } from "./ConfirmDialog";

interface CommentAuthor {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}
interface Comment {
  id: string;
  entity_type: string;
  entity_id: string;
  terminal_id: string;
  parent_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  created_by: string;
  author: CommentAuthor;
}

interface Mentionable {
  user_id: string;
  full_name: string | null;
}

interface CommentThreadProps {
  entityType: "task" | "file" | "project";
  entityId: string;
  projectId: string;
  /** Users we can @-mention — project members, from the parent. */
  mentionables: Mentionable[];
  /** Optional header label, e.g. "Discussion". Defaults to "Comments". */
  label?: string;
  /** Closes the thread (e.g. dismiss a drawer). */
  onClose?: () => void;
}

/**
 * Inline comment thread. Works for tasks, files, or whole projects. Live
 * updates via Realtime, and supports @mentions with a pop-up picker.
 */
export function CommentThread({
  entityType,
  entityId,
  projectId,
  mentionables,
  label = "Comments",
  onClose,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(
    new Set(),
  );
  const [busyDelete, setBusyDelete] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const supa = createClient();
    void supa.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/comments?entity_type=${entityType}&entity_id=${entityId}`,
        { credentials: "include" },
      );
      const body = (await r.json()) as { data?: Comment[] };
      setComments(body.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeTable<{ id: string; entity_id: string; entity_type: string }>(
    {
      table: "comments",
      filter: `entity_id=eq.${entityId}`,
      channelKey: `comments:${entityType}:${entityId}`,
    },
    {
      onInsert: () => void load(),
      onUpdate: () => void load(),
      onDelete: () => void load(),
    },
  );

  // Close any open ⋮ menu on outside click. Each menu has its own button so
  // we just listen at document level and clear when target is outside any
  // open menu's container.
  useEffect(() => {
    if (!openMenuId) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-comment-menu]")) return;
      setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuId]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/v1/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          terminal_id: projectId,
          body: content,
        }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        alert(body.errors?.[0]?.message ?? "Failed to post comment");
        return;
      }
      setDraft("");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: string) {
    const content = editDraft.trim();
    if (!content) return;
    const r = await fetch(`/api/v1/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ body: content }),
    });
    if (r.ok) {
      setEditingId(null);
      await load();
    } else {
      const body = (await r.json().catch(() => ({}))) as {
        errors?: { message: string }[];
      };
      alert(body.errors?.[0]?.message ?? "Edit failed");
    }
  }

  async function performDelete(id: string) {
    setBusyDelete(true);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      const r = await fetch(`/api/v1/comments/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        // Rollback the strikethrough placeholder.
        setPendingDeleteIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        alert("Delete failed");
        return;
      }
      setConfirmDeleteId(null);
      // Realtime DELETE event will trigger a reload; do an explicit one too
      // so the placeholder doesn't linger if realtime is slow.
      await load();
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-bg-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-text-1">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-semibold">{label}</span>
          <span className="font-mono text-xs text-text-3">
            {comments.length}
          </span>
        </div>
        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && comments.length === 0 ? (
          <p className="text-center text-xs text-text-3">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="py-8 text-center text-xs text-text-3">
            No comments yet. Start the thread.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => {
              const isMine = c.created_by === meId;
              const pending = pendingDeleteIds.has(c.id);
              return (
                <li key={c.id} className="group rounded-sm bg-bg-1 p-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-text-1">
                      {c.author.full_name ?? "someone"}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[10px] text-text-3">
                        {formatWhen(c.created_at)}
                        {c.edited_at ? " · (edited)" : ""}
                      </span>
                      {isMine && editingId !== c.id && !pending ? (
                        <CommentMenu
                          open={openMenuId === c.id}
                          onToggle={() =>
                            setOpenMenuId((prev) =>
                              prev === c.id ? null : c.id,
                            )
                          }
                          onEdit={() => {
                            setEditingId(c.id);
                            setEditDraft(c.body);
                            setOpenMenuId(null);
                          }}
                          onDelete={() => {
                            setConfirmDeleteId(c.id);
                            setOpenMenuId(null);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>

                  {pending ? (
                    <p className="text-xs italic text-text-3 line-through">
                      [deleted]
                    </p>
                  ) : editingId === c.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                            e.preventDefault();
                            void saveEdit(c.id);
                          } else if (e.key === "Escape") {
                            setEditingId(null);
                          }
                        }}
                        autoFocus
                        className="min-h-[60px] resize-y rounded-sm border border-border bg-bg-0 p-1.5 text-xs text-text-0 outline-none focus:border-border-focus"
                      />
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-text-3 hover:text-text-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void saveEdit(c.id)}
                          className="rounded-sm bg-accent px-2 py-0.5 text-bg-0 hover:opacity-90"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <CommentBody
                      body={c.body}
                      mentionables={mentionables}
                      meId={meId}
                    />
                  )}
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
        <MentionTextarea
          ref={inputRef}
          value={draft}
          onChange={setDraft}
          placeholder="Write a comment — Markdown OK, @ to mention"
          mentionables={mentionables}
          disabled={submitting}
        />
        <div className="flex items-center justify-between text-xs text-text-3">
          <span>
            ⌘↵ to send · <span className="text-text-2">@</span> to mention ·
            **md**
          </span>
          <button
            type="submit"
            disabled={!draft.trim() || submitting}
            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-bg-0 transition-opacity disabled:opacity-40"
          >
            <Send className="h-3 w-3" /> Send
          </button>
        </div>
      </form>

      {confirmDeleteId ? (
        <ConfirmDialog
          open={Boolean(confirmDeleteId)}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => performDelete(confirmDeleteId)}
          title="Delete comment"
          body={
            <p>
              This comment will be removed for everyone. You can&apos;t undo this.
            </p>
          }
          confirmLabel="Delete"
          destructive
          busy={busyDelete}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Per-comment ⋮ menu                                                          */
/* ------------------------------------------------------------------------ */

function CommentMenu({
  open,
  onToggle,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative" data-comment-menu>
      <button
        onClick={onToggle}
        aria-label="Comment actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-sm p-0.5 text-text-3 opacity-0 hover:bg-bg-2 hover:text-text-1 group-hover:opacity-100 aria-expanded:opacity-100"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <ul
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[120px] overflow-hidden rounded-sm border border-border bg-bg-2 text-xs shadow-lg"
        >
          <li>
            <button
              role="menuitem"
              onClick={onEdit}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-text-1 hover:bg-bg-3"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </li>
          <li>
            <button
              role="menuitem"
              onClick={onDelete}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-text-1 hover:bg-danger/20 hover:text-danger"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Mention-aware input                                                        */
/* ------------------------------------------------------------------------ */

interface MentionTextareaProps {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  disabled?: boolean;
  mentionables: Mentionable[];
}

const MentionTextarea = forwardRef<HTMLTextAreaElement, MentionTextareaProps>(
  function MentionTextarea(
    { value, onChange, placeholder, disabled, mentionables },
    ref,
  ) {
    const [query, setQuery] = useState<string | null>(null);
    const [mentionStart, setMentionStart] = useState<number | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      onChange(v);
      const cursor = e.target.selectionStart ?? v.length;
      const tail = v.slice(0, cursor);
      const m = tail.match(/(?:^|\s)@([\p{L}0-9 _-]*)$/u);
      if (m) {
        setMentionStart(cursor - (m[1].length + 1));
        setQuery(m[1]);
        setActiveIdx(0);
      } else {
        setMentionStart(null);
        setQuery(null);
      }
    }

    function choose(u: Mentionable) {
      if (mentionStart == null) return;
      const name = u.full_name ?? "user";
      const token = `@[${name}](user:${u.user_id}) `;
      const before = value.slice(0, mentionStart);
      const after = value.slice(mentionStart + 1 + (query ?? "").length);
      onChange(before + token + after);
      setMentionStart(null);
      setQuery(null);
    }

    const filtered =
      query != null
        ? mentionables
            .filter((u) =>
              (u.full_name ?? "").toLowerCase().includes(query.toLowerCase()),
            )
            .slice(0, 6)
        : [];

    return (
      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={(e) => {
            if (filtered.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % filtered.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                choose(filtered[activeIdx]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionStart(null);
                setQuery(null);
                return;
              }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              const form = (e.target as HTMLTextAreaElement).form;
              form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="min-h-[60px] w-full resize-y rounded-sm border border-border bg-bg-0 p-2 text-xs text-text-0 outline-none focus:border-border-focus"
        />
        {filtered.length > 0 ? (
          <ul
            role="listbox"
            className="absolute bottom-full left-0 z-30 mb-1 w-56 overflow-hidden rounded-sm border border-border bg-bg-2 text-xs shadow-lg"
          >
            {filtered.map((u, i) => (
              <li key={u.user_id} role="option" aria-selected={i === activeIdx}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(u)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1 text-left text-text-0",
                    i === activeIdx ? "bg-bg-3" : "hover:bg-bg-3",
                  )}
                >
                  <span className="h-5 w-5 rounded-full bg-bg-3" />
                  {u.full_name ?? "user"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  },
);

/* ------------------------------------------------------------------------ */
/* Rendering                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Render a comment body as Markdown (GFM) with mention chips and safe
 * external links. Storage format `@[Name](user:<uuid>)` is already a valid
 * markdown link — `react-markdown` parses it as `<a href="user:<uuid>">`,
 * so the custom `a` renderer below just inspects the href.
 */
function CommentBody({
  body,
  mentionables,
  meId,
}: {
  body: string;
  mentionables: Mentionable[];
  meId: string | null;
}) {
  const byId = useMemo(
    () => new Map(mentionables.map((m) => [m.user_id, m])),
    [mentionables],
  );

  // Strip the leading "@" from the source so the mention link doesn't render
  // a bare "@" in front of the chip. We keep the `@` inside the chip itself.
  const prepared = useMemo(
    () => body.replace(/@\[([^\]]+)\]\(user:([0-9a-fA-F-]{36})\)/g, "[$1](user:$2)"),
    [body],
  );

  const components: Components = useMemo(
    () => ({
      a({ href, children, ...rest }) {
        const url = href ?? "";
        if (url.startsWith("user:")) {
          const userId = url.slice("user:".length);
          const display =
            byId.get(userId)?.full_name ??
            (typeof children === "string" ? children : null) ??
            "user";
          const isMe = userId === meId;
          return (
            <span
              data-mention-user-id={userId}
              className={cn(
                "rounded-sm px-1 font-medium",
                isMe
                  ? "bg-accent-subtle text-accent"
                  : "bg-bg-2 text-text-1",
              )}
            >
              @{display}
            </span>
          );
        }
        // Real external link — open in a new tab, no referrer.
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      },
    }),
    [byId, meId],
  );

  return (
    <div
      className={cn(
        // Tighter, smaller type for the inline thread vs the global Markdown
        // wrapper used in long-form descriptions.
        "text-xs leading-snug text-text-0",
        "[&>*]:mb-1 [&>*:last-child]:mb-0",
        "[&_p]:text-xs [&_p]:text-text-0",
        "[&_h1]:text-sm [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-xs [&_h3]:font-semibold",
        "[&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal",
        "[&_li]:text-xs [&_li]:text-text-0",
        "[&_a:not([data-mention-user-id])]:text-accent [&_a:not([data-mention-user-id])]:underline-offset-2 [&_a:not([data-mention-user-id]):hover]:underline",
        "[&_code]:rounded-sm [&_code]:bg-bg-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[10px]",
        "[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-border [&_pre]:bg-bg-0 [&_pre]:p-2",
        "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2 [&_blockquote]:text-text-2",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[10px]",
        "[&_th]:border [&_th]:border-border [&_th]:bg-bg-2 [&_th]:px-1 [&_th]:py-0.5",
        "[&_td]:border [&_td]:border-border [&_td]:px-1 [&_td]:py-0.5",
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // skipHtml prevents raw <img>, <script>, etc. from being passed
        // through. Together with `disallowedElements` we also strip any
        // synthesized html-block nodes for defence in depth.
        skipHtml
        disallowedElements={["script", "iframe", "object", "embed"]}
        components={components}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

function formatWhen(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const min = Math.floor(s / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
