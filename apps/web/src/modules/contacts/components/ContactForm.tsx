"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ContactRow } from "@/lib/contacts/db";

const TYPE_OPTIONS = [
  "owner",
  "broker",
  "partner",
  "lender",
  "attorney",
  "title",
  "contractor",
  "tenant",
  "vendor",
  "other",
];

const input =
  "w-full rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus";
const label = "text-[10px] font-semibold uppercase tracking-wide text-text-3";

export interface ContactFormValues {
  first_name?: string;
  last_name?: string;
  nickname?: string;
  firm?: string;
  title?: string;
  email?: string;
  phone?: string;
  contact_types?: string[];
  tags?: string[];
  notes?: string;
}

/** Shared create/edit form. Single email/phone inputs map to 1-element arrays;
 *  the server derives primary_email/phone. */
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
  const [v, setV] = useState<ContactFormValues>({
    first_name: initial?.first_name ?? "",
    last_name: initial?.last_name ?? "",
    nickname: initial?.nickname ?? "",
    firm: initial?.firm ?? "",
    title: initial?.title ?? "",
    email: initial?.primary_email ?? initial?.emails?.[0]?.email ?? "",
    phone: initial?.primary_phone ?? initial?.phones?.[0]?.phone ?? "",
    contact_types: initial?.contact_types ?? [],
    tags: initial?.tags ?? [],
    notes: initial?.notes ?? "",
  });

  function set<K extends keyof ContactFormValues>(k: K, val: ContactFormValues[K]) {
    setV((prev) => ({ ...prev, [k]: val }));
  }
  function toggleType(t: string) {
    setV((prev) => {
      const has = prev.contact_types?.includes(t);
      return {
        ...prev,
        contact_types: has
          ? prev.contact_types!.filter((x) => x !== t)
          : [...(prev.contact_types ?? []), t],
      };
    });
  }

  function submit() {
    const patch: Partial<ContactRow> = {
      first_name: v.first_name?.trim() || "",
      last_name: v.last_name?.trim() || "",
      nickname: v.nickname?.trim() || null,
      firm: v.firm?.trim() || null,
      title: v.title?.trim() || null,
      contact_types: v.contact_types ?? [],
      tags: v.tags ?? [],
      notes: v.notes?.trim() || null,
      emails: v.email?.trim() ? [{ email: v.email.trim(), primary: true }] : [],
      phones: v.phone?.trim() ? [{ phone: v.phone.trim(), primary: true }] : [],
    };
    onSubmit(patch);
  }

  const canSubmit =
    !busy &&
    Boolean(
      (v.first_name?.trim() || v.last_name?.trim() || v.nickname?.trim()),
    );

  return (
    <div className="flex flex-col gap-3">
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

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Nickname</label>
          <input
            className={input}
            value={v.nickname}
            onChange={(e) => set("nickname", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Firm</label>
          <input
            className={input}
            value={v.firm}
            onChange={(e) => set("firm", e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Email</label>
          <input
            type="email"
            className={input}
            value={v.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Phone</label>
          <input
            className={input}
            value={v.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className={label}>Type</label>
        <div className="mt-1 flex flex-wrap gap-1">
          {TYPE_OPTIONS.map((t) => {
            const on = v.contact_types?.includes(t);
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
      </div>

      <div>
        <label className={label}>Tags (comma-separated)</label>
        <input
          className={input}
          value={(v.tags ?? []).join(", ")}
          onChange={(e) =>
            set(
              "tags",
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      </div>

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
