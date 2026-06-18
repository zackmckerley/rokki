"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, X, MessageSquare, Users } from "lucide-react";

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

  useEffect(() => {
    let alive = true;
    void (async () => {
      // Fire a fresh sync (don't block on it), then load whatever's cached.
      void fetch("/api/v1/signal/sync", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
      const r = await fetch("/api/v1/signal/contacts", { credentials: "include" });
      const b = (await r.json().catch(() => ({}))) as { data?: Contact[] };
      if (alive) {
        setContacts(b.data ?? []);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return contacts;
    return contacts.filter((c) => (c.name ?? c.signal_id).toLowerCase().includes(s));
  }, [contacts, q]);

  async function pick(c: Contact) {
    if (opening) return;
    setOpening(c.signal_id);
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
      const b = (await r.json().catch(() => ({}))) as { data?: { id?: string } };
      if (b.data?.id) onPick(b.data.id);
    } finally {
      setOpening(null);
    }
  }

  return (
    <>
      <header className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border bg-bg-0 px-3">
        <span className="text-xs text-text-1">New Signal message</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded-sm p-1 text-text-3 hover:text-text-0"
        >
          <X className="h-3 w-3" />
        </button>
      </header>
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
            {filtered.map((c) => (
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
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
