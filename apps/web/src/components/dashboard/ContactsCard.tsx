"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Search, Users, X, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DashboardCard } from "./DashboardCard";
import type { ContactRow } from "@/lib/contacts/db";
import {
  listContacts,
  createContact,
  getLinkSuggestions,
  linkContact,
  type ContactListItem,
  type DuplicateHit,
  type LinkSuggestion,
} from "@/modules/contacts/lib/client-api";
import { ContactForm } from "@/modules/contacts/components/ContactForm";
import { ContactDetail } from "@/modules/contacts/components/ContactDetail";

function initials(c: Pick<ContactListItem, "first_name" | "last_name" | "nickname">) {
  const a = (c.first_name || c.nickname || "").trim()[0] ?? "";
  const b = (c.last_name || "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}
function rowName(c: ContactListItem) {
  return (
    c.nickname?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.primary_email ||
    "Unnamed"
  );
}

/** Measure an element's width via ResizeObserver (SSR-safe; 0 until mounted).
 *  Same helper the Messages card uses to drive its split layout. */
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

/** Centered modal — used only for the create form. */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-6 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-bg-1 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-sm p-1 text-text-2 hover:text-text-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      </div>
    </div>
  );
}

function SelectPrompt() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-text-3">
      <Users className="h-6 w-6" aria-hidden="true" />
      <p className="text-xs">Select a contact to see their card.</p>
    </div>
  );
}

/**
 * Dashboard Contacts panel. Signal-style split: the contact list on the left,
 * the selected contact's card on the right (where the message thread sits in
 * Messenger). When the panel is narrow it falls back to the list, and tapping a
 * contact drills into the card with a back button.
 */
