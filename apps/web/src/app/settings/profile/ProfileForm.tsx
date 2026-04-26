"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Avatar } from "@/components/primitives";
import { detectClientTimezone } from "@/lib/timezone";
import { FormError } from "@/components/ui/FormError";
import { FieldHint } from "@/components/ui/FieldHint";

interface ProfileFormProps {
  email: string;
  initial: {
    full_name: string | null;
    avatar_url: string | null;
    timezone: string | null;
  };
}

/**
 * Client-side profile editor. Saves via `PATCH /api/v1/me`. Shows a live
 * avatar preview while the user types. Timezone has an auto-detect button
 * because nobody knows their IANA id off the top of their head.
 */
export function ProfileForm({ email, initial }: ProfileFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");
  const [timezone, setTimezone] = useState(initial.timezone ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName,
          avatar_url: avatarUrl || null,
          timezone: timezone || null,
        }),
      });
      if (!r.ok) {
        const body = (await r.json()) as { errors?: { message: string }[] };
        setError(body.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function autoDetectTz() {
    const tz = detectClientTimezone();
    if (tz) setTimezone(tz);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5 rounded border border-border bg-bg-1 p-5"
    >
      <FormError message={error} onDismiss={() => setError(null)} />
      <section className="flex items-center gap-4">
        <Avatar name={fullName || email} size="md" />
        <div className="flex-1">
          <div className="text-xs text-text-3">Signed in as</div>
          <div className="font-mono text-sm text-text-0">{email}</div>
        </div>
      </section>

      <Field label="Full name" hint="Shown next to your comments and mentions.">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Zack McKerley"
          maxLength={120}
          className="w-full rounded-sm border border-border bg-bg-0 px-3 py-2 text-sm text-text-0 outline-none focus:border-border-focus"
        />
      </Field>

      <Field
        label="Avatar URL"
        hint="Paste a link to a square image. Leave blank to use your initials."
      >
        <input
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…/avatar.png"
          className="w-full rounded-sm border border-border bg-bg-0 px-3 py-2 text-sm text-text-0 outline-none focus:border-border-focus"
        />
      </Field>

      <Field
        label="Timezone"
        hint="IANA format (e.g. America/New_York). Teammates see your local time."
      >
        <div className="flex gap-2">
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="America/New_York"
            className="flex-1 rounded-sm border border-border bg-bg-0 px-3 py-2 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <button
            type="button"
            onClick={autoDetectTz}
            className="rounded-sm border border-border bg-bg-2 px-3 py-2 text-xs text-text-1 hover:bg-bg-3"
          >
            Detect
          </button>
        </div>
      </Field>

      <footer className="flex items-center justify-between">
        {savedAt ? (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" /> Saved
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={saving}
          className="rounded-sm bg-accent px-4 py-2 text-sm text-bg-0 hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </footer>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-text-3">
        {label}
      </span>
      {children}
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </label>
  );
}
