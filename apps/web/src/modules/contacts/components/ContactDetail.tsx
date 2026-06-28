"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Cake,
  Users,
  Link as LinkIcon,
  Pencil,
  Archive,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContactRow, ContactAddress } from "@/lib/contacts/db";
import { timeAgo, formatBirthday } from "@/lib/contacts/format";
import { getContact, updateContact, archiveContact } from "../lib/client-api";
import { ContactForm } from "./ContactForm";

function initials(c: {
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}) {
  const a = (c.first_name ?? c.nickname ?? "").trim()[0] ?? "";
  const b = (c.last_name ?? "").trim()[0] ?? "";
  return (a + b).toUpperCase() || "?";
}

function formatAddress(a: ContactAddress): string {
  const cityLine = [a.city, a.state].filter(Boolean).join(", ");
  return [a.line1, a.line2, [cityLine, a.postal].filter(Boolean).join(" "), a.country]
    .filter(Boolean)
    .join("\n");
}

function mapsHref(a: ContactAddress): string {
  const q = [a.line1, a.line2, a.city, a.state, a.postal, a.country]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

const sectionLabel =
  "text-[10px] font-semibold uppercase tracking-wide text-text-3";

/** Detail drawer for one contact — full read view with inline edit + archive. */
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

  const fullName = contact
    ? [contact.prefix, contact.first_name, contact.middle_name, contact.last_name, contact.suffix]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";

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
            {/* Header */}
            <div className="flex items-center gap-3">
              {contact.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contact.avatar_url}
                  alt=""
                  className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-bg-3 font-mono text-sm text-text-1">
                  {initials(contact)}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-text-0">
                  {fullName || contact.nickname || "Unnamed"}
                </div>
                {contact.nickname && fullName && (
                  <div className="truncate text-xs text-text-3">“{contact.nickname}”</div>
                )}
                {(contact.title || contact.company) && (
                  <div className="truncate text-xs text-text-2">
                    {[contact.title, contact.company].filter(Boolean).join(" · ")}
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

            {/* Emails */}
            {contact.emails.length > 0 && (
              <Section label="Email">
                {contact.emails.map((e, i) => (
                  <a
                    key={i}
                    href={`mailto:${e.email}`}
                    className="flex items-center gap-2 text-xs text-text-1 hover:text-text-0"
                  >
                    <Mail className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                    <span className="truncate">{e.email}</span>
                    {e.label && <Tag>{e.label}</Tag>}
                  </a>
                ))}
              </Section>
            )}

            {/* Phones */}
            {contact.phones.length > 0 && (
              <Section label="Phone">
                {contact.phones.map((p, i) => (
                  <a
                    key={i}
                    href={`tel:${p.phone}`}
                    className="flex items-center gap-2 text-xs text-text-1 hover:text-text-0"
                  >
                    <Phone className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                    <span className="truncate">{p.phone}</span>
                    {p.label && <Tag>{p.label}</Tag>}
                  </a>
                ))}
              </Section>
            )}

            {/* Birthday */}
            {contact.birthday && (
              <Section label="Birthday">
                <div className="flex items-center gap-2 text-xs text-text-1">
                  <Cake className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                  {formatBirthday(contact.birthday)}
                </div>
              </Section>
            )}

            {/* Addresses */}
            {contact.addresses.length > 0 && (
              <Section label="Addresses">
                {contact.addresses.map((a, i) => (
                  <a
                    key={i}
                    href={mapsHref(a)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2 text-xs text-text-1 hover:text-text-0"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                    <span className="min-w-0">
                      {a.label && <Tag>{a.label}</Tag>}
                      <span className="block whitespace-pre-wrap">{formatAddress(a)}</span>
                    </span>
                  </a>
                ))}
              </Section>
            )}

            {/* Family */}
            {contact.family.length > 0 && (
              <Section label="Family & relationships">
                {contact.family.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-text-1">
                    <Users className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                    <span className="truncate">{f.name}</span>
                    {f.relation && <Tag>{f.relation}</Tag>}
                  </div>
                ))}
              </Section>
            )}

            {/* Socials */}
            {contact.socials.length > 0 && (
              <Section label="Social & web">
                {contact.socials.map((s, i) => (
                  <a
                    key={i}
                    href={
                      s.value.startsWith("http") ? s.value : `https://${s.value}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-text-1 hover:text-text-0"
                  >
                    <LinkIcon className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
                    <span className="truncate">{s.value}</span>
                    <Tag>{s.kind}</Tag>
                  </a>
                ))}
              </Section>
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

            <div className="mt-1 flex items-center gap-2 border-t border-border/40 pt-3">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={archive} disabled={busy}>
                <Archive className="h-3 w-3" /> Archive
              </Button>
              <span className="ml-auto text-2xs text-text-3">
                Updated {timeAgo(contact.updated_at, Date.now())}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={sectionLabel}>{label}</span>
      {children}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 rounded-sm bg-bg-3 px-1 py-px text-[9px] uppercase tracking-wide text-text-3">
      {children}
    </span>
  );
}
