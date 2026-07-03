"use client";

import { useRef, useState } from "react";
import { Plus, X, Upload, Loader2, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  ContactRow,
  ContactAddress,
  ContactSocial,
  ContactFamilyMember,
} from "@/lib/contacts/db";
import { parseContact, type ParsedContact } from "@/lib/contacts/parse";
import {
  mergeEmails,
  mergePhones,
  mergeAddresses,
  mergeSocials,
  parseSummary,
} from "@/lib/contacts/merge";
import { uploadAvatar } from "../lib/client-api";

const PRESET_TYPES = [
  "owner",
  "broker",
  "partner",
  "lender",
  "attorney",
  "title",
  "contractor",
  "tenant",
  "vendor",
  "investor",
  "client",
  "company",
];

const EMAIL_LABELS = ["", "personal", "work", "other"];
const PHONE_LABELS = ["", "mobile", "work", "home", "other"];
const ADDRESS_LABELS = ["home", "business", "other"];
const SOCIAL_KINDS = ["linkedin", "instagram", "x", "facebook", "website", "other"];

const input =
  "w-full rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus";
const select =
  "rounded border border-border bg-bg-2 px-1.5 py-1 text-xs text-text-2 outline-none focus:border-border-focus";
const label = "text-[10px] font-semibold uppercase tracking-wide text-text-3";
const sectionLabel =
  "text-[10px] font-semibold uppercase tracking-wide text-text-2";

interface EmailRow {
  label: string;
  email: string;
  primary?: boolean;
}
interface PhoneRow {
  label: string;
  phone: string;
  primary?: boolean;
}

interface FormState {
  prefix: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  suffix: string;
  nickname: string;
  avatar_url: string | null;
  company: string;
  title: string;
  birthday: string;
  contact_types: string[];
  tags: string[];
  emails: EmailRow[];
  phones: PhoneRow[];
  addresses: ContactAddress[];
  family: ContactFamilyMember[];
  socials: ContactSocial[];
  notes: string;
}

function seed<T>(arr: T[] | undefined, empty: () => T): T[] {
  return arr && arr.length ? arr : [empty()];
}

function fromContact(c?: Partial<ContactRow>): FormState {
  return {
    prefix: c?.prefix ?? "",
    first_name: c?.first_name ?? "",
    middle_name: c?.middle_name ?? "",
    last_name: c?.last_name ?? "",
    suffix: c?.suffix ?? "",
    nickname: c?.nickname ?? "",
    avatar_url: c?.avatar_url ?? null,
    company: c?.company ?? "",
    title: c?.title ?? "",
    birthday: c?.birthday ?? "",
    contact_types: c?.contact_types ?? [],
    tags: c?.tags ?? [],
    emails: seed(
      c?.emails?.map((e) => ({ label: e.label ?? "", email: e.email, primary: e.primary })),
      () => ({ label: "", email: "" }),
    ),
    phones: seed(
      c?.phones?.map((p) => ({ label: p.label ?? "", phone: p.phone, primary: p.primary })),
      () => ({ label: "", phone: "" }),
    ),
    addresses: c?.addresses ?? [],
    family: c?.family ?? [],
    socials: c?.socials ?? [],
    notes: c?.notes ?? "",
  };
}