export function ContactsCard() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Split layout (mirrors MessagesCard).
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [listWidth, setListWidth] = useState(260);
  const split = width >= 560;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: MouseEvent) => {
      const w = startW + (ev.clientX - startX);
      if (w >= 200 && w <= 460) setListWidth(w);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  const resizeByKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setListWidth((w) =>
      Math.max(200, Math.min(460, w + (e.key === "ArrowRight" ? 16 : -16))),
    );
  };

  // Create
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateHit | null>(null);
  const [lastPatch, setLastPatch] = useState<Partial<ContactRow> | null>(null);

  // Rokki-user link suggestions.
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  function loadSuggestions() {
    getLinkSuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
  }
  useEffect(() => {
    loadSuggestions();
  }, []);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      listContacts({ q: q.trim() || undefined, limit: 200 })
        .then((rows) => alive && setContacts(rows))
        .catch(() => {})
        .finally(() => alive && setLoading(false));
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  async function refresh() {
    const next = await listContacts({ q: q.trim() || undefined, limit: 200 }).catch(
      () => null,
    );
    if (next) setContacts(next);
  }

  function openCreate() {
    setDuplicate(null);
    setLastPatch(null);
    setCreateErr(null);
    setCreating(true);
  }
  function closeCreate() {
    setCreating(false);
    setDuplicate(null);
    setLastPatch(null);
  }

  async function create(patch: Partial<ContactRow>, force = false) {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await createContact(patch, force);
      if (!res.contact && res.duplicate) {
        setDuplicate(res.duplicate);
        setLastPatch(patch);
        return;
      }
      closeCreate();
      await refresh();
      loadSuggestions();
      if (res.contact) setSelectedId(res.contact.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }

  function dupName(d: DuplicateHit): string {
    return (
      [d.first_name, d.last_name].filter(Boolean).join(" ").trim() ||
      "an existing contact"
    );
  }

  async function acceptSuggestion(s: LinkSuggestion) {
    try {
      await linkContact(s.contact_id);
      setSuggestions((prev) => prev.filter((x) => x.contact_id !== s.contact_id));
      await refresh();
    } catch {
      /* leave the suggestion in place on failure */
    }
  }

  // ── the list pane (search + suggestions + rows) ───────────────────
  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="flex-shrink-0 border-b border-border/60 p-2">
        <div className="flex items-center gap-1.5 rounded border border-border bg-bg-2 px-2 py-1 focus-within:border-border-focus">
          <Search className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, email…"
            aria-label="Search contacts"
            className="min-w-0 flex-1 bg-transparent text-xs text-text-1 placeholder:text-text-3 outline-none"
          />
        </div>
      </div>

      {/* Rokki-link suggestions */}
      {suggestions.length > 0 && (
        <div className="flex-shrink-0 border-b border-border/60 bg-bg-2/40">
          <button
            type="button"
            onClick={() => setShowSuggestions((s) => !s)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-2xs text-text-2 hover:text-text-0"
          >
            <Link2 className="h-3 w-3 text-accent" aria-hidden="true" />
            {suggestions.length}{" "}
            {suggestions.length === 1 ? "contact is" : "contacts are"} on Rokki
            <span className="ml-auto text-text-3">
              {showSuggestions ? "Hide" : "Review"}
            </span>
          </button>
          {showSuggestions && (
            <ul className="divide-y divide-border/20 pb-1">
              {suggestions.map((s) => (
                <li key={s.contact_id} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-text-1">
                    {s.name}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => acceptSuggestion(s)}>
                    <Link2 className="h-3 w-3" /> Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-8 text-text-3">
          <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Users className="h-5 w-5 text-text-3" aria-hidden="true" />
          <p className="text-xs text-text-2">
            {q ? "No contacts match." : "No contacts yet."}
          </p>
          {!q && (
            <Button size="sm" variant="ghost" onClick={openCreate}>
              <Plus className="h-3 w-3" /> Add a contact
            </Button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
          {contacts.map((c) => {
            const active = split && c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-current={active ? "true" : undefined}
                  className={`flex w-full items-center gap-2.5 px-3 py-[var(--rk-row-py)] text-left ${
                    active ? "bg-bg-2" : "hover:bg-bg-2"
                  }`}
                >
                  {c.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.avatar_url}
                      alt=""
                      className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 font-mono text-2xs text-text-1">
                      {initials(c)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-text-0">
                      {rowName(c)}
                      {c.user_id && (
                        <span className="ml-1 inline-block rounded-sm bg-accent/15 px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-accent">
                          Rokki
                        </span>
                      )}
                    </span>
                    {(c.company || c.title) && (
                      <span className="block truncate text-2xs text-text-3">
                        {[c.title, c.company].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const detailPane = selectedId ? (
    <ContactDetail
      contactId={selectedId}
      onClose={() => setSelectedId(null)}
      onChanged={() => {
        void refresh();
        loadSuggestions();
      }}
    />
  ) : null;

  // ── body: split (list | card) vs narrow (list, then drill-in) ─────
  let body: React.ReactNode;
  if (split) {
    body = (
      <div className="flex min-h-0 flex-1">
        <div
          style={{ width: Math.min(listWidth, Math.max(200, width - 300)) }}
          className="flex flex-shrink-0 flex-col border-r border-border"
        >
          {listPane}
        </div>
        <div
          onMouseDown={startResize}
          onKeyDown={resizeByKey}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize the contact list"
          aria-valuemin={200}
          aria-valuemax={460}
          aria-valuenow={Math.round(listWidth)}
          title="Drag, or focus and use ← / → to resize"
          className="z-10 -ml-1 w-2 flex-shrink-0 cursor-col-resize transition-colors hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none"
        />
        <div className="flex min-h-0 flex-1 flex-col">{detailPane ?? <SelectPrompt />}</div>
      </div>
    );
  } else if (selectedId) {
    body = <div className="flex min-h-0 flex-1 flex-col">{detailPane}</div>;
  } else {
    body = listPane;
  }

  return (
    <DashboardCard
      title="Contacts"
      count={contacts.length}
      expandHref={null}
      bodyClassName="flex min-h-0 flex-col overflow-hidden"
      headerRight={
        <button
          type="button"
          onClick={openCreate}
          aria-label="New contact"
          className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      }
    >
      <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col">
        {body}
      </div>

      {/* Create modal */}
      {creating && (
        <Modal title="New contact" onClose={closeCreate}>
          {duplicate && (
            <div className="mb-3 rounded border border-border bg-bg-2 p-2 text-2xs text-text-1">
              <p>
                Looks like a duplicate of{" "}
                <span className="font-medium">{dupName(duplicate)}</span> (same
                email or phone).
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const id = duplicate.id;
                    closeCreate();
                    setSelectedId(id);
                  }}
                >
                  Open existing
                </Button>
                <Button
                  size="sm"
                  disabled={createBusy || !lastPatch}
                  onClick={() => lastPatch && create(lastPatch, true)}
                >
                  Create anyway
                </Button>
              </div>
            </div>
          )}
          <ContactForm
            busy={createBusy}
            error={createErr}
            submitLabel="Create"
            onCancel={closeCreate}
            onSubmit={create}
          />
        </Modal>
      )}
    </DashboardCard>
  );
}
