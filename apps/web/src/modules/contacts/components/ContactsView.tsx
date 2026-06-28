"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContactRow } from "@/lib/contacts/db";
import {
  listContacts,
  createContact,
  type ContactListItem,
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

  async function create(patch: Partial<ContactRow>) {
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const res = await createContact(patch);
      if (!res.contact && res.duplicate) {
        setCreateErr(
          `Looks like a duplicate of ${res.duplicate.first_name} ${res.duplicate.last_name}.`,
        );
        return;
      }
      setCreating(false);
      await refresh();
      if (res.contact) setSelectedId(res.contact.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create");
    } finally {
      setCreateBusy(false);
    }
  }

  const empty = useMemo(() => contacts.length === 0, [contacts]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Users className="h-4 w-4 text-text-2" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-text-0">Contacts</h1>
        <span className="font-mono text-2xs text-text-3">{contacts.length}</span>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, firm, email…"
            aria-label="Search contacts"
            className="w-48 rounded border border-border bg-bg-2 py-1 pl-7 pr-2 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus"
          />
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
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
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              <Plus className="h-3 w-3" /> Add your first contact
            </Button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border/30 overflow-y-auto">
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center gap-2.5 px-3 py-[var(--rk-row-py)] text-left hover:bg-bg-2"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 font-mono text-2xs text-text-1">
                  {initials(c)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-text-0">
                    {rowName(c)}
                  </span>
                  {(c.firm || c.title) && (
                    <span className="block truncate text-2xs text-text-3">
                      {[c.title, c.firm].filter(Boolean).join(" · ")}
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
        <Modal title="New contact" onClose={() => setCreating(false)}>
          <ContactForm
            busy={createBusy}
            error={createErr}
            submitLabel="Create"
            onCancel={() => setCreating(false)}
            onSubmit={create}
          />
        </Modal>
      )}
    </div>
  );
}
