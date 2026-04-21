"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertCircle } from "lucide-react";
import { AdminButton, AdminPanel } from "@/components/admin/primitives";
import { UserPicker, type PickedUser } from "@/components/admin/UserPicker";

export function NewSpaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState<PickedUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-derive slug from name on first edit (until user types in slug).
  function setNameAndDeriveSlug(next: string) {
    setName(next);
    if (!slug || slug === slugify(name)) {
      setSlug(slugify(next));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!owner) {
      setError("Pick an initial owner.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/admin/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || undefined,
          initial_owner_user_id: owner.user_id,
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const body = (await r.json()) as { data: { slug: string } };
      router.push(`/admin/spaces/${body.data.slug}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminPanel>
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <Field label="Name *">
          <input
            required
            value={name}
            onChange={(e) => setNameAndDeriveSlug(e.target.value)}
            maxLength={120}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Slug *">
          <input
            required
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="lowercase-letters-and-digits"
            maxLength={40}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <p className="mt-1 text-[10px] text-text-3">
            Used in URLs (/s/&lt;slug&gt;). Lowercase letters, digits, hyphens; 3–40 chars.
          </p>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-sm border border-border bg-bg-0 px-2 py-1.5 text-sm text-text-0 outline-none focus:border-border-focus"
          />
        </Field>
        <Field label="Initial owner *">
          <UserPicker selected={owner} onSelect={setOwner} />
        </Field>

        <footer className="mt-2 flex items-center justify-end gap-3">
          {error ? (
            <span className="flex items-center gap-1 text-xs text-danger">
              <AlertCircle className="h-3 w-3" /> {error}
            </span>
          ) : null}
          <AdminButton type="submit" variant="accent" disabled={saving}>
            <Check className="h-3 w-3" />
            {saving ? "Creating…" : "Create space"}
          </AdminButton>
        </footer>
      </form>
    </AdminPanel>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid grid-cols-1 gap-1 md:grid-cols-[160px_1fr] md:items-start md:gap-3">
      <span className="pt-1.5 text-[10px] uppercase tracking-wide text-text-3">
        {label}
      </span>
      <div>{children}</div>
    </label>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
