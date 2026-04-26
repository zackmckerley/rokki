"use client";

import { useMemo, useState } from "react";
import { Plus, Check, Mail, Phone, Globe, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VendorRow {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
}

export function VendorsClient({
  slug,
  initial,
}: {
  slug: string;
  initial: VendorRow[];
}) {
  const [rows, setRows] = useState<VendorRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [tagsCsv, setTagsCsv] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.contact_name ?? "").toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [rows, query]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const tags = tagsCsv
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const r = await fetch(`/api/v1/orgs/${slug}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          contact_name: contactName || undefined,
          contact_email: contactEmail || undefined,
          contact_phone: contactPhone || undefined,
          website: website || undefined,
          tags,
        }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const b = (await r.json()) as { data: VendorRow };
      setRows((prev) =>
        [...prev, b.data].sort((a, z) => a.name.localeCompare(z.name)),
      );
      setName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setWebsite("");
      setTagsCsv("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vendors, contacts, tags…"
          className="flex-1 rounded border border-border bg-bg-1 px-3 py-1.5 text-sm text-text-0 placeholder:text-text-3 outline-none focus:border-border-focus"
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-2.5 py-1.5 text-xs font-semibold uppercase text-accent hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" /> {open ? "Cancel" : "New vendor"}
        </button>
      </div>

      {open ? (
        <form
          onSubmit={add}
          className="mb-4 grid grid-cols-1 gap-2 rounded border border-border bg-bg-1 p-3 md:grid-cols-2"
        >
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor / company name"
            className="md:col-span-2 rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Contact email"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            value={tagsCsv}
            onChange={(e) => setTagsCsv(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="md:col-span-2 rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <div className="md:col-span-2 flex items-center justify-end gap-2">
            {error ? (
              <span className="text-xs text-danger">{error}</span>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase text-bg-0 hover:bg-accent-hover",
                saving && "cursor-not-allowed opacity-60",
              )}
            >
              <Check className="h-3 w-3" /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded border border-dashed border-border bg-bg-1 p-8 text-center text-xs text-text-3">
          {query ? "No vendors match." : "No vendors yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border bg-bg-1">
          {filtered.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-1 p-3 hover:bg-bg-2 md:flex-row md:items-center md:gap-3"
            >
              <div className="flex-1">
                <div className="text-sm text-text-0">
                  {v.name}
                  {v.contact_name ? (
                    <span className="ml-2 text-xs text-text-3">
                      — {v.contact_name}
                    </span>
                  ) : null}
                </div>
                {v.tags.length ? (
                  <div className="mt-0.5 flex items-center gap-1 text-[10px] text-text-3">
                    <Tag className="h-2.5 w-2.5" />
                    {v.tags.join(" · ")}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-text-2">
                {v.contact_email ? (
                  <a
                    href={`mailto:${v.contact_email}`}
                    className="inline-flex items-center gap-1 hover:text-text-0"
                  >
                    <Mail className="h-3 w-3" />
                    {v.contact_email}
                  </a>
                ) : null}
                {v.contact_phone ? (
                  <a
                    href={`tel:${v.contact_phone}`}
                    className="inline-flex items-center gap-1 hover:text-text-0"
                  >
                    <Phone className="h-3 w-3" />
                    {v.contact_phone}
                  </a>
                ) : null}
                {v.website ? (
                  <a
                    href={v.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-text-0"
                  >
                    <Globe className="h-3 w-3" />
                    visit
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
