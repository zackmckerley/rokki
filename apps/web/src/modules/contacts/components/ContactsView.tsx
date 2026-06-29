"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContactRow } from "@/lib/contacts/db";
import {
  listContacts,
  createContact,
  type ContactListItem,
  type DuplicateHit,
} from "../lib/client-api";
import { ContactForm } from "./ContactForm";
import { ContactDetail } from "./ContactDetail";

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

export function ContactsView({
  initialContacts,
}: {
  initialContacts: ContactListItem[];
}) {
  const [contacts, setContacts] = useState<ContactListItem[]>(initialContacts);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateHit | null>(null);
  const [lastPatch, setLastPatch] = useState<Partial<ContactRow> | null>(null);

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

  // Debounced server search/refresh.
  useEffect(() => {
    const t = setTimeout(() => {
      listContacts({ q: q.trim() || undefined, limit: 200 })
        .then(setContacts)
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function refresh() {
    const next = await listContacts({ q: q.trim() || undefined, limit: 200 }).catch(
      () => null,
    );
    if (next) setContacts(next);
  }

  async function create(patch: Partial<ContactRow>, force = false) {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await createContact(patch, force);
      if (!res.contact && res.duplicate) {
        // Not a dead-end: surface an actionable banner (create anyway / open).
        setDuplicate(res.duplicate);
        setLastPatch(patch);
        return;
      }
      closeCreate();
      await refresh();
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

  const empty = useMemo(() => contacts.length === 0, [contacts]);
  // Pin the viewer's own self-contact ("You") to the top, keep server order below.
  const ordered = useMemo(() => {
    const self = contacts.filter((c) => c.source === "self");
    if (self.length === 0) return contacts;
    return [...self, ...contacts.filter((c) => c.source !== "self")];
  }, [contacts]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Users className="h-4 w-4 text-text-2" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-text-0">Contacts</h1>
        <span className="font-mono text-2xs text-text-3">{contacts.length}</span>
        <div className="ml-auto flex w-48 items-center gap-1.5 rounded border border-border bg-bg-2 px-2 py-1 focus-within:border-border-focus">
          <Search className="h-3 w-3 flex-shrink-0 text-text-3" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, company, email…"
            aria-label="Search contacts"
            className="min-w-0 flex-1 bg-transparent text-xs text-text-1 placeholder:text-text-3 outline-none"
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3 w-3" /> New
        </Button>
      </div>

      {/* List */}
      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <Users className="h-6 w-6 text-text-3" aria-hidden="true" />
          <p className="text-xs text-text-2">
            {q ? "No contacts match your search." : "No contacts yet."}
          </p>
          {!q && (
            <Button size="sm" variant="ghost" onClick={openCreate}>
              <Plus className="h-3 w-3" /> Add your first contact
            </Button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
          {ordered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center gap-2.5 px-3 py-[var(--rk-row-py)] text-left hover:bg-bg-2"
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
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-text-0">
                      {rowName(c)}
                    </span>
                    {c.source === "self" && (
                      <span className="flex-shrink-0 rounded-sm bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                        You
                      </span>
                    )}
                  </span>
                  {(c.company || c.title) && (
                    <span className="block truncate text-2xs text-text-3">
                      {[c.title, c.company].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="hidden min-w-0 max-w-[14rem] flex-1 gap-1 truncate text-2xs text-text-3 md:flex">
                  {c.contact_types.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-sm border border-border px-1 capitalize"
                    >
                      {t}
                    </span>
                  ))}
                </span>
                <span className="hidden truncate text-2xs text-text-3 sm:block sm:w-44">
                  {c.primary_email ?? c.primary_phone ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Detail drawer (modal) */}
      {selectedId && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="w-full max-w-[380px] border-l border-border bg-bg-1 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ContactDetail
              contactId={selectedId}
              onClose={() => setSelectedId(null)}
              onChanged={refresh}
            />
          </div>
        </div>
      )}

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
    </div>
  );
}
