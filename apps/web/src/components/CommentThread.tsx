"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeTable } from "@/lib/supabase/realtime";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";

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
        toast.error(body.errors?.[0]?.message ?? "Failed to post comment");
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
    }
  }

  async function del(id: string) {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/v1/comments/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    await load();
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
            {comments.map((c) => (
              <li key={c.id} className="group rounded-sm bg-bg-1 p-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-1">
                    {c.author.full_name ?? "someone"}
                  </span>
                  <span className="font-mono text-[10px] text-text-3">
                    {formatWhen(c.created_at)}
                    {c.edited_at ? " · edited" : ""}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
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
                        onClick={() => saveEdit(c.id)}
                        className="rounded-sm bg-accent px-2 py-0.5 text-bg-0 hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <RenderedBody
                      body={c.body}
                      mentionables={mentionables}
                      meId={meId}
                    />
                    {c.created_by === meId ? (
                      <div className="mt-1 flex items-center gap-2 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => {
                            setEditingId(c.id);
                            setEditDraft(c.body);
                          }}
                          className="flex items-center gap-1 text-text-3 hover:text-text-1"
                        >
                          <Pencil className="h-2.5 w-2.5" /> edit
                        </button>
                        <button
                          onClick={() => del(c.id)}
                          className="flex items-center gap-1 text-text-3 hover:text-danger"
                        >
                          <Trash2 className="h-2.5 w-2.5" /> delete
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
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
          placeholder="Write a comment — use @ to mention"
          mentionables={mentionables}
          disabled={submitting}
        />
        <div className="flex items-center justify-between text-xs text-text-3">
          <span>
            ⌘↵ to send ·{" "}
            <span className="text-text-2">@</span> to mention
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

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const v = e.target.value;
      onChange(v);
      const cursor = e.target.selectionStart ?? v.length;
      const tail = v.slice(0, cursor);
      const m = tail.match(/(?:^|\s)@([\p{L}0-9 _-]*)$/u);
      if (m) {
        setMentionStart(cursor - (m[1].length + 1));
        setQuery(m[1]);
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
          <ul className="absolute bottom-full left-0 mb-1 w-56 overflow-hidden rounded-sm border border-border bg-bg-2 text-xs shadow-lg">
            {filtered.map((u) => (
              <li key={u.user_id}>
                <button
                  type="button"
                  onClick={() => choose(u)}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-text-0 hover:bg-bg-3"
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

function RenderedBody({
  body,
  mentionables,
  meId,
}: {
  body: string;
  mentionables: Mentionable[];
  meId: string | null;
}) {
  const MENTION_RE = /@\[([^\]]+)\]\(user:([0-9a-fA-F-]{36})\)/g;
  const byId = new Map(mentionables.map((m) => [m.user_id, m]));
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index == null) continue;
    if (m.index > lastIndex) {
      parts.push(body.slice(lastIndex, m.index));
    }
    const name = byId.get(m[2])?.full_name ?? m[1];
    const isMe = m[2] === meId;
    parts.push(
      <span
        key={`${m.index}`}
        className={cn(
          "rounded-sm px-1 font-medium",
          isMe
            ? "bg-accent-subtle text-accent"
            : "bg-bg-2 text-text-1",
        )}
      >
        @{name}
      </span>,
    );
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));
  return (
    <p className="whitespace-pre-wrap text-xs text-text-0">{parts}</p>
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