/** Shared create/edit form — the full contact profile. */
export function ContactForm({
  initial,
  busy,
  error,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: Partial<ContactRow>;
  busy?: boolean;
  error?: string | null;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (patch: Partial<ContactRow>) => void;
}) {
  const [v, setV] = useState<FormState>(() => fromContact(initial));
  const [customType, setCustomType] = useState("");
  // Raw text buffer for the comma-separated tags input, so typing the comma
  // delimiter survives (binding the input straight to tags.join(", ") wiped the
  // comma on every keystroke, making a second tag impossible to start).
  const [tagsText, setTagsText] = useState(() => (initial?.tags ?? []).join(", "));
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [avatarErr, setAvatarErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(k: K, val: FormState[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }

  /**
   * Merge a parsed contact blob into the form. Scalars only fill when empty
   * (never clobber what the user typed); multi-value rows are appended +
   * deduped against existing entries.
   */
  function applyParsed(p: ParsedContact) {
    setV((prev) => {
      const next = { ...prev };
      const fillScalar = (k: keyof FormState, val: string | undefined) => {
        if (val && !String(prev[k] ?? "").trim()) {
          (next as Record<string, unknown>)[k] = val;
        }
      };
      fillScalar("prefix", p.prefix);
      fillScalar("first_name", p.first_name);
      fillScalar("middle_name", p.middle_name);
      fillScalar("last_name", p.last_name);
      fillScalar("suffix", p.suffix);
      fillScalar("nickname", p.nickname);
      fillScalar("company", p.company);
      fillScalar("title", p.title);
      fillScalar("birthday", p.birthday);
      next.emails = mergeEmails(prev.emails, p.emails);
      next.phones = mergePhones(prev.phones, p.phones);
      next.addresses = mergeAddresses(prev.addresses, p.addresses);
      next.socials = mergeSocials(prev.socials, p.socials);
      // Append notes, but idempotently — re-running a paste (or clicking "Fill
      // fields" twice) must not duplicate the same note text.
      if (p.notes && !(prev.notes ?? "").includes(p.notes)) {
        next.notes = prev.notes ? `${prev.notes}\n${p.notes}` : p.notes;
      }
      return next;
    });
  }

  // ── avatar ────────────────────────────────────────────────────────
  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarErr("Choose an image file");
      return;
    }
    setUploading(true);
    setAvatarErr(null);
    try {
      const url = await uploadAvatar(file);
      set("avatar_url", url);
    } catch (e) {
      setAvatarErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ── types ─────────────────────────────────────────────────────────
  const allTypes = Array.from(
    new Set([...PRESET_TYPES, ...v.contact_types]),
  );
  function toggleType(t: string) {
    setV((prev) => ({
      ...prev,
      contact_types: prev.contact_types.includes(t)
        ? prev.contact_types.filter((x) => x !== t)
        : [...prev.contact_types, t],
    }));
  }
  function addCustomType() {
    const t = customType.trim().toLowerCase();
    if (!t) return;
    setV((prev) => ({
      ...prev,
      contact_types: prev.contact_types.includes(t)
        ? prev.contact_types
        : [...prev.contact_types, t],
    }));
    setCustomType("");
  }

  // ── repeatable rows ───────────────────────────────────────────────
  function patchAt<T>(arr: T[], i: number, patch: Partial<T>): T[] {
    return arr.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
  }
  function removeAt<T>(arr: T[], i: number): T[] {
    return arr.filter((_, idx) => idx !== i);
  }

  // ── submit ────────────────────────────────────────────────────────
  function submit() {
    // Preserve whichever row is flagged primary (a contact imported via API/MCP
    // may have its primary in a row other than the first). Only fall back to
    // "first row wins" when no row carries the flag.
    const emailRows = v.emails
      .map((e) => ({ ...e, email: e.email.trim() }))
      .filter((e) => e.email);
    const emailPrimary = emailRows.findIndex((e) => e.primary);
    const emails = emailRows.map((e, i) => ({
      email: e.email,
      label: e.label || undefined,
      primary: emailPrimary === -1 ? i === 0 : i === emailPrimary,
    }));
    const phoneRows = v.phones
      .map((p) => ({ ...p, phone: p.phone.trim() }))
      .filter((p) => p.phone);
    const phonePrimary = phoneRows.findIndex((p) => p.primary);
    const phones = phoneRows.map((p, i) => ({
      phone: p.phone,
      label: p.label || undefined,
      primary: phonePrimary === -1 ? i === 0 : i === phonePrimary,
    }));
    const addresses = v.addresses.filter(
      (a) => a.line1 || a.city || a.state || a.postal,
    );
    const family = v.family
      .map((f) => ({ name: f.name.trim(), relation: f.relation?.trim() || undefined }))
      .filter((f) => f.name);
    const socials = v.socials
      .map((s) => ({ kind: s.kind, value: s.value.trim() }))
      .filter((s) => s.value);

    const patch: Partial<ContactRow> = {
      prefix: v.prefix.trim() || null,
      first_name: v.first_name.trim() || "",
      middle_name: v.middle_name.trim() || null,
      last_name: v.last_name.trim() || "",
      suffix: v.suffix.trim() || null,
      nickname: v.nickname.trim() || null,
      avatar_url: v.avatar_url,
      company: v.company.trim() || null,
      title: v.title.trim() || null,
      birthday: v.birthday || null,
      contact_types: v.contact_types,
      tags: v.tags,
      emails,
      phones,
      addresses,
      family,
      socials,
      notes: v.notes.trim() || null,
    };
    onSubmit(patch);
  }

  const canSubmit =
    !busy &&
    !uploading &&
    Boolean(v.first_name.trim() || v.last_name.trim() || v.nickname.trim());

  return (
    <div className="flex flex-col gap-4">
      {/* Smart paste — drop/paste a blob, fields auto-fill (no LLM) */}
      <SmartPasteBox onParsed={applyParsed} />

      {/* Avatar + identity */}
      <div className="flex gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files?.[0]);
          }}
          role="button"
          tabIndex={0}
          aria-label="Profile picture — drop an image or click to upload"
          className={`relative flex h-16 w-16 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border ${
            dragOver ? "border-accent bg-accent/10" : "border-border bg-bg-3"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-text-3" />
          ) : v.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={v.avatar_url}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <Upload className="h-4 w-4 text-text-3" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          {v.avatar_url && (
            <button
              type="button"
              onClick={() => set("avatar_url", null)}
              className="self-start text-2xs text-text-3 hover:text-danger"
            >
              Remove photo
            </button>
          )}
          {avatarErr ? (
            <p className="text-2xs text-danger">{avatarErr}</p>
          ) : (
            <p className="text-2xs text-text-3">
              Drag &amp; drop a photo, or click the circle.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>First name</label>
          <input
            className={input}
            value={v.first_name}
            onChange={(e) => set("first_name", e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className={label}>Last name</label>
          <input
            className={input}
            value={v.last_name}
            onChange={(e) => set("last_name", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className={label}>Prefix</label>
          <input
            className={input}
            placeholder="Mr."
            value={v.prefix}
            onChange={(e) => set("prefix", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Middle</label>
          <input
            className={input}
            value={v.middle_name}
            onChange={(e) => set("middle_name", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Suffix</label>
          <input
            className={input}
            placeholder="Jr."
            value={v.suffix}
            onChange={(e) => set("suffix", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Nickname</label>
          <input
            className={input}
            value={v.nickname}
            onChange={(e) => set("nickname", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Company</label>
          <input
            className={input}
            value={v.company}
            onChange={(e) => set("company", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Title</label>
          <input
            className={input}
            value={v.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Birthday</label>
          <input
            type="date"
            className={input}
            value={v.birthday}
            onChange={(e) => set("birthday", e.target.value)}
          />
        </div>
      </div>

      {/* Emails */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Email</span>
        {v.emails.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              className={select}
              value={row.label}
              onChange={(e) => set("emails", patchAt(v.emails, i, { label: e.target.value }))}
            >
              {EMAIL_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l || "label"}
                </option>
              ))}
            </select>
            <input
              type="email"
              className={input}
              placeholder="name@example.com"
              value={row.email}
              onChange={(e) => set("emails", patchAt(v.emails, i, { email: e.target.value }))}
            />
            <RemoveBtn onClick={() => set("emails", removeAt(v.emails, i))} />
          </div>
        ))}
        <AddBtn label="Add email" onClick={() => set("emails", [...v.emails, { label: "", email: "" }])} />
      </div>

      {/* Phones */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Phone</span>
        {v.phones.map((row, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              className={select}
              value={row.label}
              onChange={(e) => set("phones", patchAt(v.phones, i, { label: e.target.value }))}
            >
              {PHONE_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l || "label"}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="(305) 555-0100"
              value={row.phone}
              onChange={(e) => set("phones", patchAt(v.phones, i, { phone: e.target.value }))}
            />
            <RemoveBtn onClick={() => set("phones", removeAt(v.phones, i))} />
          </div>
        ))}
        <AddBtn label="Add phone" onClick={() => set("phones", [...v.phones, { label: "", phone: "" }])} />
      </div>

      {/* Addresses */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabel}>Addresses</span>
        {v.addresses.map((addr, i) => (
          <div key={i} className="rounded border border-border/60 p-2">
            <div className="mb-1 flex items-center justify-between">
              <select
                className={select}
                value={addr.label ?? "home"}
                onChange={(e) => set("addresses", patchAt(v.addresses, i, { label: e.target.value }))}
              >
                {ADDRESS_LABELS.map((l) => (
                  <option key={l} value={l} className="capitalize">
                    {l}
                  </option>
                ))}
              </select>
              <RemoveBtn onClick={() => set("addresses", removeAt(v.addresses, i))} />
            </div>
            <div className="flex flex-col gap-1">
              <input
                className={input}
                placeholder="Street address"
                value={addr.line1 ?? ""}
                onChange={(e) => set("addresses", patchAt(v.addresses, i, { line1: e.target.value }))}
              />
              <input
                className={input}
                placeholder="Apt / Suite / Unit"
                value={addr.line2 ?? ""}
                onChange={(e) => set("addresses", patchAt(v.addresses, i, { line2: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-1">
                <input
                  className={input}
                  placeholder="City"
                  value={addr.city ?? ""}
                  onChange={(e) => set("addresses", patchAt(v.addresses, i, { city: e.target.value }))}
                />
                <input
                  className={input}
                  placeholder="State"
                  value={addr.state ?? ""}
                  onChange={(e) => set("addresses", patchAt(v.addresses, i, { state: e.target.value }))}
                />
                <input
                  className={input}
                  placeholder="ZIP"
                  value={addr.postal ?? ""}
                  onChange={(e) => set("addresses", patchAt(v.addresses, i, { postal: e.target.value }))}
                />
              </div>
            </div>
          </div>
        ))}
        <AddBtn
          label="Add address"
          onClick={() => set("addresses", [...v.addresses, { label: "home" }])}
        />
      </div>

      {/* Family */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Family &amp; relationships</span>
        {v.family.map((f, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              className={input}
              placeholder="Name"
              value={f.name}
              onChange={(e) => set("family", patchAt(v.family, i, { name: e.target.value }))}
            />
            <input
              className={`${input} max-w-[40%]`}
              placeholder="Relation (spouse, child…)"
              value={f.relation ?? ""}
              onChange={(e) => set("family", patchAt(v.family, i, { relation: e.target.value }))}
            />
            <RemoveBtn onClick={() => set("family", removeAt(v.family, i))} />
          </div>
        ))}
        <AddBtn label="Add family member" onClick={() => set("family", [...v.family, { name: "", relation: "" }])} />
      </div>

      {/* Type */}
      <div>
        <span className={sectionLabel}>Type</span>
        <div className="mt-1 flex flex-wrap gap-1">
          {allTypes.map((t) => {
            const on = v.contact_types.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                aria-pressed={on}
                className={`rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize ${
                  on
                    ? "bg-accent text-bg-0"
                    : "border border-border text-text-2 hover:text-text-0"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex items-center gap-1">
          <input
            className={`${input} max-w-[180px]`}
            placeholder="Add custom type…"
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomType();
              }
            }}
          />
          <button
            type="button"
            onClick={addCustomType}
            className="rounded-sm border border-border px-1.5 py-1 text-2xs text-text-2 hover:text-text-0"
          >
            Add
          </button>
        </div>
      </div>

      {/* Socials */}
      <div className="flex flex-col gap-1">
        <span className={sectionLabel}>Social &amp; web</span>
        {v.socials.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <select
              className={select}
              value={s.kind}
              onChange={(e) => set("socials", patchAt(v.socials, i, { kind: e.target.value }))}
            >
              {SOCIAL_KINDS.map((k) => (
                <option key={k} value={k} className="capitalize">
                  {k}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="URL or handle"
              value={s.value}
              onChange={(e) => set("socials", patchAt(v.socials, i, { value: e.target.value }))}
            />
            <RemoveBtn onClick={() => set("socials", removeAt(v.socials, i))} />
          </div>
        ))}
        <AddBtn label="Add social" onClick={() => set("socials", [...v.socials, { kind: "linkedin", value: "" }])} />
      </div>

      {/* Tags */}
      <div>
        <label className={label}>Tags (comma-separated)</label>
        <input
          className={input}
          value={tagsText}
          onChange={(e) => {
            setTagsText(e.target.value);
            set(
              "tags",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            );
          }}
        />
      </div>

      {/* Notes */}
      <div>
        <label className={label}>Notes</label>
        <textarea
          className={`${input} min-h-[60px] resize-y`}
          value={v.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={!canSubmit}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}

/**
 * Paste/drop a contact blob (email signature, vCard, Apple contact-card copy,
 * or labeled lines) → it's parsed deterministically (no LLM) and the fields
 * below are auto-filled. Parses on paste/drop; a button covers typed/edited text.
 */
function SmartPasteBox({ onParsed }: { onParsed: (p: ParsedContact) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ summary: string; unmatched: string[] } | null>(null);

  function run(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = parseContact(trimmed);
    const summary = parseSummary(parsed);
    setResult({ summary: summary || "nothing recognized", unmatched: parsed.unmatched });
    if (summary) onParsed(parsed);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 self-start rounded border border-dashed border-border px-2 py-1 text-2xs font-medium text-text-2 hover:border-border-focus hover:text-text-0"
      >
        <ClipboardPaste className="h-3 w-3" /> Paste contact info to auto-fill
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-bg-2 p-2">
      <div className="flex items-center gap-1.5">
        <ClipboardPaste className="h-3 w-3 text-text-3" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
          Smart paste
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setText("");
            setResult(null);
          }}
          aria-label="Close smart paste"
          className="ml-auto rounded-sm p-0.5 text-text-3 hover:text-text-0"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (pasted.trim()) {
            e.preventDefault();
            setText(pasted);
            run(pasted);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          // Always preventDefault: otherwise a file (or non-text) dropped on
          // this large top-of-form target makes the browser navigate to it and
          // discards the unsaved form.
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.getData("text");
          if (dropped.trim()) {
            setText(dropped);
            run(dropped);
          }
        }}
        placeholder="Paste or drag a contact — an email signature, a vCard, or a copied contact card. Fields fill automatically."
        className={`min-h-[68px] w-full resize-y rounded border bg-bg-1 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none ${
          dragOver ? "border-accent" : "border-border focus:border-border-focus"
        }`}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => run(text)} disabled={!text.trim()}>
          Fill fields
        </Button>
        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              setResult(null);
            }}
            className="text-2xs text-text-3 hover:text-text-1"
          >
            Clear
          </button>
        )}
        {result?.summary && (
          <span className="ml-auto truncate text-2xs text-text-2">
            Filled: {result.summary}
          </span>
        )}
      </div>
      {result && result.unmatched.length > 0 && (
        <p className="text-2xs text-text-3">
          Couldn&apos;t place: {result.unmatched.join(" · ")}
        </p>
      )}
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 self-start text-2xs text-text-3 hover:text-text-1"
    >
      <Plus className="h-3 w-3" /> {label}
    </button>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="flex-shrink-0 rounded-sm p-1 text-text-3 hover:text-danger"
    >
      <X className="h-3 w-3" />
    </button>
  );
}
