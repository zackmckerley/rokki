"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, MessageSquare, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Contact {
  signal_id: string;
  kind: "direct" | "group";
  name: string | null;
}

/**
 * "New Signal message" picker. Lists the user's synced Signal contacts +
 * groups (from signal_contacts), and on select ensures a thread exists and
 * hands its id back so the inbox can open the conversation. Kicks a fresh
 * contact sync on open so the directory is current.
 *
 * Also supports a "New group" mode: multi-select direct contacts + a name to
 * create a brand-new Signal group via the bridge.
 */
export function SignalContactPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (threadId: string) => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Fire a fresh sync (don't block on it), then load whatever's cached.
      void fetch("/api/v1/signal/sync", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      try {
        const r = await fetch("/api/v1/signal/contacts", {
          credentials: "include",
        });
        const b = (await r.json().catch(() => ({}))) as { data?: Contact[] };
        if (alive) {
          setContacts(b.data ?? []);
          if (!r.ok) setError("Couldn’t load contacts.");
        }
      } catch {
        // Network failure (offline / bridge down) — don't hang on the spinner.
        if (alive) setError("Couldn’t load contacts.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Group mode only adds direct contacts (you can't nest a group).
  const source = groupMode
    ? contacts.filter((c) => c.kind === "direct")
    : contacts;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return source;
    return source.filter((c) => (c.name ?? c.signal_id).toLowerCase().includes(s));
  }, [source, q]);

  async function pick(c: Contact) {
    if (opening) return;
    setOpening(c.signal_id);
    setError(null);
    try {
      const r = await fetch("/api/v1/signal/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          signalId: c.signal_id,
          kind: c.kind,
          title: c.name ?? undefined,
        }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        data?: { id?: string };
        errors?: { message: string }[];
      };
      if (!r.ok || !b.data?.id) {
        // Don't leave the user staring at the picker with no feedback.
        setError(b.errors?.[0]?.message ?? "Couldn’t open that conversation.");
        return;
      }
      onPick(b.data.id);
    } catch {
      setError("Couldn’t open that conversation.");
    } finally {
      setOpening(null);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function createGroup() {
    const name = groupName.trim();
    if (creating || !name || selected.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/signal/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, members: [...selected] }),
      });
      const b = (await r.json().catch(() => ({}))) as {
        data?: { threadId?: string | null };
        errors?: { message: string }[];
      };
      if (!r.ok) {
        setError(b.errors?.[0]?.message ?? "Couldn’t create the group.");
        return;
      }
      if (b.data?.threadId) onPick(b.data.threadId);
      else onClose(); // created — it'll appear after the next sync
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
        <span className="text-xs text-text-1">
          {groupMode ? "New group" : "New message"}
        </span>
        <button
          type="button"
          onClick={() => {
            setGroupMode((v) => !v);
            setSelected(new Set());
            setError(null);
          }}
          className="ml-auto flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] text-text-2 hover:text-text-0"
        >
          <Users className="h-3 w-3" />
          {groupMode ? "Single" : "Group"}
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-sm p-1 text-text-3 hover:text-text-0"
        >
          <X className="h-3 w-3" />
        </button>
      </header>

      {groupMode ? (
        <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name"
            className="flex-1 rounded-sm border border-border bg-bg-0 px-2 py-1 text-xs text-text-0 outline-none focus:border-border-focus"
          />
          <button
            type="button"
            onClick={() => void createGroup()}
            disabled={!groupName.trim() || selected.size === 0 || creating}
            className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-xs text-bg-0 disabled:opacity-40"
          >
            {creating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              `Create (${selected.size})`
            )}
          </button>
        </div>
      ) : null}

      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
        <Search className="h-3 w-3 text-text-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search contacts…"
          className="flex-1 bg-transparent text-xs text-text-0 outline-none placeholder:text-text-3"
        />
      </div>

      {error ? (
        <span className="flex-shrink-0 px-3 py-1 text-2xs text-danger">{error}</span>
      ) : null}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-10 text-xs text-text-3">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading contacts…
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-text-3">
            {contacts.length === 0
              ? "No Signal contacts synced yet. They appear here once your account finishes syncing."
              : "No matches."}
          </p>
        ) : (
          <ul>
            {filtered.map((c) =>
              groupMode ? (
                <li key={c.signal_id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.signal_id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-2"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
                        selected.has(c.signal_id)
                          ? "border-accent bg-accent text-bg-0"
                          : "border-border",
                      )}
                    >
                      {selected.has(c.signal_id) ? (
                        <Check className="h-3 w-3" />
                      ) : null}
                    </span>
                    <span className="flex-1 truncate text-text-0">
                      {c.name ?? c.signal_id}
                    </span>
                  </button>
                </li>
              ) : (
                <li key={c.signal_id}>
                  <button
                    type="button"
                    onClick={() => void pick(c)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-bg-2"
                  >
                    {c.kind === "group" ? (
                      <Users className="h-3 w-3 flex-shrink-0 text-text-3" />
                    ) : (
                      <MessageSquare className="h-3 w-3 flex-shrink-0 text-text-3" />
                    )}
                    <span className="flex-1 truncate text-text-0">
                      {c.name ?? c.signal_id}
                    </span>
                    {opening === c.signal_id ? (
                      <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-text-3" />
                    ) : null}
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </>
  );
}
