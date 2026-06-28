"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, Pencil, Archive, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContactRow } from "@/lib/contacts/db";
import {
  getContact,
  updateContact,
  archiveContact,
} from "../lib/client-api";
import { ContactForm } from "./ContactForm";

function initials(c: { first_name?: string | null; last_name?: string | null; nickname?: string | null }) {
  const a = (c.first_name ?? c.nickname ?? "").trim()[0] ?? "";
  const b = (c.last_name ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

/** Detail drawer for one contact — read view with inline edit + archive. */
export function ContactDetail({
  contactId,
  onClose,
  onChanged,
}: {
  contactId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEditing(false);
    getContact(contactId)
      .then((c) => alive && setContact(c))
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [contactId]);

  async function save(patch: Partial<ContactRow>) {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateContact(contactId, patch);
      setContact(updated);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    setBusy(true);
    try {
      await archiveContact(contactId);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not archive");
      setBusy(false);
    }
  }

  const email = contact?.primary_email ?? contact?.emails?.[0]?.email ?? null;
  const phone = contact?.primary_phone ?? contact?.phones?.[0]?.phone ?? null;
  const fullName = [contact?.first_name, contact?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
          Contact
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

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-3">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : !contact ? (
          <p className="text-xs text-text-3">{error ?? "Not found."}</p>
        ) : editing ? (
          <ContactForm
            initial={contact}
            busy={busy}
            error={error}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={save}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 font-mono text-sm text-text-1">
                {initials(contact)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text-0">
                  {contact.nickname || fullName || "Unnamed"}
                </div>
                {(contact.title || contact.firm) && (
                  <div className="truncate text-xs text-text-2">
                    {[contact.title, contact.firm].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
            </div>

            {contact.contact_types.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.contact_types.map((t) => (
                  <span
                    key={t}
                    className="rounded-sm border border-border px-1.5 py-0.5 text-2xs capitalize text-text-2"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            {email && (
              <a
                href={`mailto:${email}`}
                className="flex items-center gap-2 text-xs text-text-1 hover:text-text-0"
              >
                <Mail className="h-3.5 w-3.5 text-text-3" /> {email}
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                className="flex items-center gap-2 text-xs text-text-1 hover:text-text-0"
              >
                <Phone className="h-3.5 w-3.5 text-text-3" /> {phone}
              </a>
            )}

            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((t) => (
                  <span key={t} className="text-2xs text-text-3">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {contact.notes && (
              <p className="whitespace-pre-wrap border-t border-border/40 pt-2 text-xs text-text-2">
                {contact.notes}
              </p>
            )}

            <div className="mt-2 flex gap-2 border-t border-border/40 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={archive} disabled={busy}>
                <Archive className="h-3 w-3" /> Archive
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
