"use client";

import { useEffect, useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Users,
  Link as LinkIcon,
  MessageSquare,
  Pencil,
  Archive,
  Unlink,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ContactRow, ContactAddress } from "@/lib/contacts/db";
import { timeAgo, formatBirthday, formatPhone } from "@/lib/contacts/format";
import {
  getContact,
  updateContact,
  archiveContact,
  unlinkContact,
} from "../lib/client-api";
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

/** Deep-link to the Signal conversation with this number (see MessagesInbox). */
function signalHref(phone: string): string {
  return `/messages?to=${encodeURIComponent(phone)}`;
}

/** Detail drawer for one contact — Option C: dense, terminal-style read view. */
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

  async function unlink() {
    setBusy(true);
    try {
      const updated = await unlinkContact(contactId);
      setContact(updated);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlink");
    } finally {
      setBusy(false);
    }
  }

  const phone = contact?.primary_phone ?? contact?.phones?.[0]?.phone ?? null;
  const email = contact?.primary_email ?? contact?.emails?.[0]?.email ?? null;
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-text-3">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : !contact ? (
          <p className="p-3 text-xs text-text-3">{error ?? "Not found."}</p>
        ) : editing ? (
          <div className="p-3">
            <ContactForm
              initial={contact}
              busy={busy}
              error={error}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={save}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Identity + Signal / email actions */}
            <div className="flex items-center gap-2.5 px-3 py-3">
              {contact.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contact.avatar_url}
                  alt=""
                  className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent/15 font-mono text-xs font-medium text-accent">
                  {initials(contact)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-text-0">
                    {fullName || contact.nickname || "Unnamed"}
                  </span>
                  {contact.source === "self" ? (
                    <span className="flex-shrink-0 rounded-sm bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                      You
                    </span>
                  ) : contact.user_id ? (
                    <span className="flex-shrink-0 rounded-sm bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                      Rokki
                    </span>
                  ) : null}
                </div>
                {(contact.title || contact.company) && (
                  <div className="truncate text-xs text-text-2">
                    {[contact.title, contact.company].filter(Boolean).join(" · ")}
                  </div>
                )}
                {!contact.title && !contact.company && contact.nickname && fullName && (
                  <div className="truncate text-xs text-text-3">“{contact.nickname}”</div>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {phone && (
                  <ActionIcon href={signalHref(phone)} label="Call via Signal">
                    <Phone className="h-4 w-4" />
                  </ActionIcon>
                )}
                {phone && (
                  <ActionIcon href={signalHref(phone)} label="Message via Signal">
                    <MessageSquare className="h-4 w-4" />
                  </ActionIcon>
                )}
                {email && (
                  <ActionIcon href={`mailto:${email}`} label="Email" external>
                    <Mail className="h-4 w-4" />
                  </ActionIcon>
                )}
              </div>
            </div>

            {contact.contact_types.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pb-2.5">
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

            {/* Fields — dense mono rows with a fixed label column */}
            <div className="border-t border-border/60 font-mono text-xs">
              {contact.emails.map((e, i) => (
                <FieldRow key={`e${i}`} label={i === 0 ? "Email" : ""} chip={e.label} href={`mailto:${e.email}`}>
                  <span className="truncate">{e.email}</span>
                </FieldRow>
              ))}
              {contact.phones.map((p, i) => (
                <FieldRow key={`p${i}`} label={i === 0 ? "Phone" : ""} chip={p.label} href={signalHref(p.phone)}>
                  <span className="truncate">{formatPhone(p.phone)}</span>
                </FieldRow>
              ))}
              {contact.birthday && (
                <FieldRow label="Born">
                  <span>{formatBirthday(contact.birthday)}</span>
                </FieldRow>
              )}
              {contact.addresses.map((a, i) => (
                <FieldRow key={`a${i}`} label={i === 0 ? "Address" : ""} chip={a.label} href={mapsHref(a)} external>
                  <span className="whitespace-pre-wrap leading-tight">{formatAddress(a)}</span>
                </FieldRow>
              ))}
              {contact.family.map((f, i) => (
                <FieldRow key={`f${i}`} label={i === 0 ? "Family" : ""} chip={f.relation}>
                  <span className="truncate">{f.name}</span>
                </FieldRow>
              ))}
              {contact.socials.map((s, i) => (
                <FieldRow
                  key={`s${i}`}
                  label={i === 0 ? "Web" : ""}
                  chip={s.kind}
                  href={s.value.startsWith("http") ? s.value : `https://${s.value}`}
                  external
                >
                  <span className="truncate">{s.value}</span>
                </FieldRow>
              ))}
            </div>

            {contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-1 px-3 py-2">
                {contact.tags.map((t) => (
                  <span key={t} className="text-2xs text-text-3">#{t}</span>
                ))}
              </div>
            )}

            {contact.notes && (
              <p className="whitespace-pre-wrap border-t border-border/40 px-3 py-2.5 text-xs leading-relaxed text-text-2">
                {contact.notes}
              </p>
            )}

            {/* Footer toolbar */}
            <div className="flex items-center gap-1 border-t border-border/60 px-3 py-2.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
              {contact.user_id && (
                <Button size="sm" variant="ghost" onClick={unlink} disabled={busy}>
                  <Unlink className="h-3 w-3" /> Unlink
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={archive} disabled={busy}>
                <Archive className="h-3 w-3" /> Archive
              </Button>
              <span className="ml-auto text-2xs text-text-3">
                Updated {timeAgo(contact.updated_at, Date.now())}
              </span>
            </div>

            {error && <p className="px-3 pb-3 text-xs text-danger">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** One dense field row: fixed label column, value, and an optional label chip.
 *  The whole row links when `href` is set. A blank `label` continues a group
 *  (e.g. a second email) without repeating the heading. */
function FieldRow({
  label,
  chip,
  href,
  external,
  children,
}: {
  label: string;
  chip?: string;
  href?: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="w-14 flex-shrink-0 pt-px text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-text-1">{children}</span>
      {chip && (
        <span className="flex-shrink-0 rounded-sm bg-accent/10 px-1.5 py-px text-[9px] uppercase tracking-wide text-accent">
          {chip}
        </span>
      )}
    </>
  );
  const cls =
    "flex items-start gap-2 border-b border-border/40 px-3 py-2 last:border-b-0";
  if (!href) return <div className={cls}>{inner}</div>;
  return (
    <a
      href={href}
      className={`${cls} hover:bg-bg-2`}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {inner}
    </a>
  );
}

/** A compact 32px icon action button (Signal call / message, email). */
function ActionIcon({
  href,
  label,
  external,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      title={label}
      aria-label={label}
      {...(external ? { rel: "noopener noreferrer" } : {})}
      className="flex h-8 w-8 items-center justify-center rounded border border-border bg-bg-2 text-text-2 hover:border-border-focus hover:text-text-0"
    >
      {children}
    </a>
  );
}
